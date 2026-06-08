; Demonstrates a *static* type error. Running this with
;
;   cargo run -p ishango -- examples/typed_error.lisp
;
; should print a Stage::Type error and refuse to run the program —
; the (+ x "no") expression violates the (Int -> Int) annotation
; on the lambda, because x is declared Int but the string forces
; the result to be non-numeric.
;
; This file is intentionally rejected by the checker — keep it as
; a smoke-test of error reporting.

(define busted
  (the (-> Int Int)
    (lambda (x) (+ x "no"))))

(print (busted 1))
