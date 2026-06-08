//! Static type representation. Kept separate from `value.rs` (runtime
//! values) so the checker can be slotted in or out without touching the
//! evaluator.
//!
//! The type system is intentionally small: no schemes, no unification,
//! no type variables. Polymorphism comes through `Any` (top type, the
//! escape hatch) and through hardcoded refinement on a handful of
//! prelude primitives (see `check.rs`).

use std::fmt;

/// Lattice:
/// ```text
///                          Any
///        ┌──────┬──────┬────┴────┬───────┬──────┬──────────┐
///       Nil    Bool   Str   Symbol      Num    List<T>     Fn(..)
///                                       ├──┐
///                                     Int  Float
/// ```
/// `Nil` is also a subtype of every `List<T>` so the empty list literal
/// satisfies a typed list expectation without explicit ascription.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Type {
    /// Top type. Everything is `Any`; `Any` is also a *subtype* of everything
    /// so dynamically-typed code never breaks the checker.
    Any,
    Nil,
    Bool,
    Int,
    Float,
    /// Numeric supertype (Int ∪ Float). Used by `+ - * /` and friends so
    /// `(+ Int Float)` synthesises `Float` rather than blowing up.
    Num,
    Str,
    Symbol,
    List(Box<Type>),
    Fn { params: Vec<Type>, ret: Box<Type> },
}

impl Type {
    pub fn list(elem: Type) -> Self {
        Type::List(Box::new(elem))
    }

    pub fn func(params: Vec<Type>, ret: Type) -> Self {
        Type::Fn { params, ret: Box::new(ret) }
    }
}

impl fmt::Display for Type {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Type::Any    => f.write_str("Any"),
            Type::Nil    => f.write_str("Nil"),
            Type::Bool   => f.write_str("Bool"),
            Type::Int    => f.write_str("Int"),
            Type::Float  => f.write_str("Float"),
            Type::Num    => f.write_str("Num"),
            Type::Str    => f.write_str("Str"),
            Type::Symbol => f.write_str("Symbol"),
            Type::List(t) => write!(f, "(List {t})"),
            Type::Fn { params, ret } => {
                f.write_str("(->")?;
                for p in params { write!(f, " {p}")?; }
                write!(f, " {ret})")
            }
        }
    }
}

/// `a <: b`: every value statically known to be `a` is also a valid `b`.
///
/// Notable rules:
/// - `Any` is both top and bottom — keeps untyped code compatible with
///   typed boundaries.
/// - `Int <: Num`, `Float <: Num`. `Num` does **not** narrow back to `Int`/`Float`.
/// - `Nil <: List<T>` for any `T` (empty list).
/// - Function subtyping is contravariant on params, covariant on return.
/// - Lists are covariant in their element type. Safe because the language
///   has no list mutation in v1; once `set-car!` lands this needs to become
///   invariant.
pub fn is_subtype(a: &Type, b: &Type) -> bool {
    match (a, b) {
        (_, Type::Any) | (Type::Any, _) => true,
        _ if a == b => true,
        (Type::Int, Type::Num) | (Type::Float, Type::Num) => true,
        (Type::Nil, Type::List(_)) => true,
        (Type::List(la), Type::List(lb)) => is_subtype(la, lb),
        (Type::Fn { params: pa, ret: ra }, Type::Fn { params: pb, ret: rb }) => {
            pa.len() == pb.len()
                && pa.iter().zip(pb.iter()).all(|(pa, pb)| is_subtype(pb, pa))
                && is_subtype(ra, rb)
        }
        _ => false,
    }
}

/// Least upper bound of `a` and `b`. If neither is a subtype of the other
/// and no obvious join exists, returns `Any` — coarse but predictable.
pub fn join(a: &Type, b: &Type) -> Type {
    if a == b { return a.clone(); }
    if is_subtype(a, b) { return b.clone(); }
    if is_subtype(b, a) { return a.clone(); }
    match (a, b) {
        (Type::Int, Type::Float) | (Type::Float, Type::Int) => Type::Num,
        (Type::List(la), Type::List(lb)) => Type::List(Box::new(join(la, lb))),
        _ => Type::Any,
    }
}
