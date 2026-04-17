//! Pluggable solver backend interface.
//!
//! # How it works
//!
//! The MiniZinc compilation pipeline is split at the FlatZinc boundary:
//!
//! ```text
//! .mzn + .dzn
//!     │
//!     │  libminizinc  (always — type-checking, flattening, instantiation)
//!     ▼
//!  FlatZinc  ────────────────────────────────────────────┐
//!     │                                                   │
//!     │  LibminizincBackend        YourBackend (future)   │
//!     │  (default)                 impl SolverBackend     │
//!     ▼                                ▼                  │
//!  solutions                       solutions              │
//! ```
//!
//! # Implementing a custom backend
//!
//! ```rust,no_run
//! use alloy::{SolverBackend, FlatZinc, SolveOptions, SolveResponse, SolveError};
//!
//! pub struct MySolver { /* your state here */ }
//!
//! impl SolverBackend for MySolver {
//!     fn id(&self) -> &str { "my-solver" }
//!
//!     fn solve_fzn(
//!         &self,
//!         fzn: &FlatZinc,
//!         opts: &SolveOptions,
//!     ) -> Result<SolveResponse, SolveError> {
//!         // Parse fzn.source, run your solver, return results.
//!         // The output field should follow MiniZinc output format:
//!         // each solution as "var = val;\n", separated by "----------\n",
//!         // with "==========\n" at the end for optimisation problems.
//!         todo!()
//!     }
//! }
//! ```
//!
//! Register it in `alloy-server` by passing it to `AppState::new()`.

use std::path::PathBuf;
use crate::types::{SolveError, SolveOptions, SolveResponse};

/// A compiled FlatZinc model, ready to be sent to a solver backend.
///
/// Produced by [`crate::compile`]. Treat this as an opaque value — the
/// `source` field is the raw FlatZinc text if you need to inspect it.
#[derive(Debug, Clone)]
pub struct FlatZinc {
    /// Raw FlatZinc source text.
    pub source: String,
}

/// The extensibility seam: any type that can solve a [`FlatZinc`] model.
///
/// Implement this trait to plug your own solver into `alloy-server` without
/// changing any other code.
///
/// # Thread safety
/// Implementations must be `Send + Sync` so they can be stored in an
/// `Arc<dyn SolverBackend>` and shared across Tokio tasks.
///
/// # Blocking
/// `solve_fzn` is a **blocking** call. The server always dispatches it via
/// `tokio::task::spawn_blocking`; you do not need to make it async.
pub trait SolverBackend: Send + Sync {
    /// Stable identifier for this backend (e.g. `"libminizinc"`, `"my-solver"`).
    /// Used in log messages and — optionally — for backend selection by the client.
    fn id(&self) -> &str;

    /// Solve a compiled FlatZinc model and return results.
    ///
    /// # Output format
    /// The `output` field of `SolveResponse` should contain the standard
    /// MiniZinc solution stream:
    /// - One or more solution blocks, each terminated by `----------\n`
    /// - `==========\n` at the very end for optimisation / all-solutions mode
    ///
    /// If your solver uses a different representation, convert it here before
    /// returning so that clients always receive a consistent format.
    fn solve_fzn(&self, fzn: &FlatZinc, opts: &SolveOptions) -> Result<SolveResponse, SolveError>;

    /// Whether this backend can return solutions at all (default: true).
    /// Return `false` for a stub / not-yet-implemented backend to get a
    /// clean error instead of a panic.
    fn is_available(&self) -> bool {
        true
    }
}

/// The built-in backend: uses libminizinc's bundled FlatZinc solver.
///
/// This is the default backend registered in `alloy-server`. It calls
/// [`crate::solver::solve_fzn_libmzn`] which writes the FlatZinc to a
/// short-lived temp file and invokes `MznSolver::run()`.
#[derive(Debug, Clone)]
pub struct LibminizincBackend {
    /// Path to the MiniZinc standard library share directory.
    pub stdlib_dir: PathBuf,
    /// Which libminizinc solver to use. `None` → libminizinc default.
    pub solver_id: Option<String>,
}

impl SolverBackend for LibminizincBackend {
    fn id(&self) -> &str {
        "libminizinc"
    }

    fn solve_fzn(&self, fzn: &FlatZinc, opts: &SolveOptions) -> Result<SolveResponse, SolveError> {
        crate::solver::solve_fzn_libmzn(
            fzn,
            opts,
            &self.stdlib_dir,
            self.solver_id.as_deref(),
        )
    }
}

/// A placeholder backend that immediately returns an error.
///
/// Register this during development so the server starts cleanly before your
/// solver is implemented. Replace it with the real implementation when ready.
pub struct StubBackend {
    pub name: &'static str,
}

impl SolverBackend for StubBackend {
    fn id(&self) -> &str { self.name }

    fn is_available(&self) -> bool { false }

    fn solve_fzn(&self, _fzn: &FlatZinc, _opts: &SolveOptions) -> Result<SolveResponse, SolveError> {
        Err(SolveError::BackendUnavailable(self.name))
    }
}
