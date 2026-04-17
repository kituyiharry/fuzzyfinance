use std::{env, path::PathBuf};

/// Which FlatZinc solver backend the server uses.
///
/// Set `ALLOY_BACKEND` to one of the variant names (case-insensitive) to switch:
/// - `"libminizinc"` (default) — uses the bundled libminizinc FZN solver
/// - `"stub"` — always returns an error; useful for development before your solver is ready
///
/// When you implement a custom backend, add a variant here and instantiate it in `main`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendKind {
    /// Built-in libminizinc FlatZinc solver.
    /// `solver_id` selects which installed MZN solver to use (e.g. `"org.gecode.gecode"`).
    /// `None` → libminizinc default.
    Libminizinc { solver_id: Option<String> },
    /// Placeholder — returns `BackendUnavailable` immediately.
    Stub,
}

impl BackendKind {
    fn from_env() -> Self {
        match env::var("ALLOY_BACKEND").as_deref() {
            Ok("stub") | Ok("Stub") => Self::Stub,
            // All other values (including "libminizinc" and unrecognised) use the default.
            _ => Self::Libminizinc {
                solver_id: env::var("ALLOY_SOLVER_ID").ok(),
            },
        }
    }
}

/// Runtime configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    /// TCP port to listen on. Default: 3000.
    pub port: u16,
    /// Maximum number of concurrent solver calls. Default: 8.
    pub worker_limit: usize,
    /// Default solver timeout in ms when the client doesn't specify one. Default: 30000.
    pub default_timeout_ms: u32,
    /// Path to the MiniZinc standard library share/minizinc directory.
    /// Default: /opt/minizinc/share/minizinc (matches the Docker image layout).
    pub stdlib_dir: PathBuf,
    /// Which backend to instantiate on startup.
    pub backend: BackendKind,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env_u16("ALLOY_PORT", 3000),
            worker_limit: env_usize("ALLOY_WORKER_LIMIT", 8),
            default_timeout_ms: env_u32("ALLOY_DEFAULT_TIMEOUT_MS", 30_000),
            stdlib_dir: env_path("MZN_STDLIB_DIR", "/opt/minizinc/share/minizinc"),
            backend: BackendKind::from_env(),
        }
    }
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_path(key: &str, default: &str) -> PathBuf {
    env::var(key)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(default))
}
