use thiserror::Error;

use crate::ast::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    Lex,
    Parse,
    /// Static type checker (bidirectional, optional `the` annotations).
    Type,
    Compile,
    Runtime,
}

#[derive(Debug, Error)]
#[error("{stage:?} error: {message}{}", span.map(|s| format!(" at {}:{}", s.line, s.col)).unwrap_or_default())]
pub struct Error {
    pub stage:   Stage,
    pub message: String,
    pub span:    Option<Span>,
}

impl Error {
    pub fn lex(msg: impl Into<String>, span: Span) -> Self {
        Self { stage: Stage::Lex, message: msg.into(), span: Some(span) }
    }
    pub fn parse(msg: impl Into<String>, span: Option<Span>) -> Self {
        Self { stage: Stage::Parse, message: msg.into(), span }
    }
    pub fn compile(msg: impl Into<String>) -> Self {
        Self { stage: Stage::Compile, message: msg.into(), span: None }
    }
    pub fn type_error(msg: impl Into<String>, span: Option<Span>) -> Self {
        Self { stage: Stage::Type, message: msg.into(), span }
    }
    pub fn runtime(msg: impl Into<String>) -> Self {
        Self { stage: Stage::Runtime, message: msg.into(), span: None }
    }
}
