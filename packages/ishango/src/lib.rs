//! Ishango — small Lisp evaluator (lex → parse → bytecode compile → stack VM).
//!
//! See `tests/programs.rs` for end-to-end examples.

pub mod ast;
pub mod builtins;
pub mod check;
pub mod compiler;
pub mod env;
pub mod error;
pub mod lexer;
pub mod parser;
pub mod ty;
pub mod value;
pub mod vm;

pub use error::{Error, Stage};
pub use ty::Type;
pub use value::Value;

/// Lex, parse, type-check, compile, and run `source` with the standard
/// prelude installed. Returns the value of the last form, or an error.
pub fn run(source: &str) -> Result<Value, Error> {
    let mut globals = env::Globals::new();
    builtins::install_prelude(&mut globals);
    run_with(source, &mut globals)
}

/// Same as `run` but reuses a caller-supplied `Globals` (useful for REPL
/// sessions or for callers that want to register their own host bindings
/// before evaluation). The checker's `type_env` lives on `Globals` too,
/// so REPL lines benefit from cumulative type info on `define`d names.
pub fn run_with(source: &str, globals: &mut env::Globals) -> Result<Value, Error> {
    let tokens = lexer::tokenize(source)?;
    let forms  = parser::parse(&tokens)?;
    check::check_program(&forms, globals)?;
    let chunk  = compiler::compile(&forms, globals)?;
    let mut vm = vm::Vm::new(globals);
    vm.run(chunk)
}

/// Type-check without running. Convenient for tests + tools that want to
/// surface type errors before evaluation.
pub fn type_check(source: &str) -> Result<(), Error> {
    let mut globals = env::Globals::new();
    builtins::install_prelude(&mut globals);
    type_check_with(source, &mut globals)
}

pub fn type_check_with(source: &str, globals: &mut env::Globals) -> Result<(), Error> {
    let tokens = lexer::tokenize(source)?;
    let forms  = parser::parse(&tokens)?;
    check::check_program(&forms, globals)
}
