use std::rc::Rc;
use std::time::{SystemTime, UNIX_EPOCH};


use crate::env::Globals;
use crate::error::Error;
use crate::value::Value;

pub fn install_prelude(g: &mut Globals) {
    g.define_native("+",  add);
    g.define_native("-",  sub);
    g.define_native("*",  mul);
    g.define_native("/",  div);
    g.define_native("=",  cmp_eq);
    g.define_native("<",  |a| cmp_chain(a, |x, y| x < y));
    g.define_native(">",  |a| cmp_chain(a, |x, y| x > y));
    g.define_native("<=", |a| cmp_chain(a, |x, y| x <= y));
    g.define_native(">=", |a| cmp_chain(a, |x, y| x >= y));

    g.define_native("cons",  cons);
    g.define_native("car",   car);
    g.define_native("cdr",   cdr);
    // Familiar-name aliases: `head` ≡ `car`, `tail` ≡ `cdr`. Distinct global
    // entries, identical native body — the interner shares the function name
    // storage but the runtime values are separate `Rc<NativeFn>`s, which is
    // fine: calls dispatch by name lookup.
    g.define_native("head",  car);
    g.define_native("tail",  cdr);
    g.define_native("list",  list);
    g.define_native("null?", is_null);

    g.define_native("print", print);
    g.define_native("clock", clock);
}

// ───── numeric helpers ─────────────────────────────────────────────────

#[derive(Clone, Copy)]
enum Num { I(i64), F(f64) }

impl Num {
    fn from_value(v: &Value) -> Result<Self, Error> {
        match v {
            Value::Int(n)   => Ok(Num::I(*n)),
            Value::Float(x) => Ok(Num::F(*x)),
            other => Err(Error::runtime(format!("expected number, got {}", other.type_name()))),
        }
    }
    fn to_value(self) -> Value {
        match self {
            Num::I(n) => Value::Int(n),
            Num::F(x) => Value::Float(x),
        }
    }
    fn as_f64(self) -> f64 {
        match self {
            Num::I(n) => n as f64,
            Num::F(x) => x,
        }
    }
}

fn promote(a: Num, b: Num) -> (Num, Num) {
    match (a, b) {
        (Num::F(_), _) | (_, Num::F(_)) => (Num::F(a.as_f64()), Num::F(b.as_f64())),
        _ => (a, b),
    }
}

// ───── arithmetic ───────────────────────────────────────────────────────

fn add(args: &[Value]) -> Result<Value, Error> {
    let mut acc = Num::I(0);
    for v in args {
        let n = Num::from_value(v)?;
        let (a, b) = promote(acc, n);
        acc = match (a, b) {
            (Num::I(x), Num::I(y)) => Num::I(x.wrapping_add(y)),
            (Num::F(x), Num::F(y)) => Num::F(x + y),
            _ => unreachable!(),
        };
    }
    Ok(acc.to_value())
}

fn sub(args: &[Value]) -> Result<Value, Error> {
    if args.is_empty() {
        return Err(Error::runtime("- requires at least 1 arg"));
    }
    if args.len() == 1 {
        return Ok(match Num::from_value(&args[0])? {
            Num::I(n) => Value::Int(-n),
            Num::F(x) => Value::Float(-x),
        });
    }
    let mut acc = Num::from_value(&args[0])?;
    for v in &args[1..] {
        let n = Num::from_value(v)?;
        let (a, b) = promote(acc, n);
        acc = match (a, b) {
            (Num::I(x), Num::I(y)) => Num::I(x.wrapping_sub(y)),
            (Num::F(x), Num::F(y)) => Num::F(x - y),
            _ => unreachable!(),
        };
    }
    Ok(acc.to_value())
}

fn mul(args: &[Value]) -> Result<Value, Error> {
    let mut acc = Num::I(1);
    for v in args {
        let n = Num::from_value(v)?;
        let (a, b) = promote(acc, n);
        acc = match (a, b) {
            (Num::I(x), Num::I(y)) => Num::I(x.wrapping_mul(y)),
            (Num::F(x), Num::F(y)) => Num::F(x * y),
            _ => unreachable!(),
        };
    }
    Ok(acc.to_value())
}

