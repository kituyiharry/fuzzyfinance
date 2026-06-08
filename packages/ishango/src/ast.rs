#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub line: u32,
    pub col:  u32,
}

impl Span {
    pub const fn new(line: u32, col: u32) -> Self {
        Self { line, col }
    }
}

/// Source AST. Numbers and strings are kept as parsed literals; the compiler
/// converts them into runtime `Value`s when populating the constant pool.
#[derive(Debug, Clone)]
pub enum Expr {
    Nil(Span),
    Bool(bool, Span),
    Int(i64, Span),
    Float(f64, Span),
    Str(String, Span),
    Sym(String, Span),
    List(Vec<Expr>, Span),
    Quote(Box<Expr>, Span),
}

impl Expr {
    pub fn span(&self) -> Span {
        match self {
            Expr::Nil(s)
            | Expr::Bool(_, s)
            | Expr::Int(_, s)
            | Expr::Float(_, s)
            | Expr::Str(_, s)
            | Expr::Sym(_, s)
            | Expr::List(_, s)
            | Expr::Quote(_, s) => *s,
        }
    }
}
