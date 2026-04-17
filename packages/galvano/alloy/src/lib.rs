//! **alloy** — safe Rust bindings to libminizinc with a pluggable solver backend.
//!
//! # Two solve pipelines
//!
//! ```text
//! Pipeline A (end-to-end):
//!   solve(SolveRequest) ──libminizinc──► SolveResponse
//!
//! Pipeline B (split):
//!   compile(CompileRequest) ──libminizinc──► FlatZinc
//!   backend.solve_fzn(FlatZinc, opts) ──your code──► SolveResponse
//! ```
//!
//! Use Pipeline A when libminizinc's built-in solvers are sufficient.
//! Use Pipeline B — via [`solve_with`] — to plug in your own solver.
//!
//! # Quick start
//!
//! ```no_run
//! use alloy::{SolveRequest, solve};
//! use std::path::PathBuf;
//!
//! let req = SolveRequest {
//!     model: "var 1..10: x; constraint x > 5; solve satisfy;".into(),
//!     data: None, solver: None, timeout_ms: 5_000,
//!     stdlib_dir: PathBuf::from("/opt/minizinc/share/minizinc"),
//! };
//! let resp = solve(&req).unwrap();
//! println!("{:?} — {}", resp.status, resp.output);
//! ```
//!
//! # Custom backend example
//!
//! ```no_run
//! use alloy::{SolverBackend, FlatZinc, SolveOptions, SolveResponse, SolveError};
//!
//! struct MySolver;
//! impl SolverBackend for MySolver {
//!     fn id(&self) -> &str { "my-solver" }
//!     fn solve_fzn(&self, fzn: &FlatZinc, opts: &SolveOptions)
//!         -> Result<SolveResponse, SolveError>
//!     {
//!         // parse fzn.source, run your algorithm, return results
//!         todo!()
//!     }
//! }
//!
//! use alloy::{SolveRequest, solve_with};
//! use std::path::PathBuf;
//!
//! let backend = MySolver;
//! let req = SolveRequest {
//!     model: "var 1..3: x; solve minimize x;".into(),
//!     data: None, solver: None, timeout_ms: 5_000,
//!     stdlib_dir: PathBuf::from("/opt/minizinc/share/minizinc"),
//! };
//! let resp = solve_with(&req, &backend).unwrap();
//! ```

pub mod backend;
pub mod compiler;
pub mod solver;
pub mod types;

// ── flat re-exports ───────────────────────────────────────────────────────────

pub use backend::{FlatZinc, LibminizincBackend, SolverBackend, StubBackend};
pub use compiler::compile;
pub use solver::{list_solvers, solve, solve_fzn_libmzn, solve_with};
pub use types::{
    CompileRequest, SolveError, SolveOptions, SolveRequest, SolveResponse, SolveStatus,
};