fn div(args: &[Value]) -> Result<Value, Error> {
    if args.is_empty() {
        return Err(Error::runtime("/ requires at least 1 arg"));
    }
    let mut acc = Num::from_value(&args[0])?;
    let rest = if args.len() == 1 {
        // (/ x) → 1/x
        acc = match acc {
            Num::I(1) => Num::I(1),
            n => Num::F(1.0 / n.as_f64()),
        };
        &[][..]
    } else {
        &args[1..]
    };
    for v in rest {
        let n = Num::from_value(v)?;
        let (a, b) = promote(acc, n);
        acc = match (a, b) {
            (Num::I(_), Num::I(0)) => return Err(Error::runtime("division by zero")),
            (Num::F(_), Num::F(0.0)) => return Err(Error::runtime("division by zero")),
            (Num::I(x), Num::I(y)) => Num::I(x / y),
            (Num::F(x), Num::F(y)) => Num::F(x / y),
            _ => unreachable!(),
        };
    }
    Ok(acc.to_value())
}

// ───── comparison ───────────────────────────────────────────────────────

fn cmp_eq(args: &[Value]) -> Result<Value, Error> {
    if args.len() < 2 {
        return Ok(Value::Bool(true));
    }
    let first = &args[0];
    for v in &args[1..] {
        if !values_equal(first, v) {
            return Ok(Value::Bool(false));
        }
    }
    Ok(Value::Bool(true))
}

fn values_equal(a: &Value, b: &Value) -> bool {
    a == b
}

fn cmp_chain<F: Fn(f64, f64) -> bool>(args: &[Value], f: F) -> Result<Value, Error> {
    if args.len() < 2 {
        return Ok(Value::Bool(true));
    }
    for w in args.windows(2) {
        let a = Num::from_value(&w[0])?.as_f64();
        let b = Num::from_value(&w[1])?.as_f64();
        if !f(a, b) {
            return Ok(Value::Bool(false));
        }
    }
    Ok(Value::Bool(true))
}

// ───── list ─────────────────────────────────────────────────────────────

fn cons(args: &[Value]) -> Result<Value, Error> {
    if args.len() != 2 {
        return Err(Error::runtime("cons expects 2 args"));
    }
    let head = args[0].clone();
    let tail = &args[1];
    let mut out = Vec::with_capacity(1);
    out.push(head);
    match tail {
        Value::Nil => {}
        Value::List(xs) => out.extend(xs.iter().cloned()),
        other => return Err(Error::runtime(format!("cons tail must be list or nil, got {}", other.type_name()))),
    }
    Ok(Value::List(Rc::new(out)))
}

fn car(args: &[Value]) -> Result<Value, Error> {
    if args.len() != 1 {
        return Err(Error::runtime("car expects 1 arg"));
    }
    match &args[0] {
        Value::List(xs) if !xs.is_empty() => Ok(xs[0].clone()),
        Value::List(_) => Err(Error::runtime("car of empty list")),
        Value::Nil     => Err(Error::runtime("car of nil")),
        other => Err(Error::runtime(format!("car expects list, got {}", other.type_name()))),
    }
}

fn cdr(args: &[Value]) -> Result<Value, Error> {
    if args.len() != 1 {
        return Err(Error::runtime("cdr expects 1 arg"));
    }
    match &args[0] {
        Value::List(xs) if !xs.is_empty() => {
            let rest: Vec<Value> = xs.iter().skip(1).cloned().collect();
            if rest.is_empty() {
                Ok(Value::Nil)
            } else {
                Ok(Value::List(Rc::new(rest)))
            }
        }
        Value::List(_) => Err(Error::runtime("cdr of empty list")),
        Value::Nil     => Err(Error::runtime("cdr of nil")),
        other => Err(Error::runtime(format!("cdr expects list, got {}", other.type_name()))),
    }
}

fn list(args: &[Value]) -> Result<Value, Error> {
    if args.is_empty() {
        Ok(Value::Nil)
    } else {
        Ok(Value::List(Rc::new(args.to_vec())))
    }
}

fn is_null(args: &[Value]) -> Result<Value, Error> {
    if args.len() != 1 {
        return Err(Error::runtime("null? expects 1 arg"));
    }
    Ok(Value::Bool(matches!(&args[0], Value::Nil) || matches!(&args[0], Value::List(xs) if xs.is_empty())))
}

// ───── io ───────────────────────────────────────────────────────────────

fn print(args: &[Value]) -> Result<Value, Error> {
    for (i, v) in args.iter().enumerate() {
        if i > 0 { print!(" "); }
        print!("{v}");
    }
    println!();
    Ok(Value::Nil)
}

// ───── clock ───────────────────────────────────────────────────────────────

fn clock(_args: &[Value]) -> Result<Value, Error> {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("time should go forward")
        .as_secs_f64()
    ;
    Ok(Value::Float(since_the_epoch))
}
