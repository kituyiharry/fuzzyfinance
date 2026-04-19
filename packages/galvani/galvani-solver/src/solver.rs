use galvani_parser::ast::Model;
use crate::backend::{Backend, SolveResult};

pub struct Solver<B: Backend> {
    backend: B,
}

impl<B: Backend> Solver<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    pub fn solve(&mut self, model: &Model) -> SolveResult {
        self.backend.solve(model)
    }
}
