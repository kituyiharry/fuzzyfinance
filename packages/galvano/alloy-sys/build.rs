/*!
 * build.rs for alloy-sys
 *
 * Resolves libminizinc in this priority order:
 *   1. MINIZINC_ROOT env var  — prefix with /include and /lib subdirs
 *   2. pkg-config minizinc    — link flags emitted automatically by the crate
 *   3. Source build           — CMake from vendor/libminizinc (git submodule)
 *                               or cloned into $OUT_DIR/libminizinc-src
 *
 * Solver dependencies (Gecode, COIN-OR stack) are always built from source
 * at pinned versions and linked statically unless ALLOY_USE_SYSTEM_DEPS=1.
 *
 * After finding the library, compiles the C++ shim via cc and runs bindgen.
 */

#![allow(missing_unsafe_on_extern)]

use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    println!("cargo:rerun-if-env-changed=MINIZINC_ROOT");
    println!("cargo:rerun-if-env-changed=ALLOY_USE_SYSTEM_DEPS");
    println!("cargo:rerun-if-changed=cpp/mzn_shim.h");
    println!("cargo:rerun-if-changed=cpp/mzn_shim.cpp");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let (include_dir, lib_dir_opt) = find_libminizinc();

    compile_shim(&include_dir);

    if let Some(lib_dir) = lib_dir_opt {
        let vendor = build_vendor_deps(&out_dir);
        emit_link_directives(&lib_dir, &vendor);
    }

    run_bindgen(&include_dir);
}

/* ── find libminizinc ─────────────────────────────────────────────────────── */

/// Returns `(include_dir, Option<lib_dir>)`.
/// `lib_dir` is `None` when pkg-config was used (it already emitted link flags).
fn find_libminizinc() -> (PathBuf, Option<PathBuf>) {
    // 1. MINIZINC_ROOT env var
    if let Ok(root) = env::var("MINIZINC_ROOT") {
        let root = PathBuf::from(&root);
        let inc = root.join("include");
        let lib = root.join("lib");
        if inc.exists() {
            eprintln!("cargo:warning=[alloy-sys] Using MINIZINC_ROOT={}", root.display());
            return (inc, Some(lib));
        }
    }

    // 2. pkg-config (emits rustc-link-lib, rustc-link-search automatically)
    if let Ok(lib) = pkg_config::probe_library("minizinc") {
        if let Some(inc) = lib.include_paths.first() {
            eprintln!("cargo:warning=[alloy-sys] Using pkg-config minizinc");
            // Return None for lib_dir — link flags already emitted.
            return (inc.to_path_buf(), None);
        }
    }

    // 3. Source build
    eprintln!("cargo:warning=[alloy-sys] Building libminizinc from source (slow on first run)");
    let (inc, lib) = build_from_source();
    (inc, Some(lib))
}

fn build_from_source() -> (PathBuf, PathBuf) {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace_dir = manifest_dir.parent().unwrap().to_path_buf();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    // Prefer vendor/ submodule, fall back to cloning.
    let vendor = workspace_dir.join("vendor").join("libminizinc");
    let src_dir = if vendor.join("CMakeLists.txt").exists() {
        vendor
    } else {
        clone_libminizinc(&out_dir)
    };

    // Download vendored dependencies (solver interfaces, parser generators, etc.)
    // required by the libminizinc CMake build.
    run_download_vendor(&src_dir);

    let dst = cmake::Config::new(&src_dir)
        .define("CMAKE_BUILD_TYPE", "Release")
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("BUILD_MINIZINC", "OFF") // skip the CLI — library only
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .define("CMAKE_COMPILE_WARNING_AS_ERROR", "OFF")
        // Belt-and-suspenders: prevent find_package() even when the option
        // check comes after the search call (CMake ≥ 3.22 honours this for
        // REQUIRED packages too).
        .define("CMAKE_DISABLE_FIND_PACKAGE_atlantis", "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_CPlex",    "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_Gurobi",   "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_HIGHS",    "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_chuffed",  "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_Gecode",   "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_SCIP",     "ON")
        .define("CMAKE_DISABLE_FIND_PACKAGE_XPRESS",   "ON")
        .build();

    (dst.join("include"), dst.join("lib"))
}

