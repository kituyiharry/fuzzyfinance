use std::path::PathBuf;
use serde::Serialize;
use thiserror::Error;

/* ── requests ──────────────────────────────────────────────────────────────── */

/// Input for [`crate::solve`] — the end-to-end (Pipeline A) path.
#[derive(Debug, Clone)]
pub struct SolveRequest {
    /// Complete MiniZinc model source.
    pub model: String,
    /// Optional DZN data (appended to model).
    pub data: Option<String>,
    /// Solver ID (e.g. `"org.gecode.gecode"`). `None` → default solver.
    pub solver: Option<String>,
    /// Time limit passed to the solver in ms. `0` → no limit.
    pub timeout_ms: u32,
    /// Path to the MiniZinc share/minizinc directory.
    pub stdlib_dir: PathBuf,
}

/// Input for [`crate::compile`] — MiniZinc → FlatZinc (Pipeline B step 1).
#[derive(Debug, Clone)]
pub struct CompileRequest {
    /// Complete MiniZinc model source.
    pub model: String,
    /// Optional DZN data (appended to model).
    pub data: Option<String>,
    /// Path to the MiniZinc share/minizinc directory.
    pub stdlib_dir: PathBuf,
}

impl CompileRequest {
    /// Build a `CompileRequest` from the model/data parts of a `SolveRequest`.
    pub fn from_solve(req: &SolveRequest) -> Self {
        Self {
            model: req.model.clone(),
            data: req.data.clone(),
            stdlib_dir: req.stdlib_dir.clone(),
        }
    }
}

/// Options for the FlatZinc solve step ([`crate::SolverBackend::solve_fzn`]).
#[derive(Debug, Clone)]
pub struct SolveOptions {
    /// Solver time limit in ms. `0` → no limit.
    pub timeout_ms: u32,
    /// Solver preference. `None` → backend's own default.
    pub solver_id: Option<String>,
}

impl SolveOptions {
    pub fn from_solve(req: &SolveRequest) -> Self {
        Self {
            timeout_ms: req.timeout_ms,
            solver_id: req.solver.clone(),
        }
    }
}

/* ── response ──────────────────────────────────────────────────────────────── */

/// Result of a solve call (from either pipeline).
#[derive(Debug, Clone, Serialize)]
pub struct SolveResponse {
    pub status: SolveStatus,
    /// Raw MiniZinc output stream (solutions separated by `----------\n`,
    /// `==========\n` for OPT / all-solutions termination).
    pub output: String,
    /// Error message when `status == Error`.
    pub error: Option<String>,
    /// Wall-clock time for the solve step in milliseconds.
    pub time_ms: u64,
}

/// Solver outcome. Mapped from `MiniZinc::SolverInstance::Status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SolveStatus {
    Sat,
    Opt,
    Unsat,
    Unbounded,
    UnsatOrUnbounded,
    Unknown,
    Error,
    None,
    /// HTTP-layer timeout fired before the solver finished.
    Timeout,
}

impl SolveStatus {
    pub(crate) fn from_int(v: i32) -> Self {
        match v {
            1 => Self::Sat,
            2 => Self::Opt,
            3 => Self::Unsat,
            4 => Self::Unbounded,
            5 => Self::UnsatOrUnbounded,
            7 => Self::None,
            6 => Self::Error,
            _ => Self::Unknown,
        }
    }
}

/* ── errors ────────────────────────────────────────────────────────────────── */

#[derive(Debug, Error)]
pub enum SolveError {
    #[error("input contains a null byte")]
    NulInInput,

    #[error("compilation failed: {0}")]
    Compile(String),

    #[error("solver reported error: {0}")]
    Solver(String),

    #[error("backend '{0}' is not yet implemented")]
    BackendUnavailable(&'static str),

    #[error("tokio join error (spawn_blocking panicked)")]
    Join,
}
