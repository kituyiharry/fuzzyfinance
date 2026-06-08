; Typed list construction and consumption.
;
; The checker refines (cons …) and (list …) against an expected
; (List T), so each element must satisfy T. nil counts as the
; empty list for any element type.

(define nums (the (List Int) (list 1 2 3 4 5)))

; sum : (List Int) -> Int
(define sum
  ;(the (-> (List Int) Int)
    (lambda (xs)
      (if (null? xs)
          0
          (+ (car xs) (sum (cdr xs))))))
  ;)

(print "sum(1..5) =" (sum nums))