fn clone_libminizinc(out_dir: &Path) -> PathBuf {
    const TAG: &str = "2.9.5";
    let src = out_dir.join("libminizinc-src");
    if !src.join("CMakeLists.txt").exists() {
        let status = Command::new("git")
            .args([
                "clone",
                "--depth", "1",
                "--branch", TAG,
                "https://github.com/MiniZinc/libminizinc.git",
            ])
            .arg(&src)
            .status()
            .expect("git not found — install git or add vendor/libminizinc as a submodule");
        assert!(status.success(), "git clone of libminizinc {TAG} failed");
    }
    src
}

/// Run `./download_vendor` at the root of the libminizinc source tree.
///
/// This script downloads vendored solver interface headers and parser generators
/// that libminizinc's CMake build requires. It is idempotent — if the `vendor/`
/// directory is already populated the script exits quickly, so we always call it.
fn run_download_vendor(src_dir: &Path) {
    let script = src_dir.join("download_vendor");
    if !script.exists() {
        eprintln!(
            "cargo:warning=[alloy-sys] download_vendor not found at {}; skipping",
            script.display()
        );
        return;
    }

    eprintln!(
        "cargo:warning=[alloy-sys] Running download_vendor in {}",
        src_dir.display()
    );

    chmod_x(&script);

    let status = Command::new(&script)
        .current_dir(src_dir)
        .status()
        .unwrap_or_else(|e| panic!("failed to run download_vendor: {e}"));

    assert!(
        status.success(),
        "download_vendor failed with exit code {:?}",
        status.code()
    );
}

/* ── vendor solver deps (Gecode + COIN-OR) ───────────────────────────────── */

/// Resolved lib directories for each vendor dependency.
struct VendorInstalls {
    gecode_lib:    PathBuf,
    coinutils_lib: PathBuf,
    osi_lib:       PathBuf,
    clp_lib:       PathBuf,
    cgl_lib:       PathBuf,
    cbc_lib:       PathBuf,
}

impl VendorInstalls {
    /// Escape-hatch: use the pre-installed system/Homebrew libraries instead of
    /// building from source. Activated by setting `ALLOY_USE_SYSTEM_DEPS=1`.
    fn system_paths() -> Self {
        eprintln!("cargo:warning=[alloy-sys] ALLOY_USE_SYSTEM_DEPS set — using system libraries");
        Self {
            // https://github.com/Gecode/gecode/tree/release/6.3.0
            gecode_lib:    PathBuf::from("/Users/harrykwakuloba/Developer/CPP/gecode"),
            // https://github.com/coin-or/CoinUtils.git (Version 2.11.13)
            coinutils_lib: PathBuf::from("/opt/homebrew/Cellar/coinutils/2.11.13/lib"),
            // https://github.com/coin-or/Osi.git (Version 0.108.12)
            osi_lib:       PathBuf::from("/opt/homebrew/Cellar/osi/0.108.12/lib"),
            // https://github.com/coin-or/Clp.git (Version 1.17.11)
            clp_lib:       PathBuf::from("/opt/homebrew/Cellar/clp/1.17.11/lib"),
            // https://github.com/coin-or/Cgl.git (Version 0.60.10)
            cgl_lib:       PathBuf::from("/opt/homebrew/Cellar/cgl/0.60.10/lib"),
            // https://github.com/coin-or/Cbc.git (Version 2.10.13)
            cbc_lib:       PathBuf::from("/opt/homebrew/Cellar/cbc/2.10.13/lib"),
        }
    }
}

