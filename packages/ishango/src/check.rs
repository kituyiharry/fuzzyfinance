//! Bidirectional type checker. Runs between parse and compile.
//!
//! Optional. Programs without any `the`-ascriptions are vacuously
//! well-typed (everything is `Any`); ascriptions turn on enforcement
//! at that boundary, à la Typed Racket.
//!
//! Surface:
//! ```text
//! (the TYPE EXPR)                 ; ascription
//!
//! Type ::= Any | Nil | Bool | Int | Float | Num | Str | Symbol
//!        | (List Type)
//!        | (-> Type1 Type2 ... TypeN Ret)
//! ```
//!
//! Two-pass top level: `hoist` collects `(define name (the T …))` so
//! mutually-recursive functions see each other; then `infer` walks each
//! form. Inside expressions, special bidirectional cases (`lambda`,
//! `list`, `cons`, `if`, `let`, `begin`, `the`) refine against an
//! expected type before falling back to the generic
//! "infer-then-subtype" rule.

use crate::ast::{Expr, Span};
use crate::env::Globals;
use crate::error::Error;
use crate::ty::{is_subtype, join, Type};

pub fn check_program(forms: &[Expr], globals: &mut Globals) -> Result<(), Error> {
    let mut c = Checker { globals, locals: Vec::new() };
    c.hoist(forms)?;
    for f in forms {
        c.infer(f)?;
    }
    Ok(())
}

struct Checker<'g> {
    globals: &'g mut Globals,
    /// Stack of `(name, type)`. Newest at the back. Shadowing wins.
    locals:  Vec<(String, Type)>,
}

/// Some prelude operators need richer-than-`Fn` signatures (variadic on
/// both arity and numeric precision). Encoded as discriminants here so
/// the checker can specialise on them.
enum PrimSig {
    /// Variadic numeric: `(Num...) -> Int|Float|Num` depending on argv types.
    Arithmetic,
    /// Variadic comparison: `(Num, Num, ...) -> Bool`.
    Comparison,
    /// Variadic equality: `(Any, Any, ...) -> Bool`.
    Equal,
    /// `(Any, Any) -> List<Any>` with bidirectional refinement against `List<T>`.
    Cons,
    /// `(Any...) -> List<Any>` with bidirectional refinement against `List<T>`.
    List,
    /// Ordinary fixed-arity prelude function.
    Simple(Type),
    /// Variadic with fixed parameter type and return type. No precision tricks.
    Variadic { param: Type, ret: Type },
}

fn prelude_sig(name: &str) -> Option<PrimSig> {
    Some(match name {
        "+" | "-" | "*" | "/"   => PrimSig::Arithmetic,
        "<" | ">" | "<=" | ">=" => PrimSig::Comparison,
        "="                     => PrimSig::Equal,
        "cons"                  => PrimSig::Cons,
        "list"                  => PrimSig::List,
        "car" | "head"          => PrimSig::Simple(Type::func(vec![Type::Any], Type::Any)),
        "cdr" | "tail"          => PrimSig::Simple(Type::func(vec![Type::Any], Type::Any)),
        "null?"                 => PrimSig::Simple(Type::func(vec![Type::Any], Type::Bool)),
        "print"                 => PrimSig::Variadic { param: Type::Any, ret: Type::Nil },
        "clock"                 => PrimSig::Simple(Type::func(vec![], Type::Float)),
        _ => return None,
    })
}

