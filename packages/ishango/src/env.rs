use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use crate::ty::Type;
use crate::value::Value;

/// String interner. Backs every symbol, global name, and string literal
/// with a single shared `Rc<str>` per unique content. Two interned strings
/// for the same content compare via cheap `Rc::ptr_eq` and avoid duplicate
/// heap allocations.
#[derive(Default)]
pub struct Interner {
    set: HashSet<Rc<str>>,
}

impl Interner {
    pub fn new() -> Self { Self::default() }

    pub fn intern(&mut self, s: &str) -> Rc<str> {
        if let Some(existing) = self.set.get(s) {
            return existing.clone();
        }
        let rc: Rc<str> = Rc::from(s);
        self.set.insert(rc.clone());
        rc
    }

    pub fn len(&self) -> usize { self.set.len() }
    pub fn is_empty(&self) -> bool { self.set.is_empty() }
}

/// Runtime global environment threaded through the VM.
///
/// Owns the interner so symbols and global names stay shared across
/// compilations (REPL keeps one `Globals` across all input lines).
///
/// `type_env` is the static-typing companion to `map`: every top-level
/// `define` with a `the`-ascription stores its declared type here so a
/// later REPL line can type-check call sites against it.
#[derive(Default)]
pub struct Globals {
    pub map:      HashMap<Rc<str>, Value>,
    pub interner: Interner,
    pub type_env: HashMap<Rc<str>, Type>,
}

impl Globals {
    pub fn new() -> Self { Self::default() }

    pub fn set(&mut self, name: Rc<str>, value: Value) {
        self.map.insert(name, value);
    }

    /// Convenience: register a named native function, interning the name.
    pub fn define_native<F>(&mut self, name: &str, f: F)
    where F: Fn(&[Value]) -> Result<Value, crate::error::Error> + 'static {
        let sym: Rc<crate::value::NativeFn> = Rc::new(f);
        let key = self.interner.intern(name);
        self.set(key, Value::Native(sym));
    }
}
