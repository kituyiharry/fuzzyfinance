use std::rc::Rc;

use crate::ast::Expr;
use crate::env::Globals;
use crate::error::Error;
use crate::value::{CaptureSrc, Chunk, Op, Proto, Value};

pub fn compile(forms: &[Expr], globals: &mut Globals) -> Result<Chunk, Error> {
    let mut c = Compiler {
        fns: vec![FnCompiler::default()],
        globals,
    };
    c.compile_begin(forms)?;
    c.emit(Op::Return);
    let top = c.fns.pop().unwrap();
    Ok(top.into_chunk())
}

#[derive(Default)]
struct FnCompiler {
    locals:       Vec<String>,
    captures:     Vec<CaptureSrc>,
    code:         Vec<Op>,
    consts:       Vec<Value>,
    global_names: Vec<Rc<str>>,
    protos:       Vec<Rc<Proto>>,
    local_count:  u16,
}

impl FnCompiler {
    fn into_chunk(self) -> Chunk {
        Chunk {
            code:         self.code,
            consts:       self.consts,
            global_names: self.global_names,
            protos:       self.protos,
            local_count:  self.local_count,
        }
    }
}

struct Compiler<'g> {
    fns:     Vec<FnCompiler>,
    globals: &'g mut Globals,
}

enum Resolve {
    Local(u16),
    Capture(u16),
    Global(u16),
}

