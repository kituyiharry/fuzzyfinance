/*!
 * build.rs for alloy-sys
 *
 * Resolves libminizinc in this priority order:
 *   1. MINIZINC_ROOT env var  — prefix with /include and /lib subdirs
 *   2. pkg-config minizinc    — link flags emitted automatically by the crate
 *   3. Source build           — CMake from vendor/libminizinc (git submodule)
 *                               or cloned into $OUT_DIR/libminizinc-src
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
    println!("cargo:rerun-if-changed=cpp/mzn_shim.h");
    println!("cargo:rerun-if-changed=cpp/mzn_shim.cpp");

    let (include_dir, lib_dir_opt) = find_libminizinc();

    compile_shim(&include_dir);

    if let Some(lib_dir) = lib_dir_opt {
        // pkg-config path already emitted its own link directives; only emit
        // when we found the library via MINIZINC_ROOT or a source build.
        emit_link_directives(&lib_dir);
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
        // Explicit plugin opt-outs (option() level)
        //.define("GECODE_PLUGIN",  "OFF")
        //.define("BUILD_GECODE",  "OFF")
        //.define("CHUFFED_PLUGIN", "OFF")
        //.define("BULD_CHUFFED", "OFF")
        //.define("BULD_ATLANTIS", "OFF")
        //.define("BUILD_CPLEX",   "OFF")
        //.define("CPLEX_PLUGIN",   "OFF")
        //.define("GUROBI_PLUGIN",  "OFF")
        //.define("BUILD_HIGHS",   "OFF")
        //.define("HIGHS_PLUGIN",   "OFF")
        //.define("BUILD_SCIP",    "OFF")
        //.define("BUILD_XPRESS",  "OFF")
        //.define("SCIP_PLUGIN",    "OFF")
        //.define("XPRESS_PLUGIN",  "OFF")
        // Belt-and-suspenders: prevent find_package() even when the option
        // check comes after the search call (CMake ≥ 3.22 honours this for
        // REQUIRED packages too).
        //.define("CMAKE_DISABLE_FIND_PACKAGE_atlantis",   "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_CPlex",   "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_Gurobi",  "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_HIGHS",   "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_chuffed", "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_Gecode",  "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_SCIP",    "ON")
        //.define("CMAKE_DISABLE_FIND_PACKAGE_XPRESS",  "ON")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .define("CMAKE_COMPILE_WARNING_AS_ERROR", "OFF")
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

    // Make sure the script is executable (no-op on Windows, harmless).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&script)
            .expect("stat download_vendor")
            .permissions();
        perms.set_mode(perms.mode() | 0o111);
        std::fs::set_permissions(&script, perms).expect("chmod download_vendor");
    }

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

/* ── link directives (only when pkg-config did NOT handle it) ────────────── */

fn emit_link_directives(lib_dir: &Path) {
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    // https://github.com/coin-or/Cbc.git (Version 2.10.13)
    println!("cargo:rustc-link-search=native=/opt/homebrew/Cellar/cbc/2.10.13/lib");
    // https://github.com/coin-or/Cgl.git (Version 0.60.10)
    println!("cargo:rustc-link-search=native=/opt/homebrew/Cellar/cgl/0.60.10/lib");
    // https://github.com/coin-or/Clp.git (Version 1.17.11)
    println!("cargo:rustc-link-search=native=/opt/homebrew/Cellar/clp/1.17.11/lib");
    // https://github.com/coin-or/Osi.git (Version 0.108.12)
    println!("cargo:rustc-link-search=native=/opt/homebrew/Cellar/osi/0.108.12/lib");
    // https://github.com/coin-or/CoinUtils.git (Version 2.11.13)
    println!("cargo:rustc-link-search=native=/opt/homebrew/Cellar/coinutils/2.11.13/lib");
    // https://github.com/Gecode/gecode/tree/release/6.3.0 (version 6.3.0 from git)
    println!("cargo:rustc-link-search=native=/Users/harrykwakuloba/Developer/CPP/gecode/");
    //println!("cargo:rustc-link-lib=static=minizinc");
    //println!("cargo:rustc-link-lib=static=libmzn");
    println!("cargo:rustc-link-lib=static=mzn");
    println!("cargo:rustc-link-lib=static=mzn_shim");
    println!("cargo:rustc-link-lib=gecodeflatzinc");
    println!("cargo:rustc-link-lib=gecodedriver");
    println!("cargo:rustc-link-lib=gecodeminimodel");
    println!("cargo:rustc-link-lib=gecodesearch");
    println!("cargo:rustc-link-lib=gecodeint");
    println!("cargo:rustc-link-lib=gecodeset");
    println!("cargo:rustc-link-lib=gecodefloat");
    println!("cargo:rustc-link-lib=gecodekernel");
    println!("cargo:rustc-link-lib=gecodesupport");  // last — lowest level
    println!("cargo:rustc-link-lib=CbcSolver");
    println!("cargo:rustc-link-lib=Cbc");
    println!("cargo:rustc-link-lib=Cgl");          // add this
    println!("cargo:rustc-link-lib=OsiCbc");
    println!("cargo:rustc-link-lib=OsiClp");
    println!("cargo:rustc-link-lib=Clp");
    println!("cargo:rustc-link-lib=Osi");
    println!("cargo:rustc-link-lib=CoinUtils");

    //println!("cargo:rustc-link-arg=-Wl,--copy-dt-needed-entries");


    // C++ standard library
    if cfg!(target_os = "macos") {
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
        .allowlist_function("^minizinc_.*")
        .allowlist_type("^MiniZinc.*")
        .allowlist_type("^Highs_.*")
        .allowlist_type("^Cbc*")
        .allowlist_type("^Clp*")
        .allowlist_type("^Cgl*")
        .allowlist_type("^Coin*")
        .allowlist_type("^Osi*")
        .allowlist_type("^MiniZinc.*")
        .allowlist_type("^Gecode.*")
        .clang_arg("-xc++")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("bindgen failed to generate bindings")
        .write_to_file(&out_path)
        .expect("failed to write bindings.rs");
}
