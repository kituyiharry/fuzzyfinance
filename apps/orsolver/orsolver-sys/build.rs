use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let src_dir = out_dir.join("or-tools-src");

    if !src_dir.join("CMakeLists.txt").exists() {
        let status = Command::new("git")
            .args([
                "clone",
                "--depth", "1",
                "--branch", "v9.15",
                "https://github.com/google/or-tools.git",
                src_dir.to_str().unwrap(),
            ])
            .status()
            .expect("git not found — ensure git is installed in the build environment");
        assert!(status.success(), "git clone of or-tools failed");
    }

    // Mirror Cargo's profile to cmake's build type so debug builds get
    // assertions/debug info and release builds are fully optimised.
    // bench maps to RelWithDebInfo — optimised but with symbols for profiling.
    let profile = env::var("PROFILE").unwrap_or_else(|_| "release".to_string());
    let cmake_build_type = match profile.as_str() {
        "debug" => "Debug",
        "bench" => "RelWithDebInfo",
        _       => "Release",
    };

    let in_docker = env::var("IS_DOCKER").is_ok();

    let mut cmake_cfg = cmake::Config::new(&src_dir);
    cmake_cfg
        .define("BUILD_FLATZINC", "ON")
        .define("BUILD_DEPS", "ON")
        .define("BUILD_SHARED_LIBS", "ON")
        .define("CMAKE_BUILD_TYPE", cmake_build_type)
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .define("BUILD_EXAMPLES", "OFF")
        .define("BUILD_SAMPLES", "OFF")
        .define("BUILD_TESTING", "OFF");

    if in_docker {
        // Inside Docker, Cargo's jobserver MAKEFLAGS pipe FDs are not
        // inherited by cmake's grandchild make processes, so lto-wrapper
        // fails with "Bad file descriptor". Disable LTO and clear MAKEFLAGS
        // so cmake manages its own parallelism cleanly.
        cmake_cfg
            .define("CMAKE_INTERPROCEDURAL_OPTIMIZATION", "OFF")
            .env("MAKEFLAGS", "");
    }

    let dst = cmake_cfg.build();

    let lib_dir = dst.join("lib");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());

    // Emit a link directive for every shared lib the cmake install produced.
    // On Linux .so files may carry version suffixes (libfoo.so.1.2) — skip
    // those and only emit the base name so the linker uses the soname.
    if lib_dir.exists() {
        for entry in fs::read_dir(&lib_dir).expect("lib dir missing") {
            let path: PathBuf = entry.unwrap().path();
            let is_dylib = if cfg!(target_os = "macos") {
                path.extension().and_then(|e| e.to_str()) == Some("dylib")
            } else {
                path.to_str().map(|s| s.ends_with(".so")).unwrap_or(false)
            };
            if is_dylib {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    println!("cargo:rustc-link-lib={}", stem.strip_prefix("lib").unwrap_or(stem));
                }
            }
        }
    }

    // C++ standard library (libc++ on Apple, libstdc++ elsewhere)
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=c++");
    } else {
        println!("cargo:rustc-link-lib=stdc++");
    }

    println!("cargo:rustc-link-lib=m");
    println!("cargo:rustc-link-lib=pthread");
    if cfg!(target_os = "linux") {
        println!("cargo:rustc-link-lib=dl");
    }

    println!("cargo:rerun-if-changed=ortools_fzn.h");
    println!("cargo:rerun-if-changed=ortools_fzn.cpp");

    // Include dirs: local shim, installed headers, OR-Tools source root,
    // and the bundled protobuf 5.x from cmake's FetchContent _deps so it
    // takes priority over any system/Homebrew protobuf headers.
    let mut include_dirs: Vec<PathBuf> = vec![
        PathBuf::from("."),
        dst.join("include"),
        src_dir.clone(),
    ];

    let deps_dir = out_dir.join("build").join("_deps");
    if deps_dir.exists() {
        if let Ok(entries) = fs::read_dir(&deps_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() { continue; }
                for candidate in [path.join("src"), path.clone()] {
                    if candidate.join("google/protobuf/port_def.inc").exists() {
                        include_dirs.insert(1, candidate);
                        break;
                    }
                }
            }
        }
    }

    // Compile the C++ shim — cc::Build inherits OPT_LEVEL/DEBUG from Cargo
    // automatically, so the shim matches the active profile without extra flags.
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .file("ortools_fzn.cpp")
        .flag_if_supported("-std=c++17")
        .flag_if_supported("-Wno-sign-compare")
        .flag_if_supported("-Wno-unused-parameter")
        .flag_if_supported("-Wno-range-loop-construct")
        .flag_if_supported("-Wno-invalid-offsetof")
        .define("OR_PROTO_DLL", "");
    for dir in &include_dirs {
        build.include(dir);
    }
    build.compile("orsolver_fzn");

    // Generate Rust bindings from the C header
    let mut bindgen_builder = bindgen::Builder::default()
        .header("ortools_fzn.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()));
    for dir in &include_dirs {
        bindgen_builder = bindgen_builder.clang_arg(format!("-I{}", dir.display()));
    }

    if cfg!(target_os = "macos") {
        let sdk = Command::new("xcrun")
            .args(["--sdk", "macosx", "--show-sdk-path"])
            .output()
            .expect("xcrun failed");
        let sdk_path = String::from_utf8_lossy(&sdk.stdout).trim().to_string();
        bindgen_builder = bindgen_builder
            .clang_arg("-isysroot")
            .clang_arg(sdk_path);
    }

    bindgen_builder
        .clang_args(&["-x", "c++", "-std=c++17", "-DOR_PROTO_DLL=", "-DEIGEN_MPL2_ONLY"])
        .generate()
        .expect("bindgen failed to generate bindings")
        .write_to_file(out_dir.join("bindings.rs"))
        .expect("failed to write bindings.rs");
}
