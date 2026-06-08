id = lambda(_, _);

t = true;
f = false;
nil = #null!;

tao = lambda(conditional,
             if(conditional,
                1,
                0));

tao? = lambda(input,
              or(zero?(input),
                 one?(input)));

string = lambda(entity,
                text(entity, “0.0”));
                
string? = lambda(entity,
                 istext(entity));

number? = lambda(entity,
                 isnumber(entity));

; Comparatives
equal? = lambda(a, b,
                a = b);
                
unequal? = lambda(a, b,
                  not(equal?(a, b)));

zero? = lambda(x,
               x = 0);

one? = lambda(x,
              x = 1);

two? = lambda(x,
              x = 2);

gt? = lambda(x, y,
             if(x > y,
                t,
                f));

gte? = lambda(x, y,
              if(x >= y,
                 t,
                 f));

lt? = lambda(x, y,
             if(x < y,
                t,
                f));

lte? = lambda(x, y,
              if(x <= y,
                 t,
                 t));

positive? = lambda(x,
                   gt?(x, 0));

negative? = lambda(x,
                   lt?(x, 0));

; Conditionals
omitted? = lambda(entity,
                  isomitted(entity));

provided? = lambda(entity,
                   not(omitted?(entity)));

cond = lambda(condition1, result1,
             [condition2], [result2],
             [condition3], [result3],
             [condition4], [result4],
             let(both, lambda(condition, result,
                              and(provided?(condition), provided?(result))),
                 first_complete, both(condition1, result1),
                 second_complete, both(condition2, result2),
                 third_complete, both(condition3, result3),
                 fourth_complete, both(condition4, result3),
                 if(first_complete,
                    if(condition1,
                       result1,
                       if(second_complete,
                          if(condition2,
                             result2,
                             if(third_complete,
                                if(condition3,
                                   result3,
                                   if(fourth_complete,
                                      if(condition4,
                                         result4,
                                         f),
                                      f)),
                                f)),
                         nil)))));

; List Processing
car = lambda(input,
             cond(matrix?(input), nil,
                  list?(input), index(input, 1, 1),
                  cell?(input), let(char, left(string(input), 1),
                                    iferror(value(char),
                                            char))));

cell? = lambda(range,
               let(rows, rows(range),
                   columns, columns(range),
                   if(one?(product(rows, columns)),
                      t,
                      f)));

list? = lambda(range,
               if(one?(dimensions(range)),
                  t,
                  f));

matrix? = lambda(range,
                 gt?(dimensions(range), 1));

dimensions = lambda(range,
                    let(rows, rows(range),
                        columns, columns(range),
                        larger, max(rows, columns),
                        area, product(rows, columns),
                        if(gt?(area, larger),
                           imdiv(area, larger),
                           1)));
