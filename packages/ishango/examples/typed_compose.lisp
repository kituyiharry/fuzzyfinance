; Higher-order: typed function composition.
;
; compose takes two (Int -> Int) functions and returns a new (Int -> Int).
; The inner lambda is itself ascribed so the checker has a return type
; to push down when checking its body.

(define compose
  (the (-> (-> Int Int) (-> Int Int) (-> Int Int))
    (lambda (f g)
      (the (-> Int Int)
        (lambda (x) (f (g x)))))))

(define inc (the (-> Int Int) (lambda (x) (+ x 1))))
(define dbl (the (-> Int Int) (lambda (x) (* x 2))))

(define inc-then-dbl (compose dbl inc))
(define dbl-then-inc (compose inc dbl))

(print "(inc-then-dbl 5) =" (inc-then-dbl 5))   ; (5 + 1) * 2 = 12
(print "(dbl-then-inc 5) =" (dbl-then-inc 5))   ; (5 * 2) + 1 = 11
