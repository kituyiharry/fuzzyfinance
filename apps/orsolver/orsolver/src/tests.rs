use crate::{solve, SolveStatus};

// ── helpers ──────────────────────────────────────────────────────────────────

fn assert_sat(model: &str) -> crate::SolveResult {
    let r = solve(model).expect("solver returned an error");
    assert_eq!(r.status, SolveStatus::Sat, "expected SAT, output:\n{}", r.output);
    r
}

fn assert_unsat(model: &str) {
    let r = solve(model).expect("solver returned an error");
    assert_eq!(r.status, SolveStatus::Unsat, "expected UNSAT, output:\n{}", r.output);
}

fn assert_var(output: &str, name: &str, value: &str) {
    let expected = format!("{name} = {value}");
    assert!(
        output.contains(&expected),
        "expected '{expected}' in output:\n{output}"
    );
}

// ── satisfiability ────────────────────────────────────────────────────────────

#[test]
fn test_simple_satisfy() {
    //let r = assert_sat("var 1..3: x; constraint x > 1; solve satisfy;");
    let r = assert_sat("var 2..3: x:: output_var;\nsolve  satisfy;\n");
    // Any value in 2..3 is valid
    assert!(
        r.output.contains("x = 2") || r.output.contains("x = 3"),
        "unexpected output:\n{}",
        r.output
    );
}

#[test]
fn test_equality_constraint() {
    //let r = assert_sat("var 1..10: x; constraint x = 7; solve satisfy;");
    let r = assert_sat("var 1..10: x:: output_var;\nconstraint int_eq(x,7):: domain_change_constraint;\nsolve  satisfy;\n");
    assert_var(&r.output, "x", "7");
}

#[test]
fn test_two_variables_sum() {
    //let r = assert_sat(
        //"var 1..5: a; var 1..5: b; \
         //constraint a + b = 6; \
         //constraint a < b; \
         //solve satisfy;",
    //);
    let r = assert_sat("array [1..2] of int: X_INTRODUCED_0_ = [1,1];\narray [1..2] of int: X_INTRODUCED_2_ = [1,-1];\nvar 1..5: a:: output_var;\nvar 1..5: b:: output_var;\nconstraint int_lin_eq(X_INTRODUCED_0_,[a,b],6);\nconstraint int_lin_le(X_INTRODUCED_2_,[a,b],-1);\nsolve  satisfy;\n"
    );
    // Only valid pair with a < b and a+b=6 in 1..5: (1,5) or (2,4)
    let valid = (r.output.contains("a = 1") && r.output.contains("b = 5"))
        || (r.output.contains("a = 2") && r.output.contains("b = 4"));
    assert!(valid, "unexpected output:\n{}", r.output);
}

#[test]
fn test_boolean_variable() {
    //let r = assert_sat("var bool: b; constraint b = true; solve satisfy;");
    let r = assert_sat("var bool: b:: output_var;\nconstraint bool_eq(b,true):: domain_change_constraint;\nsolve  satisfy;\n");
    assert_var(&r.output, "b", "true");
}

#[test]
fn test_unsatisfiable_domain() {
    // x must be > 5 but domain is 1..3
    //assert_unsat("var 1..3: x; constraint x > 5; solve satisfy;");
    assert_unsat("constraint bool_eq(false,true);\nsolve  satisfy;\n");
}

#[test]
fn test_unsatisfiable_contradictory_constraints() {
    assert_unsat(
        // "var 1..10: x; \
        //  constraint x > 7; \
        //  constraint x < 3; \
        //  solve satisfy;",
        "constraint bool_eq(false,true);\nsolve  satisfy;\n"
    );
}

// ── minimisation ─────────────────────────────────────────────────────────────

#[test]
fn test_minimize_single_var() {
    //let r = assert_sat("var 1..10: x; solve minimize x;");
    let r = assert_sat("var 1..10: x:: output_var;\nsolve  minimize x;\n");
    assert_var(&r.output, "x", "1");
    assert!(r.output.contains("=========="), "missing optimality marker");
}

#[test]
fn test_minimize_with_constraint() {
    //let r = assert_sat("var 1..10: x; constraint x >= 4; solve minimize x;");
    let r = assert_sat(
        "var 4..10: x:: output_var;\nsolve  minimize x;\n"
    );
    assert_var(&r.output, "x", "4");
}

#[test]
fn test_maximize_single_var() {
    //let r = assert_sat("var 1..10: x; solve maximize x;");
    let r = assert_sat(
        "var 1..10: x:: output_var;\nsolve  maximize x;\n"
    );
    assert_var(&r.output, "x", "10");
    assert!(r.output.contains("=========="), "missing optimality marker");
}

#[test]
fn test_maximize_with_constraint() {
    //let r = assert_sat("var 1..10: x; constraint x <= 6; solve maximize x;");
    let r = assert_sat(
        "var 1..6: x:: output_var;\nsolve  maximize x;\n"
    );
    assert_var(&r.output, "x", "6");
}

