use galvani_parser::ast::Model;

pub enum SolveResult {
    Sat,
    Unsat,
    Unknown,
}

pub trait Backend {
    fn solve(&mut self, model: &Model) -> SolveResult;
}