/// Orchestrate the vendor dependency builds.
/// Build order for COIN-OR is strict: each package finds earlier ones via PKG_CONFIG_PATH.
fn build_vendor_deps(out_dir: &Path) -> VendorInstalls {
    if env::var("ALLOY_USE_SYSTEM_DEPS").is_ok() {
        return VendorInstalls::system_paths();
    }

    // COIN-OR — strict serial build order
    let coinutils = build_coinutils(out_dir);
    let osi       = build_osi(out_dir,  &pkgcfg_path(&[&coinutils]));
    let clp       = build_clp(out_dir,  &pkgcfg_path(&[&coinutils, &osi]));
    let cgl       = build_cgl(out_dir,  &pkgcfg_path(&[&coinutils, &osi, &clp]));
    let cbc       = build_cbc(out_dir,  &pkgcfg_path(&[&coinutils, &osi, &clp, &cgl]));

    // Gecode — independent, build after COIN-OR to not compete for make threads
    let gecode    = build_gecode(out_dir);

    VendorInstalls {
        gecode_lib:    gecode.join("lib"),
        coinutils_lib: coinutils.join("lib"),
        osi_lib:       osi.join("lib"),
        clp_lib:       clp.join("lib"),
        cgl_lib:       cgl.join("lib"),
        cbc_lib:       cbc.join("lib"),
    }
}

/// Join `lib/pkgconfig` dirs from multiple install prefixes into a `:`-separated path.
fn pkgcfg_path(installs: &[&PathBuf]) -> String {
    installs
        .iter()
        .map(|p| p.join("lib/pkgconfig").to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":")
}

/* ── per-library builders ─────────────────────────────────────────────────── */

fn build_coinutils(out_dir: &Path) -> PathBuf {
    let src = clone_dep(
        "coinutils",
        "https://github.com/coin-or/CoinUtils.git",
        "releases/2.11.13",
        out_dir,
    );
    let install = out_dir.join("coinutils-install");
    autoconf_build("CoinUtils", &src, &install, &[], "", "lib/libCoinUtils.a");
    install
}

fn build_osi(out_dir: &Path, pkg_cfg: &str) -> PathBuf {
    let src = clone_dep(
        "osi",
        "https://github.com/coin-or/Osi.git",
        "releases/0.108.12",
        out_dir,
    );
    let install = out_dir.join("osi-install");
    autoconf_build("Osi", &src, &install, &[], pkg_cfg, "lib/libOsi.a");
    install
}

fn build_clp(out_dir: &Path, pkg_cfg: &str) -> PathBuf {
    let src = clone_dep(
        "clp",
        "https://github.com/coin-or/Clp.git",
        "releases/1.17.11",
        out_dir,
    );
    let install = out_dir.join("clp-install");

    // Clp benefits from BLAS for performance. On macOS use the bundled Accelerate
    // framework; on Linux let autoconf find system BLAS or omit.
    let blas_extra: Vec<&str> = if cfg!(target_os = "macos") {
        vec!["--with-blas=-framework Accelerate"]
    } else {
        vec![]
    };

    autoconf_build("Clp", &src, &install, &blas_extra, pkg_cfg, "lib/libClp.a");
    install
}

fn build_cgl(out_dir: &Path, pkg_cfg: &str) -> PathBuf {
    let src = clone_dep(
        "cgl",
        "https://github.com/coin-or/Cgl.git",
        "releases/0.60.10",
        out_dir,
    );
    let install = out_dir.join("cgl-install");
    autoconf_build("Cgl", &src, &install, &[], pkg_cfg, "lib/libCgl.a");
    install
}

fn build_cbc(out_dir: &Path, pkg_cfg: &str) -> PathBuf {
    let src = clone_dep(
        "cbc",
        "https://github.com/coin-or/Cbc.git",
        "releases/2.10.13",
        out_dir,
    );
    let install = out_dir.join("cbc-install");
    autoconf_build("Cbc", &src, &install, &[], pkg_cfg, "lib/libCbc.a");
    install
}

