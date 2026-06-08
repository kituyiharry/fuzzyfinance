use std::fmt;
use std::rc::Rc;

use crate::error::Error;

pub type NativeFn = dyn Fn(&[Value]) -> Result<Value, Error>;

/// Runtime value. `#[non_exhaustive]` reserves room for future variants
/// (e.g. `External(Rc<dyn Any>)` for host-data binding) without breaking
/// downstream pattern matches.
#[derive(Clone)]
#[non_exhaustive]
pub enum Value {
    Nil,
    Bool(bool),
    Int(i64),
    Float(f64),
    /// Heap string; identity-shared via the interner when produced by the
    /// compiler. Equal-content `Rc<str>`s satisfy `Rc::ptr_eq` after interning.
    Str(Rc<str>),
    /// Interned symbol. Same backing `Rc<str>` as the corresponding global
    /// name when the compiler resolves a free variable.
    Symbol(Rc<str>),
    List(Rc<Vec<Value>>),
    Closure(Rc<Closure>),
    Native(Rc<NativeFn>),
}

impl Value {
    pub fn is_truthy(&self) -> bool {
        !matches!(self, Value::Nil | Value::Bool(false))
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Nil        => "nil",
            Value::Bool(_)    => "bool",
            Value::Int(_)     => "int",
            Value::Float(_)   => "float",
            Value::Str(_)     => "string",
            Value::Symbol(_)  => "symbol",
            Value::List(_)    => "list",
            Value::Closure(_) => "closure",
            Value::Native(_)  => "native",
        }
    }
}

impl PartialEq for Value {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Value::Nil,         Value::Nil)         => true,
            (Value::Bool(a),     Value::Bool(b))     => a == b,
            (Value::Int(a),      Value::Int(b))      => a == b,
            (Value::Float(a),    Value::Float(b))    => a == b,
            (Value::Int(a),      Value::Float(b))    => (*a as f64) == *b,
            (Value::Float(a),    Value::Int(b))      => *a == (*b as f64),
            (Value::Str(a),      Value::Str(b))      => a == b,
            (Value::Symbol(a),   Value::Symbol(b))   => a == b,
            (Value::List(a),     Value::List(b))     => a == b,
            // Closures and Natives compare by reference identity.
            (Value::Closure(a),  Value::Closure(b))  => Rc::ptr_eq(a, b),
            (Value::Native(a),   Value::Native(b))   => Rc::ptr_eq(a, b),
            _ => false,
        }
    }
}

impl fmt::Debug for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self}")
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Nil          => f.write_str("nil"),
            Value::Bool(true)   => f.write_str("#t"),
            Value::Bool(false)  => f.write_str("#f"),
            Value::Int(n)       => write!(f, "{n}"),
            Value::Float(x)     => {
                // Always show a decimal point so floats are visually distinct from ints.
                if x.fract() == 0.0 && x.is_finite() {
                    write!(f, "{x:.1}")
                } else {
                    write!(f, "{x}")
                }
            }
            Value::Str(s)       => write!(f, "\"{s}\""),
            Value::Symbol(s)    => write!(f, "{s}"),
            Value::List(items)  => {
                f.write_str("(")?;
                for (i, v) in items.iter().enumerate() {
                    if i > 0 { f.write_str(" ")?; }
                    write!(f, "{v}")?;
                }
                f.write_str(")")
            }
            Value::Closure(_)   => f.write_str("#<closure>"),
            Value::Native(_)    => f.write_str("#<native>"),
        }
    }
}

/// One unit of compiled code. A program is one root chunk; each `lambda`
/// produces a nested `Proto` whose body is its own `Chunk`.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub code:         Vec<Op>,
    pub consts:       Vec<Value>,
    /// Global names referenced by `LoadGlobal` / `StoreGlobal` indices in `code`.
    /// Interned: all chunks compiled against the same `Globals` share storage.
    pub global_names: Vec<Rc<str>>,
    /// Nested function prototypes referenced by `MakeClosure` indices.
    pub protos:       Vec<Rc<Proto>>,
    /// High-water mark of locals — frame's `locals` is sized to this.
    pub local_count:  u16,
}

#[derive(Debug, Clone)]
pub struct Proto {
    pub chunk:    Rc<Chunk>,
    pub arity:    u8,
    pub captures: Vec<CaptureSrc>,
    pub name:     Option<String>,
}

/// Where a closure's captured value comes from in the *enclosing* function's
/// frame, at the moment `MakeClosure` runs.
#[derive(Debug, Clone, Copy)]
pub enum CaptureSrc {
    EnclosingLocal(u16),
    EnclosingCapture(u16),
}

pub struct Closure {
    pub proto:    Rc<Proto>,
    pub captures: Vec<Value>,
}

#[derive(Debug, Clone, Copy)]
pub enum Op {
    LoadConst(u16),
    LoadLocal(u16),
    StoreLocal(u16),
    LoadCapture(u16),
    LoadGlobal(u16),
    StoreGlobal(u16),
    MakeClosure(u16),
    Call(u8),
    Return,
    Jump(i16),
    JumpIfFalse(i16),
    Pop,
}
