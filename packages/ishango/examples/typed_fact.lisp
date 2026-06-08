; Annotated factorial.
;
; The (the …) form ties the lambda's shape down to (Int -> Int), so:
;   • Passing a non-Int to fact would fail type-checking.
;   • Returning anything that isn't Int from the body would fail too.
;   • Recursive calls to fact are checked against the same shape.
;
; Try `cargo run -p ishango -- examples/typed_fact.lisp` and watch it
; print 3628800.

(define fact
  (the (-> Int Int)
    (lambda (n)
      (if (= n 0)
          1
          (* n (fact (- n 1)))))))

(print "fact(10) =" (fact 10))