fn build_gecode(out_dir: &Path) -> PathBuf {
    let src = clone_dep(
        "gecode",
        "https://github.com/Gecode/gecode.git",
        "release/6.3.0",
        out_dir,
    );
    let install = out_dir.join("gecode-install");
    autoconf_build(
        "Gecode",
        &src,
        &install,
        &[
            "--disable-qt",
            "--disable-gist",
            "--disable-examples",
            "--disable-doc-dot",
            "--disable-doc-search",
            "--disable-doc-tagfile",
            "--disable-doc-chm",
            "--disable-doc-docset",
        ],
        "",
        "lib/libgecodekernel.a",
    );
    install
}

/* ── autoconf build helper ────────────────────────────────────────────────── */

/// Clone a dependency at a specific git tag into `$out_dir/<name>-src`.
/// Returns the source directory. Skips the clone if the directory already exists.
fn clone_dep(name: &str, url: &str, tag: &str, out_dir: &Path) -> PathBuf {
    let src = out_dir.join(format!("{name}-src"));
    // Skip if already cloned (configure or CMakeLists.txt present)
    if src.join("configure").exists() || src.join("CMakeLists.txt").exists() {
        return src;
    }
    eprintln!("cargo:warning=[alloy-sys] Cloning {name} {tag}");
    let status = Command::new("git")
        .args(["clone", "--depth", "1", "--branch", tag, url])
        .arg(&src)
        .status()
        .unwrap_or_else(|e| panic!("git not found: {e}"));
    assert!(status.success(), "git clone of {name} {tag} failed");
    src
}

/// Configure, build, and install a library using the autoconf/make toolchain.
///
/// - `name`           — human-readable name for log messages
/// - `src_dir`        — root of the source checkout
/// - `install_dir`    — `--prefix` target; receives headers and `.a` files
/// - `extra_args`     — extra flags forwarded to `./configure`
/// - `pkg_config_path`— colon-separated path exported as `PKG_CONFIG_PATH`
///                      so configure can find earlier COIN-OR dependencies
/// - `sentinel`       — path relative to `install_dir` that signals a complete
///                      build (checked before running — skips if already present)
fn autoconf_build(
    name: &str,
    src_dir: &Path,
    install_dir: &Path,
    extra_args: &[&str],
    pkg_config_path: &str,
    sentinel: &str,
) {
    if install_dir.join(sentinel).exists() {
        eprintln!("cargo:warning=[alloy-sys] {name} already installed, skipping");
        return;
    }

    eprintln!(
        "cargo:warning=[alloy-sys] Building {name} → {}",
        install_dir.display()
    );

    // Generate `configure` from `configure.ac` if the release tag omitted it.
    let configure = src_dir.join("configure");
    if !configure.exists() {
        eprintln!("cargo:warning=[alloy-sys] {name}: running autoreconf -i");
        run_cmd("autoreconf", &["-i"], src_dir, "");
    }
    chmod_x(&configure);

    let j = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .to_string();

    let prefix_arg = format!("--prefix={}", install_dir.display());
    let mut args: Vec<&str> = vec![
        prefix_arg.as_str(),
        "--disable-shared",
        "--enable-static",
    ];
    args.extend_from_slice(extra_args);

    run_cmd("./configure", &args, src_dir, pkg_config_path);
    run_cmd("make", &["-j", j.as_str()], src_dir, pkg_config_path);
    run_cmd("make", &["install"], src_dir, pkg_config_path);

    assert!(
        install_dir.join(sentinel).exists(),
        "{name} build succeeded but sentinel '{sentinel}' not found in {}",
        install_dir.display()
    );
}

/// Run an external command, asserting it exits successfully.
fn run_cmd(prog: &str, args: &[&str], cwd: &Path, pkg_config_path: &str) {
    eprintln!(
        "cargo:warning=[alloy-sys] $ {prog} {}",
        args.join(" ")
    );
    let mut cmd = Command::new(prog);
    cmd.args(args).current_dir(cwd);
    if !pkg_config_path.is_empty() {
        cmd.env("PKG_CONFIG_PATH", pkg_config_path);
    }
    let status = cmd
        .status()
        .unwrap_or_else(|e| panic!("failed to spawn {prog}: {e}"));
    assert!(
        status.success(),
        "{prog} exited with {:?}",
        status.code()
    );
}