impl Compiler<'_> {
    fn top(&mut self) -> &mut FnCompiler {
        self.fns.last_mut().unwrap()
    }

    fn emit(&mut self, op: Op) -> usize {
        self.top().code.push(op);
        self.top().code.len() - 1
    }

    /// Append `v` to the constant pool, deduping atomic values so that
    /// repeated literals (the integer `1`, the symbol `'foo`, etc.) share
    /// a single entry. Aggregates (`List`) and runtime-only kinds skip
    /// dedup — equality on lists is O(n) and they're rare in const pools.
    fn add_const(&mut self, v: Value) -> u16 {
        let consts = &mut self.top().consts;
        if matches!(
            v,
            Value::Nil | Value::Bool(_) | Value::Int(_) | Value::Float(_) | Value::Str(_) | Value::Symbol(_),
        ) {
            for (i, existing) in consts.iter().enumerate() {
                if existing == &v {
                    return i as u16;
                }
            }
        }
        consts.push(v);
        (consts.len() - 1) as u16
    }

    fn intern_global(&mut self, name: &str) -> u16 {
        let interned = self.globals.interner.intern(name);
        let names = &mut self.top().global_names;
        if let Some(i) = names.iter().position(|n| Rc::ptr_eq(n, &interned)) {
            return i as u16;
        }
        names.push(interned);
        (names.len() - 1) as u16
    }

    fn intern(&mut self, s: &str) -> Rc<str> {
        self.globals.interner.intern(s)
    }

    fn add_local(&mut self, name: &str) -> u16 {
        let top = self.top();
        let idx = top.locals.len() as u16;
        top.locals.push(name.to_string());
        top.local_count = top.local_count.max(idx + 1);
        idx
    }

    /// Walks the function stack from innermost outward, recording any
    /// upvalue chain needed so the *current* function can fetch the value
    /// from its own captures vec.
    fn resolve_var(&mut self, name: &str) -> Resolve {
        let top = self.fns.len() - 1;
        if let Some(i) = self.fns[top].locals.iter().position(|n| n == name) {
            return Resolve::Local(i as u16);
        }
        for level in (0..top).rev() {
            if let Some(i) = self.fns[level].locals.iter().position(|n| n == name) {
                let mut src = CaptureSrc::EnclosingLocal(i as u16);
                for lvl in (level + 1)..top {
                    let cap_idx = self.fns[lvl].captures.len() as u16;
                    self.fns[lvl].captures.push(src);
                    src = CaptureSrc::EnclosingCapture(cap_idx);
                }
                let final_idx = self.fns[top].captures.len() as u16;
                self.fns[top].captures.push(src);
                return Resolve::Capture(final_idx);
            }
        }
        let gi = self.intern_global(name);
        Resolve::Global(gi)
    }

    fn compile_begin(&mut self, forms: &[Expr]) -> Result<(), Error> {
        if forms.is_empty() {
            let i = self.add_const(Value::Nil);
            self.emit(Op::LoadConst(i));
            return Ok(());
        }
        for (i, f) in forms.iter().enumerate() {
            self.compile_expr(f)?;
            if i + 1 < forms.len() {
                self.emit(Op::Pop);
            }
        }
        Ok(())
    }

    fn compile_expr(&mut self, e: &Expr) -> Result<(), Error> {
        match e {
            Expr::Nil(_)        => { let i = self.add_const(Value::Nil);            self.emit(Op::LoadConst(i)); }
            Expr::Bool(b, _)    => { let i = self.add_const(Value::Bool(*b));       self.emit(Op::LoadConst(i)); }
            Expr::Int(n, _)     => { let i = self.add_const(Value::Int(*n));        self.emit(Op::LoadConst(i)); }
            Expr::Float(x, _)   => { let i = self.add_const(Value::Float(*x));      self.emit(Op::LoadConst(i)); }
            Expr::Str(s, _)     => {
                let interned = self.intern(s);
                let i = self.add_const(Value::Str(interned));
                self.emit(Op::LoadConst(i));
            }
            Expr::Quote(inner, _) => {
                let v = self.quote_to_value(inner);
                let i = self.add_const(v);
                self.emit(Op::LoadConst(i));
            }
            Expr::Sym(name, _) => match self.resolve_var(name) {
                Resolve::Local(i)   => { self.emit(Op::LoadLocal(i)); }
                Resolve::Capture(i) => { self.emit(Op::LoadCapture(i)); }
                Resolve::Global(i)  => { self.emit(Op::LoadGlobal(i)); }
            },
            Expr::List(items, span) => {
                if items.is_empty() {
                    return Err(Error::compile(format!("empty call at {}:{}", span.line, span.col)));
                }
                if let Expr::Sym(head, _) = &items[0] {
                    match head.as_str() {
                        "if"     => return self.compile_if(&items[1..]),
                        "let"    => return self.compile_let(&items[1..]),
                        "lambda" => return self.compile_lambda(&items[1..], None),
                        // `defun` is a familiarity alias for `define`. Same
                        // semantics, kept distinct only as a head-symbol match.
                        "define" | "defun" => return self.compile_define(&items[1..]),
                        "set!"   => return self.compile_set(&items[1..]),
                        "begin"  => return self.compile_begin(&items[1..]),
                        "quote"  => {
                            if items.len() != 2 {
                                return Err(Error::compile("quote takes 1 arg"));
                            }
                            let v = self.quote_to_value(&items[1]);
                            let i = self.add_const(v);
                            self.emit(Op::LoadConst(i));
                            return Ok(());
                        }
                        // `the` is a checker-only ascription. At runtime it
                        // is identity — compile the body, ignore the type.
                        "the" => {
                            if items.len() != 3 {
                                return Err(Error::compile("the expects (the TYPE EXPR)"));
                            }
                            return self.compile_expr(&items[2]);
                        }
                        _ => {}
                    }
                }
                // General call: push callee, then args, then Call(argc).
                self.compile_expr(&items[0])?;
                for a in &items[1..] {
                    self.compile_expr(a)?;
                }
                let argc_usize = items.len() - 1;
                if argc_usize > u8::MAX as usize {
                    return Err(Error::compile("too many arguments in call"));
                }
                self.emit(Op::Call(argc_usize as u8));
            }
        }
        Ok(())
    }

    fn compile_if(&mut self, args: &[Expr]) -> Result<(), Error> {
        if args.len() != 2 && args.len() != 3 {
            return Err(Error::compile("if expects 2 or 3 args"));
        }
        self.compile_expr(&args[0])?;
        let jfalse = self.emit(Op::JumpIfFalse(0));
        self.compile_expr(&args[1])?;
        let jend = self.emit(Op::Jump(0));
        let else_start = self.top().code.len();
        self.patch_jump(jfalse, else_start);
        if args.len() == 3 {
            self.compile_expr(&args[2])?;
        } else {
            let i = self.add_const(Value::Nil);
            self.emit(Op::LoadConst(i));
        }
        let end = self.top().code.len();
        self.patch_jump(jend, end);
        Ok(())
    }

    fn patch_jump(&mut self, idx: usize, target: usize) {
        let offset = (target as isize) - (idx as isize + 1);
        let off = offset as i16;
        match &mut self.top().code[idx] {
            Op::Jump(o)        => *o = off,
            Op::JumpIfFalse(o) => *o = off,
            _ => panic!("patch_jump on non-jump op"),
        }
    }

    fn compile_let(&mut self, args: &[Expr]) -> Result<(), Error> {
        if args.len() < 2 {
            return Err(Error::compile("let expects bindings and body"));
        }
        let Expr::List(bindings, _) = &args[0] else {
            return Err(Error::compile("let bindings must be a list"));
        };
        let mut names = Vec::with_capacity(bindings.len());
        for b in bindings {
            let Expr::List(parts, _) = b else {
                return Err(Error::compile("let binding must be (name expr)"));
            };
            if parts.len() != 2 {
                return Err(Error::compile("let binding must be (name expr)"));
            }
            let Expr::Sym(name, _) = &parts[0] else {
                return Err(Error::compile("let binding name must be a symbol"));
            };
            names.push(name.clone());
            self.compile_expr(&parts[1])?;
        }
        let mut slots = Vec::with_capacity(names.len());
        for name in &names {
            slots.push(self.add_local(name));
        }
        for slot in slots.iter().rev() {
            self.emit(Op::StoreLocal(*slot));
        }
        self.compile_begin(&args[1..])?;
        let top = self.top();
        for _ in &names { top.locals.pop(); }
        Ok(())
    }

    fn compile_lambda(&mut self, args: &[Expr], name: Option<String>) -> Result<(), Error> {
        if args.len() < 2 {
            return Err(Error::compile("lambda expects (params) body..."));
        }
        let Expr::List(params, _) = &args[0] else {
            return Err(Error::compile("lambda params must be a list"));
        };
        let mut param_names = Vec::with_capacity(params.len());
        for p in params {
            let Expr::Sym(s, _) = p else {
                return Err(Error::compile("lambda param must be a symbol"));
            };
            param_names.push(s.clone());
        }
        if param_names.len() > u8::MAX as usize {
            return Err(Error::compile("too many lambda parameters"));
        }
        let arity = param_names.len() as u8;

        let mut inner = FnCompiler::default();
        for p in &param_names {
            let idx = inner.locals.len() as u16;
            inner.locals.push(p.clone());
            inner.local_count = inner.local_count.max(idx + 1);
        }
        self.fns.push(inner);

        self.compile_begin(&args[1..])?;
        self.emit(Op::Return);

        let inner = self.fns.pop().unwrap();
        let captures = inner.captures.clone();
        let chunk = inner.into_chunk();
        let proto = Rc::new(Proto {
            chunk: Rc::new(chunk),
            arity,
            captures,
            name,
        });
        let proto_idx = self.top().protos.len() as u16;
        self.top().protos.push(proto);
        self.emit(Op::MakeClosure(proto_idx));
        Ok(())
    }

    fn compile_define(&mut self, args: &[Expr]) -> Result<(), Error> {
        if args.len() != 2 {
            return Err(Error::compile("define expects (define name expr)"));
        }
        let Expr::Sym(name, _) = &args[0] else {
            return Err(Error::compile("define name must be a symbol"));
        };
        let mut compiled = false;
        if let Expr::List(items, _) = &args[1] {
            if let Some(Expr::Sym(h, _)) = items.first() {
                if h == "lambda" {
                    self.compile_lambda(&items[1..], Some(name.clone()))?;
                    compiled = true;
                }
            }
        }
        if !compiled {
            self.compile_expr(&args[1])?;
        }
        let gi = self.intern_global(name);
        self.emit(Op::StoreGlobal(gi));
        let i = self.add_const(Value::Nil);
        self.emit(Op::LoadConst(i));
        Ok(())
    }

    fn compile_set(&mut self, args: &[Expr]) -> Result<(), Error> {
        if args.len() != 2 {
            return Err(Error::compile("set! expects (set! name expr)"));
        }
        let Expr::Sym(name, _) = &args[0] else {
            return Err(Error::compile("set! target must be a symbol"));
        };
        self.compile_expr(&args[1])?;
        match self.resolve_var(name) {
            Resolve::Local(i)   => { self.emit(Op::StoreLocal(i)); }
            Resolve::Capture(_) => return Err(Error::compile(format!("cannot set! captured variable `{name}` (not supported in v1)"))),
            Resolve::Global(i)  => { self.emit(Op::StoreGlobal(i)); }
        }
        let i = self.add_const(Value::Nil);
        self.emit(Op::LoadConst(i));
        Ok(())
    }

    fn quote_to_value(&mut self, e: &Expr) -> Value {
        match e {
            Expr::Nil(_)        => Value::Nil,
            Expr::Bool(b, _)    => Value::Bool(*b),
            Expr::Int(n, _)     => Value::Int(*n),
            Expr::Float(x, _)   => Value::Float(*x),
            Expr::Str(s, _)     => Value::Str(self.intern(s)),
            Expr::Sym(s, _)     => Value::Symbol(self.intern(s)),
            Expr::List(items, _) => {
                let v: Vec<Value> = items.iter().map(|x| self.quote_to_value(x)).collect();
                Value::List(Rc::new(v))
            }
            Expr::Quote(inner, _) => {
                let inner_val = self.quote_to_value(inner);
                Value::List(Rc::new(vec![
                    Value::Symbol(self.intern("quote")),
                    inner_val,
                ]))
            }
        }
    }
}
