use std::rc::Rc;

use ishango::{env::Globals, run, run_with, Stage, Value};
use ishango::builtins::install_prelude;

fn run_ok(src: &str) -> Value {
    match run(src) {
        Ok(v) => v,
        Err(e) => panic!("expected ok, got {e}"),
    }
}

fn run_err(src: &str) -> ishango::Error {
    match run(src) {
        Ok(v)  => panic!("expected error, got value: {v}"),
        Err(e) => e,
    }
}

#[test]
fn add_two_ints() {
    assert_eq!(run_ok("(+ 1 2)"), Value::Int(3));
}

#[test]
fn sub_variadic() {
    assert_eq!(run_ok("(- 10 3 2)"), Value::Int(5));
}

#[test]
fn mixed_int_float_promotes() {
    assert_eq!(run_ok("(* 2 3.5)"), Value::Float(7.0));
}

#[test]
fn let_binds_and_adds() {
    assert_eq!(run_ok("(let ((x 10) (y 20)) (+ x y))"), Value::Int(30));
}

#[test]
fn if_with_quoted_symbols() {
    let v = run_ok("(if (< 1 2) 'yes 'no)");
    match v {
        Value::Symbol(s) => assert_eq!(&*s, "yes"),
        other => panic!("expected symbol, got {other}"),
    }
}

#[test]
fn define_and_apply_lambda() {
    assert_eq!(
        run_ok("(define square (lambda (x) (* x x))) (square 7)"),
        Value::Int(49),
    );
}

#[test]
fn factorial_recursion() {
    let src = "
        (define fact
            (lambda (n)
                (if (= n 0) 1 (* n (fact (- n 1))))))
        (fact 6)
    ";
    assert_eq!(run_ok(src), Value::Int(720));
}

#[test]
fn higher_order_apply_twice() {
    let src = "((lambda (f x) (f (f x))) (lambda (n) (+ n 1)) 0)";
    assert_eq!(run_ok(src), Value::Int(2));
}

#[test]
fn cons_and_car() {
    assert_eq!(run_ok("(car (cons 1 (cons 2 nil)))"), Value::Int(1));
}

#[test]
fn cons_and_cdr() {
    let v = run_ok("(cdr (cons 1 (cons 2 nil)))");
    match v {
        Value::List(xs) => {
            assert_eq!(xs.len(), 1);
            assert_eq!(xs[0], Value::Int(2));
        }
        other => panic!("expected list, got {other}"),
    }
}

#[test]
fn closure_captures_outer_local() {
    let src = "
        (define mk (lambda (n) (lambda () n)))
        ((mk 42))
    ";
    assert_eq!(run_ok(src), Value::Int(42));
}

#[test]
fn divide_by_zero_is_runtime_error() {
    let e = run_err("(/ 1 0)");
    assert_eq!(e.stage, Stage::Runtime);
    assert!(e.message.contains("division by zero"), "got {e}");
}

#[test]
fn unclosed_paren_is_parse_error() {
    let e = run_err("(+ 1");
    assert_eq!(e.stage, Stage::Parse);
}

#[test]
fn null_predicate() {
    assert_eq!(run_ok("(null? nil)"), Value::Bool(true));
    assert_eq!(run_ok("(null? (list))"), Value::Bool(true));
    assert_eq!(run_ok("(null? (list 1))"), Value::Bool(false));
}

#[test]
fn comparison_chain() {
    assert_eq!(run_ok("(< 1 2 3 4)"), Value::Bool(true));
    assert_eq!(run_ok("(< 1 2 2 4)"), Value::Bool(false));
}

// ─── alias forms: defun, head, tail ───────────────────────────────────

#[test]
fn defun_is_alias_for_define() {
    assert_eq!(
        run_ok("(defun square (lambda (x) (* x x))) (square 6)"),
        Value::Int(36),
    );
}

#[test]
fn defun_with_type_annotation() {
    // defun + the should be indistinguishable from define + the.
    assert_eq!(
        run_ok("
            (defun cube (the (-> Int Int) (lambda (x) (* x (* x x)))))
            (cube 3)
        "),
        Value::Int(27),
    );
}

#[test]
fn head_alias() {
    assert_eq!(run_ok("(head (list 10 20 30))"), Value::Int(10));
}

#[test]
fn tail_alias() {
    let v = run_ok("(tail (list 10 20 30))");
    match v {
        Value::List(xs) => {
            assert_eq!(xs.len(), 2);
            assert_eq!(xs[0], Value::Int(20));
            assert_eq!(xs[1], Value::Int(30));
        }
        other => panic!("expected list, got {other}"),
    }
}

#[test]
fn head_tail_mixed_with_car_cdr() {
    // Aliases interop with the original names — they reach the same code.
    assert_eq!(run_ok("(car (tail (list 1 2 3)))"), Value::Int(2));
    assert_eq!(run_ok("(head (cdr (list 1 2 3)))"), Value::Int(2));
}

#[test]
fn equal_chain() {
    assert_eq!(run_ok("(= 3 3 3)"), Value::Bool(true));
    assert_eq!(run_ok("(= 3 3 4)"), Value::Bool(false));
}

/// Two textually-identical quoted symbols evaluated in the *same* Globals
/// must end up backed by the same `Rc<str>` — that's the whole point of
/// the interner.
#[test]
fn symbols_are_interned() {
    let mut g = Globals::new();
    install_prelude(&mut g);
    let a = run_with("'foo", &mut g).unwrap();
    let b = run_with("'foo", &mut g).unwrap();
    match (a, b) {
        (Value::Symbol(sa), Value::Symbol(sb)) => assert!(Rc::ptr_eq(&sa, &sb)),
        other => panic!("expected two symbols, got {other:?}"),
    }
}

/// Identical string literals share storage too.
#[test]
fn strings_are_interned() {
    let mut g = Globals::new();
    install_prelude(&mut g);
    let a = run_with(r#""hello""#, &mut g).unwrap();
    let b = run_with(r#""hello""#, &mut g).unwrap();
    match (a, b) {
        (Value::Str(sa), Value::Str(sb)) => assert!(Rc::ptr_eq(&sa, &sb)),
        other => panic!("expected two strings, got {other:?}"),
    }
}