// ── multi-variable optimisation ───────────────────────────────────────────────

#[test]
fn test_minimize_sum_of_two() {
    // minimise a+b subject to a+b >= 8, a in 1..5, b in 1..5
    // NB: here the flatzinc doesn't signal that obj is an output var so i hand modified it. Note
    // this when an output isn't shown from straight parsed flatzinc - we added output_var along
    // with is_defined_var !!
    let r = assert_sat(
        // "var 1..5: a; var 1..5: b; \
        //  var int: obj = a + b; \
        //  constraint obj >= 8; \
        //  solve minimize obj;",
        "array [1..2] of int: X_INTRODUCED_2_ = [-1,-1];\nvar 1..5: a:: output_var;\nvar 1..5: b:: output_var;\nvar int: obj:: is_defined_var:: output_var;\nconstraint int_le(2,obj):: domain_change_constraint;\nconstraint int_le(obj,10):: domain_change_constraint;\nconstraint int_lin_le(X_INTRODUCED_2_,[a,b],-8);\nconstraint int_lin_eq([1,1,-1],[a,b,obj],0):: defines_var(obj);\nsolve  minimize obj;\n"
    );
    assert_var(&r.output, "obj", "8");
}

// ── array variables ───────────────────────────────────────────────────────────

#[test]
fn test_array_all_different() {
    // NB: Includes MUST be at the start and not the middle like in this example in order to get
    // proper flatzinc output!
    let r = assert_sat(
        // "array [1..3] of var 1..3: xs; \
        //  include \"alldifferent.fzn\"; \
        //  constraint alldifferent(xs); \
        //  solve satisfy;",
        "array [1..2] of int: X_INTRODUCED_19_ = [1,-1];\nvar 1..3: X_INTRODUCED_16_;\nvar 1..3: X_INTRODUCED_17_;\nvar 1..3: X_INTRODUCED_18_;\narray [1..3] of var int: xs:: output_array([1..3]) = [X_INTRODUCED_16_,X_INTRODUCED_17_,X_INTRODUCED_18_];\nconstraint int_lin_ne(X_INTRODUCED_19_,[X_INTRODUCED_16_,X_INTRODUCED_17_],0);\nconstraint int_lin_ne(X_INTRODUCED_19_,[X_INTRODUCED_16_,X_INTRODUCED_18_],0);\nconstraint int_lin_ne(X_INTRODUCED_19_,[X_INTRODUCED_17_,X_INTRODUCED_18_],0);\nsolve  satisfy;\n"
    );

    assert_var(&r.output, "xs", "array1d(1..3, [2, 3, 1]);");
    // Each of 1, 2, 3 must appear exactly once
    // assert!(r.output.contains("xs = ["), "missing array output:\n{}", r.output);
    // for v in ["1", "2", "3"] {
    //     assert!(
    //         r.output.contains(v),
    //         "value {v} missing from all-different result:\n{}",
    //         r.output
    //     );
    // }
}

#[test]
fn test_array_sum_constraint() {
    let r = assert_sat(
        // "array [1..3] of var 0..10: xs; \
        //  constraint xs[1] + xs[2] + xs[3] = 15; \
        //  constraint xs[1] = 5; \
        //  constraint xs[2] = 5; \
        //  solve satisfy;",
       "array [1..3] of int: X_INTRODUCED_3_ = [1,1,1];\nvar 0..10: X_INTRODUCED_2_;\narray [1..3] of var int: xs:: output_array([1..3]) = [5,5,X_INTRODUCED_2_];\nconstraint int_lin_eq(X_INTRODUCED_3_,[5,5,X_INTRODUCED_2_],15);\nsolve  satisfy;\n"
    );
    assert_var(&r.output, "xs", "array1d(1..3, [5, 5, 5])");
}

// ── output markers ────────────────────────────────────────────────────────────

#[test]
fn test_sat_output_contains_separator() {
    let r = assert_sat("var 1..3: x; solve satisfy;");
    assert!(r.output.contains("----------"), "missing solution separator");
}

// #[test]
// fn test_unsat_output_contains_marker() {
//     let r = solve("var 1..3: x; constraint x > 5; solve satisfy;")
//         .expect("solver returned an error");
//     assert!(
//         r.output.contains("=====UNSATISFIABLE====="),
//         "missing UNSATISFIABLE marker:\n{}",
//         r.output
//     );
// }

// ── error handling ────────────────────────────────────────────────────────────

#[test]
fn test_invalid_model_returns_error() {
    let result = solve("this is not valid flatzinc");
    assert!(result.is_err(), "expected an error for invalid FlatZinc");
}

#[test]
fn test_empty_model_returns_error() {
    let result = solve("");
    assert!(result.is_err(), "expected an error for empty model");
}

#[test]
fn test_null_byte_in_model_returns_error() {
    let result = solve("var 1..3: x;\0 solve satisfy;");
    assert!(result.is_err(), "expected an error for model containing null byte");
}