impl Checker<'_> {
    // ─── public-ish entry points ───────────────────────────────────────

    /// Generic inference. Always succeeds with *some* type; only fails on
    /// concrete mismatches (call/use of a known-typed binding with the
    /// wrong shape).
    fn infer(&mut self, e: &Expr) -> Result<Type, Error> {
        match e {
            Expr::Nil(_)      => Ok(Type::Nil),
            Expr::Bool(_, _)  => Ok(Type::Bool),
            Expr::Int(_, _)   => Ok(Type::Int),
            Expr::Float(_, _) => Ok(Type::Float),
            Expr::Str(_, _)   => Ok(Type::Str),
            Expr::Quote(inner, _) => Ok(self.infer_quoted(inner)),
            Expr::Sym(name, _) => Ok(self.lookup(name)),
            Expr::List(items, span) => self.infer_list(items, *span),
        }
    }

    /// Checking mode. Used wherever an expected type is known —
    /// lambda bodies, `the` annotations, `if`/`let` against an outer
    /// expectation. Default fallback is `infer + is_subtype`.
    fn check(&mut self, e: &Expr, expected: &Type, span: Span) -> Result<(), Error> {
        // Bidirectional refinement on known shapes.
        if let Expr::List(items, list_span) = e {
            if let Some(Expr::Sym(head, _)) = items.first() {
                match head.as_str() {
                    "the" => return self.check_the(items, expected, *list_span),
                    "lambda" => return self.check_lambda(items, expected, *list_span),
                    "if"     => return self.check_if(items, expected, *list_span),
                    "let"    => return self.check_let(items, expected, *list_span),
                    "begin"  => return self.check_begin(items, expected, *list_span),
                    "list"   => {
                        if let Type::List(elem) = expected {
                            for a in &items[1..] {
                                self.check(a, elem, *list_span)?;
                            }
                            return Ok(());
                        }
                    }
                    "cons" if items.len() == 3 => {
                        if let Type::List(elem) = expected {
                            self.check(&items[1], elem, *list_span)?;
                            self.check(&items[2], expected, *list_span)?;
                            return Ok(());
                        }
                    }
                    _ => {}
                }
            }
        }
        // Fallback.
        let actual = self.infer(e)?;
        if !is_subtype(&actual, expected) {
            return Err(Error::type_error(
                format!("expected {expected}, got {actual}"),
                Some(span),
            ));
        }
        Ok(())
    }

    // ─── two-pass hoisting ─────────────────────────────────────────────

    fn hoist(&mut self, forms: &[Expr]) -> Result<(), Error> {
        for f in forms {
            let Expr::List(items, _) = f else { continue };
            let Some(Expr::Sym(head, _)) = items.first() else { continue };
            if !(head == "define" || head == "defun") || items.len() != 3 { continue; }
            let Expr::Sym(name, _) = &items[1] else { continue };
            // (define name (the T body)) → bind name : T globally before
            // walking. Lets mutual recursion type-check.
            if let Expr::List(inner, _) = &items[2] {
                if let Some(Expr::Sym(h, _)) = inner.first() {
                    if h == "the" && inner.len() == 3 {
                        let ty = self.parse_type(&inner[1])?;
                        let key = self.globals.interner.intern(name);
                        self.globals.type_env.insert(key, ty);
                    }
                }
            }
        }
        Ok(())
    }

    // ─── infer dispatch on List(...)  ──────────────────────────────────

    fn infer_list(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.is_empty() {
            return Err(Error::type_error("empty call", Some(span)));
        }
        if let Expr::Sym(head, _) = &items[0] {
            match head.as_str() {
                "the"    => return self.infer_the(items, span),
                "if"     => return self.infer_if(items, span),
                "let"    => return self.infer_let(items, span),
                "lambda" => return self.infer_lambda(items, span),
                "begin"  => return self.infer_begin(items, span),
                "define" | "defun" => return self.infer_define(items, span),
                "set!"   => return self.infer_set(items, span),
                "quote"  => {
                    if items.len() != 2 { return Err(Error::type_error("quote takes 1 arg", Some(span))); }
                    return Ok(self.infer_quoted(&items[1]));
                }
                name => {
                    if let Some(sig) = prelude_sig(name) {
                        return self.apply_prelude(name, sig, &items[1..], span);
                    }
                }
            }
        }
        // General application: infer head, expect a function, check args.
        let head_ty = self.infer(&items[0])?;
        let args = &items[1..];
        match head_ty {
            Type::Any => {
                // Pure dynamic call — infer args for their side effects, return Any.
                for a in args { self.infer(a)?; }
                Ok(Type::Any)
            }
            Type::Fn { params, ret } => {
                if params.len() != args.len() {
                    return Err(Error::type_error(
                        format!("function expects {} arg(s), got {}", params.len(), args.len()),
                        Some(span),
                    ));
                }
                for (p, a) in params.iter().zip(args.iter()) {
                    self.check(a, p, span)?;
                }
                Ok(*ret)
            }
            other => Err(Error::type_error(
                format!("cannot call value of type {other}"), Some(span),
            )),
        }
    }

    // ─── special-form infer cases ──────────────────────────────────────

    fn infer_the(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() != 3 {
            return Err(Error::type_error("the expects (the TYPE EXPR)", Some(span)));
        }
        let ty = self.parse_type(&items[1])?;
        self.check(&items[2], &ty, span)?;
        Ok(ty)
    }

    fn infer_if(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() != 3 && items.len() != 4 {
            return Err(Error::type_error("if expects 2 or 3 args", Some(span)));
        }
        let cond_ty = self.infer(&items[1])?;
        if !is_subtype(&cond_ty, &Type::Bool) && !matches!(cond_ty, Type::Any) {
            // Lisp truthiness: anything except #f and nil is truthy. Be lax
            // and only flag when we *know* the condition is non-boolean
            // non-nil — but most users still pass Bool/Any here, so just
            // accept anything truthy-looking and skip a hard error.
        }
        let t = self.infer(&items[2])?;
        let e = if items.len() == 4 { self.infer(&items[3])? } else { Type::Nil };
        Ok(join(&t, &e))
    }

    fn infer_let(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() < 3 {
            return Err(Error::type_error("let expects bindings and body", Some(span)));
        }
        let bindings = self.unpack_bindings(&items[1], span)?;
        let mut pushed = 0;
        for (name, expr) in &bindings {
            let t = self.infer(expr)?;
            self.locals.push((name.clone(), t));
            pushed += 1;
        }
        let body_ty = self.infer_begin_inner(&items[2..], span)?;
        for _ in 0..pushed { self.locals.pop(); }
        Ok(body_ty)
    }

    fn infer_lambda(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() < 3 {
            return Err(Error::type_error("lambda expects (params) body...", Some(span)));
        }
        let params = self.unpack_params(&items[1], span)?;
        let arity = params.len();
        for p in &params { self.locals.push((p.clone(), Type::Any)); }
        let ret = self.infer_begin_inner(&items[2..], span)?;
        for _ in 0..arity { self.locals.pop(); }
        Ok(Type::func(vec![Type::Any; arity], ret))
    }

    fn infer_begin(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        self.infer_begin_inner(&items[1..], span)
    }

    fn infer_begin_inner(&mut self, forms: &[Expr], _span: Span) -> Result<Type, Error> {
        if forms.is_empty() { return Ok(Type::Nil); }
        for f in &forms[..forms.len() - 1] {
            self.infer(f)?;
        }
        self.infer(&forms[forms.len() - 1])
    }

    fn infer_define(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() != 3 {
            return Err(Error::type_error("define expects (define name expr)", Some(span)));
        }
        let Expr::Sym(name, _) = &items[1] else {
            return Err(Error::type_error("define name must be a symbol", Some(span)));
        };
        let key = self.globals.interner.intern(name);
        // If hoist already pinned a declared type, check the RHS against it.
        if let Some(declared) = self.globals.type_env.get(&key).cloned() {
            self.check(&items[2], &declared, span)?;
        } else {
            // Otherwise infer and store. Re-`define`d names keep their latest
            // inferred type — matches the existing dynamic semantics where a
            // re-define just clobbers the global.
            let ty = self.infer(&items[2])?;
            self.globals.type_env.insert(key, ty);
        }
        Ok(Type::Nil)
    }

    fn infer_set(&mut self, items: &[Expr], span: Span) -> Result<Type, Error> {
        if items.len() != 3 {
            return Err(Error::type_error("set! expects (set! name expr)", Some(span)));
        }
        let Expr::Sym(name, _) = &items[1] else {
            return Err(Error::type_error("set! target must be a symbol", Some(span)));
        };
        // Find target type — local first, else global.
        let target = self.locals.iter().rev().find(|(n, _)| n == name).map(|(_, t)| t.clone())
            .or_else(|| {
                let key = self.globals.interner.intern(name);
                self.globals.type_env.get(&key).cloned()
            });
        if let Some(t) = target {
            self.check(&items[2], &t, span)?;
        } else {
            self.infer(&items[2])?;
        }
        Ok(Type::Nil)
    }

    fn infer_quoted(&self, e: &Expr) -> Type {
        match e {
            Expr::Nil(_)      => Type::Nil,
            Expr::Bool(_, _)  => Type::Bool,
            Expr::Int(_, _)   => Type::Int,
            Expr::Float(_, _) => Type::Float,
            Expr::Str(_, _)   => Type::Str,
            Expr::Sym(_, _)   => Type::Symbol,
            Expr::List(_, _) | Expr::Quote(_, _) => Type::list(Type::Any),
        }
    }

    // ─── special-form check cases ──────────────────────────────────────

    fn check_the(&mut self, items: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        if items.len() != 3 {
            return Err(Error::type_error("the expects (the TYPE EXPR)", Some(span)));
        }
        let declared = self.parse_type(&items[1])?;
        if !is_subtype(&declared, expected) {
            return Err(Error::type_error(
                format!("annotation {declared} is not a subtype of expected {expected}"),
                Some(span),
            ));
        }
        self.check(&items[2], &declared, span)
    }

    fn check_lambda(&mut self, items: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        let Type::Fn { params: param_tys, ret } = expected else {
            // Expected isn't a function type — fall back to infer + subtype.
            let actual = self.infer_lambda(items, span)?;
            return if is_subtype(&actual, expected) {
                Ok(())
            } else {
                Err(Error::type_error(format!("expected {expected}, got {actual}"), Some(span)))
            };
        };
        if items.len() < 3 {
            return Err(Error::type_error("lambda expects (params) body...", Some(span)));
        }
        let params = self.unpack_params(&items[1], span)?;
        if params.len() != param_tys.len() {
            return Err(Error::type_error(
                format!("lambda has {} param(s), expected {}", params.len(), param_tys.len()),
                Some(span),
            ));
        }
        for (name, ty) in params.iter().zip(param_tys.iter()) {
            self.locals.push((name.clone(), ty.clone()));
        }
        let result = self.check_begin_body(&items[2..], ret, span);
        for _ in 0..params.len() { self.locals.pop(); }
        result
    }

    fn check_if(&mut self, items: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        if items.len() != 3 && items.len() != 4 {
            return Err(Error::type_error("if expects 2 or 3 args", Some(span)));
        }
        self.infer(&items[1])?; // condition can be anything truthy
        self.check(&items[2], expected, span)?;
        if items.len() == 4 {
            self.check(&items[3], expected, span)?;
        } else if !is_subtype(&Type::Nil, expected) {
            return Err(Error::type_error(
                format!("if has no else branch, but expected {expected} does not admit Nil"),
                Some(span),
            ));
        }
        Ok(())
    }

    fn check_let(&mut self, items: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        if items.len() < 3 {
            return Err(Error::type_error("let expects bindings and body", Some(span)));
        }
        let bindings = self.unpack_bindings(&items[1], span)?;
        for (name, expr) in &bindings {
            let t = self.infer(expr)?;
            self.locals.push((name.clone(), t));
        }
        let result = self.check_begin_body(&items[2..], expected, span);
        for _ in &bindings { self.locals.pop(); }
        result
    }

    fn check_begin(&mut self, items: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        self.check_begin_body(&items[1..], expected, span)
    }

    fn check_begin_body(&mut self, forms: &[Expr], expected: &Type, span: Span) -> Result<(), Error> {
        if forms.is_empty() {
            if !is_subtype(&Type::Nil, expected) {
                return Err(Error::type_error(
                    format!("empty body has type Nil, expected {expected}"), Some(span),
                ));
            }
            return Ok(());
        }
        for f in &forms[..forms.len() - 1] {
            self.infer(f)?;
        }
        self.check(&forms[forms.len() - 1], expected, span)
    }

    // ─── prelude dispatch ──────────────────────────────────────────────

    fn apply_prelude(&mut self, name: &str, sig: PrimSig, args: &[Expr], span: Span) -> Result<Type, Error> {
        match sig {
            PrimSig::Arithmetic     => self.infer_arithmetic(name, args, span),
            PrimSig::Comparison     => self.infer_comparison(name, args, span),
            PrimSig::Equal          => {
                for a in args { self.infer(a)?; }
                Ok(Type::Bool)
            }
            PrimSig::Cons => {
                if args.len() != 2 {
                    return Err(Error::type_error("cons expects 2 args", Some(span)));
                }
                self.infer(&args[0])?;
                self.infer(&args[1])?;
                Ok(Type::list(Type::Any))
            }
            PrimSig::List => {
                let mut elem = Type::Nil;
                for (i, a) in args.iter().enumerate() {
                    let t = self.infer(a)?;
                    elem = if i == 0 { t } else { join(&elem, &t) };
                }
                if args.is_empty() { Ok(Type::Nil) } else { Ok(Type::list(elem)) }
            }
            PrimSig::Simple(Type::Fn { params, ret }) => {
                if params.len() != args.len() {
                    return Err(Error::type_error(
                        format!("{name} expects {} arg(s), got {}", params.len(), args.len()),
                        Some(span),
                    ));
                }
                for (p, a) in params.iter().zip(args.iter()) {
                    self.check(a, p, span)?;
                }
                Ok(*ret)
            }
            PrimSig::Simple(other) => Ok(other),
            PrimSig::Variadic { param, ret } => {
                for a in args {
                    self.check(a, &param, span)?;
                }
                Ok(ret)
            }
        }
    }

    fn infer_arithmetic(&mut self, op: &str, args: &[Expr], span: Span) -> Result<Type, Error> {
        if (op == "-" || op == "/") && args.is_empty() {
            return Err(Error::type_error(format!("{op} requires at least 1 arg"), Some(span)));
        }
        let mut all_int = true;
        let mut any_float = false;
        let mut had_dynamic = false;
        for a in args {
            let t = self.infer(a)?;
            if !is_subtype(&t, &Type::Num) {
                return Err(Error::type_error(
                    format!("{op} expects numeric args, got {t}"), Some(span),
                ));
            }
            match t {
                Type::Int   => {}
                Type::Float => { any_float = true; all_int = false; }
                Type::Num   => { all_int = false; }
                Type::Any   => { all_int = false; had_dynamic = true; }
                _ => unreachable!("non-num passed is_subtype Num check"),
            }
        }
        // (/ int) returns Float (1/x). For other ops with single Int arg,
        // result stays Int (negation, identity multiply, etc.)
        if op == "/" && args.len() == 1 && all_int { return Ok(Type::Float); }
        Ok(if any_float    { Type::Float }
           else if all_int && !args.is_empty() { Type::Int }
           else if had_dynamic { Type::Any }
           else { Type::Num })
    }

    fn infer_comparison(&mut self, op: &str, args: &[Expr], span: Span) -> Result<Type, Error> {
        for a in args {
            let t = self.infer(a)?;
            if !is_subtype(&t, &Type::Num) {
                return Err(Error::type_error(
                    format!("{op} expects numeric args, got {t}"), Some(span),
                ));
            }
        }
        Ok(Type::Bool)
    }

    // ─── lookup + helpers ──────────────────────────────────────────────

    fn lookup(&mut self, name: &str) -> Type {
        if let Some((_, t)) = self.locals.iter().rev().find(|(n, _)| n == name) {
            return t.clone();
        }
        let key = self.globals.interner.intern(name);
        if let Some(t) = self.globals.type_env.get(&key) {
            return t.clone();
        }
        // Prelude name?
        if let Some(sig) = prelude_sig(name) {
            return match sig {
                PrimSig::Simple(t) => t,
                _ => Type::Any, // variadic/refined ones live behind the dispatcher
            };
        }
        Type::Any
    }

    fn unpack_bindings(&self, e: &Expr, span: Span) -> Result<Vec<(String, Expr)>, Error> {
        let Expr::List(items, _) = e else {
            return Err(Error::type_error("let bindings must be a list", Some(span)));
        };
        let mut out = Vec::with_capacity(items.len());
        for b in items {
            let Expr::List(parts, _) = b else {
                return Err(Error::type_error("let binding must be (name expr)", Some(span)));
            };
            if parts.len() != 2 {
                return Err(Error::type_error("let binding must be (name expr)", Some(span)));
            }
            let Expr::Sym(name, _) = &parts[0] else {
                return Err(Error::type_error("let binding name must be a symbol", Some(span)));
            };
            out.push((name.clone(), parts[1].clone()));
        }
        Ok(out)
    }

    fn unpack_params(&self, e: &Expr, span: Span) -> Result<Vec<String>, Error> {
        let Expr::List(items, _) = e else {
            return Err(Error::type_error("lambda params must be a list", Some(span)));
        };
        let mut out = Vec::with_capacity(items.len());
        for p in items {
            let Expr::Sym(s, _) = p else {
                return Err(Error::type_error("lambda param must be a symbol", Some(span)));
            };
            out.push(s.clone());
        }
        Ok(out)
    }

    // ─── type expression parser ────────────────────────────────────────

    fn parse_type(&self, e: &Expr) -> Result<Type, Error> {
        match e {
            Expr::Sym(s, sp) => Self::parse_atom_type(s).ok_or_else(|| {
                Error::type_error(format!("unknown type `{s}`"), Some(*sp))
            }),
            Expr::List(items, sp) => {
                let Some(Expr::Sym(head, _)) = items.first() else {
                    return Err(Error::type_error("type ctor must start with a symbol", Some(*sp)));
                };
                match head.as_str() {
                    "List" => {
                        if items.len() != 2 {
                            return Err(Error::type_error("(List T)", Some(*sp)));
                        }
                        let t = self.parse_type(&items[1])?;
                        Ok(Type::list(t))
                    }
                    "->" => {
                        if items.len() < 2 {
                            return Err(Error::type_error("(-> ... Ret) needs a return type", Some(*sp)));
                        }
                        let rest = &items[1..];
                        let ret = self.parse_type(&rest[rest.len() - 1])?;
                        let mut params = Vec::with_capacity(rest.len() - 1);
                        for p in &rest[..rest.len() - 1] {
                            params.push(self.parse_type(p)?);
                        }
                        Ok(Type::func(params, ret))
                    }
                    other => Err(Error::type_error(
                        format!("unknown type ctor `{other}`"), Some(*sp),
                    )),
                }
            }
            other => Err(Error::type_error(
                "type expression must be a symbol or list", Some(other.span()),
            )),
        }
    }

    fn parse_atom_type(s: &str) -> Option<Type> {
        Some(match s {
            "Any"    => Type::Any,
            "Nil"    => Type::Nil,
            "Bool"   => Type::Bool,
            "Int"    => Type::Int,
            "Float"  => Type::Float,
            "Num"    => Type::Num,
            "Str"    => Type::Str,
            "Symbol" => Type::Symbol,
            _ => return None,
        })
    }
}