/// Make a file executable on Unix; no-op elsewhere.
fn chmod_x(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o111);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
}

/* ── compile C++ shim ─────────────────────────────────────────────────────── */

fn compile_shim(include_dir: &Path) {
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(include_dir)
        .file("cpp/mzn_shim.cpp")
        // Suppress warnings from libminizinc headers but keep our own errors visible.
        .warnings(false)
        // Always emit compiler output — cc-rs silences stderr on success but
        // on failure the real error message is the only useful diagnostic.
        .cargo_output(true);

    // On macOS use libc++; Linux/Windows use libstdc++.
    if cfg!(target_os = "macos") {
        build.flag("-stdlib=libc++");
        build.flag("-mmacosx-version-min=26.0");
    }

    build.compile("mzn_shim");
}

/* ── link directives ─────────────────────────────────────────────────────── */

fn emit_link_directives(mzn_lib_dir: &Path, v: &VendorInstalls) {
    // libminizinc
    println!("cargo:rustc-link-search=native={}", mzn_lib_dir.display());
    println!("cargo:rustc-link-lib=static=mzn");
    println!("cargo:rustc-link-lib=static=mzn_shim");

    // Gecode (most-dependent → least-dependent)
    println!("cargo:rustc-link-search=native={}", v.gecode_lib.display());
    for lib in &[
        "gecodeflatzinc",
        "gecodedriver",
        "gecodeminimodel",
        "gecodesearch",
        "gecodeint",
        "gecodeset",
        "gecodefloat",
        "gecodekernel",
        "gecodesupport",
    ] {
        println!("cargo:rustc-link-lib=static={lib}");
    }

    // COIN-OR (most-dependent → least-dependent)
    for lib_dir in &[
        &v.cbc_lib,
        &v.cgl_lib,
        &v.clp_lib,
        &v.osi_lib,
        &v.coinutils_lib,
    ] {
        println!("cargo:rustc-link-search=native={}", lib_dir.display());
    }
    for lib in &[
        "CbcSolver", "Cbc", "Cgl", "OsiClp", "OsiCbc", "Clp", "Osi", "CoinUtils",
    ] {
        println!("cargo:rustc-link-lib=static={lib}");
    }

    // CoinUtils compresses files via zlib and bzip2 — both must be linked.
    // On macOS these are system dylibs; on Linux install zlib1g-dev + libbz2-dev.
    println!("cargo:rustc-link-lib=z");
    println!("cargo:rustc-link-lib=bz2");

    // C++ standard library + BLAS (Accelerate provides both on macOS)
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=framework=Accelerate");
        println!("cargo:rustc-link-lib=c++");
    } else {
        println!("cargo:rustc-link-lib=stdc++");
    }
}

/* ── bindgen ─────────────────────────────────────────────────────────────── */

fn run_bindgen(include_dir: &Path) {
    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("bindings.rs");

    bindgen::Builder::default()
        .header("cpp/mzn_shim.h")
        .clang_arg(format!("-I{}", include_dir.display()))
        // Only expose the shim surface — not the full libminizinc header tree.
        .allowlist_type("MznResult")
        .allowlist_type("MznCompileResult")
        .allowlist_function("mzn_solve")
        .allowlist_function("mzn_compile")
        .allowlist_function("mzn_solve_fzn")
        .allowlist_function("mzn_list_solvers")
        .allowlist_function("mzn_free_result")
        .allowlist_function("mzn_free_compile_result")
        .allowlist_function("mzn_free_solvers")
        .clang_arg("-xc++")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("bindgen failed to generate bindings")
        .write_to_file(&out_path)
        .expect("failed to write bindings.rs");
}
