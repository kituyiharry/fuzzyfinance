use galvani_parser::ast::Model;
use galvani_solver::backend::{Backend, SolveResult};

/// Placeholder backend — always returns Unknown.
pub struct StubBackend;

impl Backend for StubBackend {
    fn solve(&mut self, _model: &Model) -> SolveResult {
        SolveResult::Unknown
    }
}
