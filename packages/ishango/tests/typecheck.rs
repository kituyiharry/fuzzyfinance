//! Bidirectional checker tests. Each case targets one piece of the
//! checker: ascription, lambda body checking, list refinement, branch
//! joining, hoisting, prelude dispatch, or a mismatch that should fire.

use ishango::{type_check, Stage};

fn ok(src: &str) {
    if let Err(e) = type_check(src) {
        panic!("expected type-check ok, got {e}");
    }
}

fn type_err(src: &str) -> ishango::Error {
    match type_check(src) {
        Ok(()) => panic!("expected type error, got ok"),
        Err(e) => {
            assert_eq!(e.stage, Stage::Type, "wrong stage: {e}");
            e
        }
    }
}

// ─── unannotated code is fully accepted ────────────────────────────────

#[test]
fn unannotated_program_checks() {
    ok("(define f (lambda (x) (+ x 1))) (f 5)");
}

#[test]
fn unannotated_arithmetic_checks() {
    ok("(let ((x 10) (y 20)) (+ x y))");
}

#[test]
fn unannotated_factorial_checks() {
    ok("
        (define fact (lambda (n) (if (= n 0) 1 (* n (fact (- n 1))))))
        (fact 6)
    ");
}

// ─── happy path: ascription succeeds ───────────────────────────────────

#[test]
fn the_int_int() {
    ok("(the Int 42)");
}

#[test]
fn the_arithmetic_int() {
    ok("(the Int (+ 1 2 3))");
}

#[test]
fn the_arithmetic_float() {
    ok("(the Float (+ 1 2.0))");
}

#[test]
fn the_lambda_typed() {
    ok("(the (-> Int Int) (lambda (x) (* x x)))");
}

#[test]
fn the_lambda_call_at_define() {
    ok("
        (define square (the (-> Int Int) (lambda (x) (* x x))))
        (square 7)
    ");
}

#[test]
fn the_recursive_factorial() {
    ok("
        (define fact
          (the (-> Int Int)
            (lambda (n) (if (= n 0) 1 (* n (fact (- n 1)))))))
        (fact 6)
    ");
}

#[test]
fn the_list_refines_via_list_ctor() {
    ok("(the (List Int) (list 1 2 3))");
}

#[test]
fn the_list_refines_via_cons() {
    ok("(the (List Int) (cons 1 (cons 2 nil)))");
}

#[test]
fn the_list_nil_is_valid_empty() {
    ok("(the (List Int) nil)");
}

#[test]
fn the_if_branches_match() {
    ok("(the Int (if #t 1 2))");
}

#[test]
fn the_let_body_matches() {
    ok("(the Int (let ((x 10)) (* x x)))");
}

#[test]
fn higher_order_with_function_param() {
    ok("
        (define apply2
          (the (-> (-> Int Int) Int Int)
            (lambda (f x) (f (f x)))))
        (apply2 (the (-> Int Int) (lambda (n) (+ n 1))) 0)
    ");
}

// ─── mismatches: the checker fires ─────────────────────────────────────

#[test]
fn the_int_str_mismatch() {
    let e = type_err(r#"(the Int "foo")"#);
    assert!(e.message.contains("expected Int"), "got {e}");
}

#[test]
fn the_lambda_wrong_return() {
    let e = type_err(r#"(the (-> Int Int) (lambda (x) "no"))"#);
    assert!(e.message.contains("expected Int"), "got {e}");
}

#[test]
fn the_lambda_wrong_param_use() {
    // x is declared Int; using it as a string should fail.
    let e = type_err(r#"(the (-> Int Int) (lambda (x) (+ x "no")))"#);
    assert!(e.message.contains("numeric") || e.message.contains("Str"), "got {e}");
}

#[test]
fn arithmetic_with_string_arg() {
    let e = type_err(r#"(+ 1 "foo")"#);
    assert!(e.message.contains("numeric"), "got {e}");
}

#[test]
fn the_int_loses_to_float_result() {
    // 1 + 1.0 statically returns Float, not Int.
    let e = type_err("(the Int (+ 1 1.0))");
    assert!(e.message.contains("Float"), "got {e}");
}

#[test]
fn the_list_int_with_str_element() {
    let e = type_err(r#"(the (List Int) (list 1 2 "three"))"#);
    assert!(e.message.contains("Int"), "got {e}");
}

#[test]
fn typed_fn_called_with_wrong_arg() {
    let e = type_err(r#"
        (define square (the (-> Int Int) (lambda (x) (* x x))))
        (square "no")
    "#);
    assert!(e.message.contains("Int"), "got {e}");
}

#[test]
fn typed_fn_called_with_too_few_args() {
    let e = type_err(r#"
        (define add (the (-> Int Int Int) (lambda (a b) (+ a b))))
        (add 1)
    "#);
    assert!(e.message.contains("expects"), "got {e}");
}

#[test]
fn the_if_branches_disagree_with_expected() {
    // then-branch is Int (OK), else-branch is Str (not OK).
    let e = type_err(r#"(the Int (if #t 1 "no"))"#);
    assert!(e.message.contains("Int") || e.message.contains("Str"), "got {e}");
}

#[test]
fn unknown_type_name() {
    let e = type_err("(the Frobnicator 42)");
    assert!(e.message.contains("unknown type"), "got {e}");
}

// ─── hoisting: mutual recursion type-checks ────────────────────────────

#[test]
fn mutual_recursion_with_annotations() {
    ok("
        (define ev? (the (-> Int Bool) (lambda (n) (if (= n 0) #t (od? (- n 1))))))
        (define od? (the (-> Int Bool) (lambda (n) (if (= n 0) #f (ev? (- n 1))))))
        (ev? 4)
    ");
}

#[test]
fn mutual_recursion_one_annotated_other_not_breaks() {
    // ev? is annotated and expects Bool, od? is untyped (Any).
    // Calling ev? with the right shape works because od? returning Any
    // is acceptable in a Bool context — Any is bidirectionally permissive.
    ok("
        (define ev? (the (-> Int Bool) (lambda (n) (if (= n 0) #t (od? (- n 1))))))
        (define od? (lambda (n) (if (= n 0) #f (ev? (- n 1)))))
        (ev? 4)
    ");
}

// ─── prelude refinement details ────────────────────────────────────────

#[test]
fn arithmetic_int_int_returns_int() {
    ok("(the Int (+ 1 2))");
    ok("(the Int (* 3 4))");
    ok("(the Int (- 10 1))");
}

#[test]
fn unary_div_returns_float() {
    ok("(the Float (/ 2))");
    let e = type_err("(the Int (/ 2))");
    assert!(e.message.contains("Float"), "got {e}");
}

#[test]
fn comparison_returns_bool() {
    ok("(the Bool (< 1 2 3))");
    ok("(the Bool (= 1 1))");
}

#[test]
fn null_predicate_returns_bool() {
    ok("(the Bool (null? nil))");
    ok("(the Bool (null? (list 1)))");
}

#[test]
fn quoted_symbol_is_symbol() {
    ok("(the Symbol 'foo)");
}

#[test]
fn quoted_list_is_list_any() {
    ok("(the (List Any) '(1 2 3))");
}

// ─── subtyping ─────────────────────────────────────────────────────────

#[test]
fn int_widens_to_num() {
    ok("(the Num 42)");
}

#[test]
fn float_widens_to_num() {
    ok("(the Num 3.14)");
}

#[test]
fn num_does_not_narrow_to_int() {
    let e = type_err("(the Int (the Num 42))");
    assert!(e.message.contains("Int"), "got {e}");
}

#[test]
fn any_is_universal_escape_hatch() {
    // Any in either direction always succeeds — preserves dynamic interop.
    ok("(the Any 42)");
    ok("(the Int (the Any 42))");
}

// ─── aliases: defun / head / tail ──────────────────────────────────────

#[test]
fn defun_alias_checks_like_define() {
    ok("
        (defun square (the (-> Int Int) (lambda (x) (* x x))))
        (square 7)
    ");
}

#[test]
fn defun_alias_fires_same_type_errors() {
    let e = type_err(r#"
        (defun bad (the (-> Int Int) (lambda (x) "no")))
        (bad 1)
    "#);
    assert!(e.message.contains("expected Int"), "got {e}");
}

#[test]
fn head_tail_aliases_check() {
    ok("(head (list 1 2 3))");
    ok("(tail (list 1 2 3))");
}
