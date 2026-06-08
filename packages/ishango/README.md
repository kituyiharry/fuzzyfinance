# Ishango

A small Lisp evaluator written in Rust. Ships as both a library and a CLI
binary. Designed to host future analysis routines over FuzzyFinance exports —
hand-written or AI-generated — with hooks reserved for embedding miniKanren
and other domain modules.

```sh
cargo run -p ishango -- -e '(+ 1 2)'                 # → 3
cargo run -p ishango -- path/to/script.lisp          # run a file
cargo run -p ishango                                 # interactive REPL
```

## Pipeline

```
source ──► lexer ──► parser ──► check ──► compiler ──► VM
 &str       Vec<Token>  Vec<Expr>   ✓        Chunk        Value
```

Six stages, one module each. The `check` pass is bidirectional and
optional — programs without `the` annotations sail through unchanged
(see [Optional static types](#optional-static-types) below).
`ishango::run(source)` runs the whole pipeline with the standard prelude
installed; `ishango::run_with(source, &mut globals)` lets callers register
host bindings (native functions, future data adapters) before evaluation.

## Grammar (BNF)

```
program       ::= form*
form          ::= expr

expr          ::= atom | list | quote-form
atom          ::= nil | bool | int | float | string | symbol
list          ::= '(' expr* ')'
quote-form    ::= "'" expr                                     ; reader sugar
              |   '(' "quote" expr ')'

nil           ::= "nil"
bool          ::= "#t" | "#f"
int           ::= /-?[0-9]+/
float         ::= /-?[0-9]+\.[0-9]+([eE]-?[0-9]+)?/
              |   /-?[0-9]+[eE]-?[0-9]+/
string        ::= '"' (escape | <any char except '"' or '\\'>)* '"'
escape        ::= '\\' ('n' | 't' | 'r' | '\\' | '"')
symbol        ::= /[^ \t\r\n();"']+/                           ; if not nil/#t/#f/int/float

comment       ::= ';' /[^\n]*/                                 ; lexer skips
```

Symbols are *whatever's left*: the lexer eats characters up to the next
delimiter (whitespace, parens, quote, semicolon) and tries `i64::from_str`
then `f64::from_str` (gated on the literal containing `.`, `e`, or `E`).
Anything else becomes a symbol — so `+`, `-`, `<=`, `null?`, `mk-list` are
all symbols.

Special forms are syntactically just lists with a reserved head symbol.
The compiler recognises them; the parser does not:

```
if-form       ::= '(' "if" expr expr expr? ')'
let-form      ::= '(' "let" '(' binding* ')' expr+ ')'
binding       ::= '(' symbol expr ')'
lambda-form   ::= '(' "lambda" '(' symbol* ')' expr+ ')'
define-form   ::= '(' "define" symbol expr ')'
set-form      ::= '(' "set!" symbol expr ')'
begin-form    ::= '(' "begin" expr+ ')'
call          ::= '(' expr expr* ')'                           ; fallback
```

Reserved heads: `if`, `let`, `lambda`, `define` (alias `defun`), `set!`, `begin`, `quote`, `the`.
A symbol with one of these names cannot be used as a normal variable in
head position.

## Atoms

| Literal       | `Value` variant   | Notes                                              |
|---------------|-------------------|----------------------------------------------------|
| `nil`         | `Nil`             | Falsy. `null?` returns `#t`.                       |
| `#t` / `#f`   | `Bool`            | `#f` is the *only* false value besides `nil`.      |
| `42`          | `Int(i64)`        | Wrapping arithmetic.                               |
| `3.14`        | `Float(f64)`      | Mixed arithmetic promotes `Int → Float`.           |
| `"foo"`       | `Str(Rc<String>)` | Escapes `\n \t \r \\ \"`.                          |
| `foo`         | Variable lookup   | Resolves to local / capture / global at compile.   |
| `'foo`        | `Symbol`          | After `quote`, the symbol itself is the value.     |
| `'(1 2 3)`    | `List`            | Quoted list of values.                             |

A `Value::Closure` or `Value::Native` cannot be written as a literal — they
only arise from `lambda` evaluation or prelude registration.

## Prelude

All natives are variadic unless noted. Errors surface as `Stage::Runtime`.

| Name      | Arity      | Behaviour                                                    |
|-----------|------------|--------------------------------------------------------------|
| `+`       | n ≥ 0      | Sum. Int → Int unless any arg is Float (then Float).         |
| `-`       | n ≥ 1      | `(- x)` negates; `(- a b c …)` left-folds subtraction.       |
| `*`       | n ≥ 0      | Product. Promotes like `+`.                                  |
| `/`       | n ≥ 1      | `(/ x)` ⇒ `1/x` (Float). Otherwise left-fold. Errors on `0`. |
| `=`       | n ≥ 0      | All arguments structurally equal (Int and Float compare numerically). |
| `<` `>` `<=` `>=` | n ≥ 0 | Pair-wise chain on numeric arguments.                      |
| `cons`    | 2          | `(cons head tail)` — tail must be `nil` or a list.           |
| `car` / `head` | 1     | First element of a non-empty list.                           |
| `cdr` / `tail` | 1     | Tail of a non-empty list; returns `nil` if length 1.         |
| `list`    | n ≥ 0      | `(list)` ⇒ `nil`; otherwise a fresh list of the args.        |
| `null?`   | 1          | `#t` iff `nil` or the empty list.                            |
| `print`   | n ≥ 0      | Print values space-separated, newline-terminated. Returns `nil`. |

Closures and natives compare by reference identity (`Rc::ptr_eq`).

## Special forms

| Form                     | Semantics                                                                |
|--------------------------|--------------------------------------------------------------------------|
| `(quote x)` / `'x`       | Returns `x` unevaluated as a value.                                      |
| `(if c t e)` / `(if c t)`| Standard. Missing `else` ⇒ `nil`. Falsy = `nil` or `#f`.                 |
| `(let ((n e) …) body…)`  | Evaluates each `e` in the *enclosing* scope, binds new locals, runs body. |
| `(lambda (p…) body…)`    | Creates a closure capturing free variables (see below).                  |
| `(define name expr)` / `(defun name expr)` | Top-level binding: stores into globals. Returns `nil`. `defun` is a familiarity alias for `define`. |
| `(set! name expr)`       | Mutates a local or global. **Cannot** mutate a captured variable in v1.  |
| `(begin e1 e2 … eN)`     | Sequential evaluation; result is `eN`.                                   |

The top-level of a program is wrapped in an implicit `begin`.

## Closures and capture

Closures use **flat captures**, Lua-style. Each `lambda`'s compiled
prototype carries a static list of `CaptureSrc` entries that tell the VM how
to gather each captured value at `MakeClosure` time, from the *immediately
enclosing* function's frame:

```rust
pub enum CaptureSrc {
    EnclosingLocal(u16),    // read enclosing frame's locals[i]
    EnclosingCapture(u16),  // read enclosing closure's captures[i]
}
```

When the compiler sees a free variable inside a lambda, it walks the stack
of enclosing functions from inside-out and, for each layer it crosses, adds
a capture entry that *forwards* the value down to the inner lambda. The
inner lambda's resolution always becomes `LoadCapture(i)`; everything
between is plumbed transparently.

Example — two levels of nesting:

```lisp
(define mk
  (lambda (a)                  ; outer:  local 0 = a
    (lambda (b)                 ; middle: local 0 = b
      (lambda ()                ; inner:  free vars a and b
        (+ a b)))))

(((mk 1) 2))                    ; ⇒ 3
```

While compiling the innermost lambda, the compiler builds:

```
inner.captures = [
    EnclosingCapture(0),   // a — fetched from middle's captures[0]
    EnclosingLocal(0),     // b — fetched from middle's locals[0]
]
middle.captures = [
    EnclosingLocal(0),     // a — fetched from outer's locals[0]
]
outer.captures = []
```

At runtime:
1. `(mk 1)` runs outer with `a=1` in `locals[0]`.
   `MakeClosure` for middle reads `EnclosingLocal(0)` → `1` → middle.captures[0].
2. `((mk 1) 2)` runs middle with `b=2` in `locals[0]`.
   `MakeClosure` for inner reads `EnclosingCapture(0)` → `1` and
   `EnclosingLocal(0)` → `2`, producing inner.captures = `[1, 2]`.
3. The inner closure call runs `(+ a b)` as
   `LoadCapture(0); LoadCapture(1); Call(+)` → `3`.

**Limitation.** Captures are *copies of values*, not shared slots, so
`(set! a …)` from inside a closure cannot mutate the outer binding. The
compiler refuses such `set!` with a clear error and points at v2 work.

## Optional static types

Ishango runs a small **bidirectional type checker** between parse and
compile (`src/check.rs`). It's opt-in by syntax: code that never mentions
the `the` annotation form stays fully dynamic, and the checker is a
no-op. Sprinkle one ascription and the checker enforces it.

Surface:

```text
(the TYPE EXPR)            ; assert that EXPR has type TYPE

Type ::= Any | Nil | Bool | Int | Float | Num | Str | Symbol
       | (List Type)
       | (-> T1 T2 ... TN Ret)
```

The lattice:

```
                Any
   ┌──────┬──────┬──────┬──────┬──────┬──────────┐
  Nil    Bool   Str   Symbol   Num   List<T>     Fn(...)
                                ├──┐
                              Int  Float
```

Notable rules:

- `Any` is **both top and bottom**: dynamic code never breaks typed code.
- `Int <: Num`, `Float <: Num`. `Num` does *not* narrow back.
- `Nil <: List<T>` for any `T` — the empty-list literal satisfies a typed
  list expectation without a cast.
- Function subtyping is contravariant on params, covariant on return.
- Lists are covariant in their element type (safe today; will become
  invariant if mutable list ops ever land).

Typed and untyped code mix freely. The checker only fires at *boundaries*
that you've ascribed — anything untouched widens to `Any`.

### Bidirectional refinement

Some forms are checked, not inferred, when the expected type is known:

- **Lambdas** against `(-> T1 ... Ret)` bind params to declared types and
  push `Ret` down into the body.
- **`(list …)`** and **`(cons h t)`** against `(List T)` check each
  element / head against `T`.
- **`if`** / **`let`** / **`begin`** push the outer expectation through
  to their result expression.

### Numeric precision

Arithmetic operators are *precision-aware*. `(+ Int Int) : Int`,
`(+ Int Float) : Float`, `(+ Int Any) : Any`. That's why
`(the Int (+ 1 2))` succeeds and `(the Int (+ 1 1.0))` fires a type
error.

### Top-level hoisting + mutual recursion

Before walking forms, the checker scans for
`(define name (the T …))` and pre-binds `name : T` in the global
type env. That makes mutually recursive functions check correctly:

```lisp
(define ev? (the (-> Int Bool) (lambda (n) (if (= n 0) #t (od? (- n 1))))))
(define od? (the (-> Int Bool) (lambda (n) (if (= n 0) #f (ev? (- n 1))))))
```

Names without a `the`-ascription get inferred and stored (less precise,
but adequate for dynamic recursion). The type env lives on `Globals`,
so a REPL `define` is remembered by the checker on the next line too.

### What this catches

- Calling a typed function with the wrong argument shape.
- Returning the wrong type from a typed lambda's body.
- Mixing strings with arithmetic primitives.
- `if`/`let`/`begin` whose result doesn't satisfy an outer ascription.
- Bad type names in `(the …)` annotations.

### What it doesn't (by design)

- Division by zero — runtime.
- `car` of empty list — runtime.
- Generic / polymorphic identity functions — `(lambda (x) x)` types as
  `(-> Any Any)` without a user annotation; for `(-> Int Int)` ascribe it.
- Heterogeneous quoted data — `'(1 "foo" 'bar)` types as `(List Any)`.
- Effects (mutation, IO) — not tracked separately.

### Try it

```sh
cargo run -p ishango -- packages/ishango/examples/typed_fact.lisp     # → 3628800
cargo run -p ishango -- packages/ishango/examples/typed_compose.lisp  # → 12, 11
cargo run -p ishango -- packages/ishango/examples/typed_list.lisp     # → 15
cargo run -p ishango -- packages/ishango/examples/typed_error.lisp    # → Stage::Type error
```

Or type-check without running:

```rust
use ishango::type_check;
type_check("(the Int 42)").unwrap();
assert!(type_check("(the Int \"foo\")").is_err());
```

## Memory: interning and constant dedup

Every symbol, global name, and string literal is backed by a single shared
`Rc<str>` per unique content. The interner lives on `Globals` so identifiers
are deduped across compilations — REPL sessions reuse storage from one input
line to the next.

```rust
// in src/env.rs
pub struct Interner { set: HashSet<Rc<str>> }
impl Interner {
    pub fn intern(&mut self, s: &str) -> Rc<str> { /* HashSet::get-or-insert */ }
}

pub struct Globals {
    pub map:      HashMap<Rc<str>, Value>,
    pub interner: Interner,
}
```

Anywhere a string would otherwise be allocated as a runtime `Value`, the
compiler routes it through `Globals::interner`:

| Source form                | Allocated by interner            |
|---------------------------|----------------------------------|
| Free-variable reference   | global name in `Chunk::global_names` |
| `(define name …)`         | same global name as above        |
| `'foo`                    | `Value::Symbol(Rc<str>)` in const pool |
| `"hello"`                 | `Value::Str(Rc<str>)` in const pool |
| `(global-fn …)` callee    | global name + symbol reuse       |

Two textually equal symbols compiled against the same `Globals` satisfy
`Rc::ptr_eq` — the tests assert this directly (`symbols_are_interned`,
`strings_are_interned`).

**Constant pool dedup.** `Compiler::add_const` linearly scans the current
chunk's `consts` for an existing equal entry before pushing a new one. It
covers `Nil`, `Bool`, `Int`, `Float`, `Str`, and `Symbol`. Aggregates
(`Value::List`) skip dedup — list equality is O(n) and lists are rare in
const pools. The scan is O(n) but n stays small for normal-sized
functions; bumping to a hash-keyed dedup is a one-line swap if it ever
shows up in profiles.

### Why not intern Expressions?

Hash-consing the AST (one shared `Rc<Expr>` per structurally-equal
sub-tree) was considered and rejected for v1:

- `Expr` carries a `Span` for diagnostics, so two textually-identical
  sub-expressions at different source positions are *unequal* by structure.
  Stripping spans before interning regains the dedup but loses error-message
  precision.
- The AST is short-lived — it exists only between parse and compile, and
  then drops. Memory pressure from the AST is dwarfed by the lifetime of
  `Chunk`, `Globals`, and runtime `Value`s, which are exactly what the
  constant-pool dedup + symbol interning already target.
- The values the AST eventually lowers to (`Value::Symbol`, `Value::Str`,
  literal numbers) are interned/deduped anyway, so AST hash-consing would
  duplicate work already happening one stage later.

If a future pass needs cross-function CSE (e.g. emitting the same
sub-expression in two `lambda` bodies as one shared chunk), it can hash
on bytecode rather than AST and stay independent of `Span` noise.

## Bytecode

Opcodes are a Rust enum (one byte tag + inline operands), not packed bytes:

| Op                         | Stack effect                                  |
|----------------------------|-----------------------------------------------|
| `LoadConst(u16)`           | push `chunk.consts[i]`                        |
| `LoadLocal(u16)`           | push `frame.locals[i]`                        |
| `StoreLocal(u16)`          | pop ⇒ `frame.locals[i]`                       |
| `LoadCapture(u16)`         | push `frame.closure.captures[i]`              |
| `LoadGlobal(u16)`          | push `globals[chunk.global_names[i]]`         |
| `StoreGlobal(u16)`         | pop ⇒ `globals[chunk.global_names[i]]`        |
| `MakeClosure(u16)`         | gather captures, push new `Closure`           |
| `Call(u8 argc)`            | stack layout `[…, callee, a1, …, aN]`; pushes result for natives, pushes a new frame for closures |
| `Return`                   | pop value, pop frame, push value into caller  |
| `Jump(i16)`                | `ip += off`                                   |
| `JumpIfFalse(i16)`         | pop; if falsy then `ip += off`                |
| `Pop`                      | pop and discard                               |

A `Chunk` carries `code`, the constant pool, the global-name table for
this chunk, the nested function `Proto`s referenced by `MakeClosure`, and
a precomputed `local_count` (the frame's locals vec is sized to this).

`Frame { chunk, closure, locals, ip }`. The `locals` vec is fixed-size
for the life of the call; slot indices come from the compiler.

## Parsing — why recursive descent

For a Lisp surface, recursive-descent over tokens is the canonical match:
forms are either an atom or a balanced `(...)`, and operator precedence is
non-existent.

Two alternatives were considered and rejected for v1:

- **Pratt parsing** is for infix precedence — useless here, but kept in
  reserve for a future infix DSL that lowers to the same `Expr`.
- **Sea-of-nodes** is an optimising IR (V8, Cranelift). Massive overkill
  for an analysis-script runtime; the bytecode VM is the right tier.

## Embedding

```rust
use ishango::{env::Globals, builtins, run_with, Value, Error};

fn main() -> Result<(), Error> {
    let mut g = Globals::new();
    builtins::install_prelude(&mut g);

    // Register a host function for the upcoming export-loading hook.
    g.define_native("answer", |_args| Ok(Value::Int(42)));

    let v = run_with("(+ (answer) 1)", &mut g)?;
    println!("{v}");   // 43
    Ok(())
}
```

`Value` is `#[non_exhaustive]` — a future `External(Rc<dyn Any>)` variant
will carry FuzzyFinance export rows / data frames without breaking
downstream match arms.

## Crate layout

```
packages/ishango/
├── Cargo.toml                  lib + bin targets; thiserror as the only dep
├── src/
│   ├── lib.rs                  module roots + run / run_with helpers
│   ├── error.rs                Error { stage, message, span } + Stage
│   ├── ast.rs                  Expr + Span
│   ├── lexer.rs                tokenize → Vec<Token>
│   ├── parser.rs               recursive-descent → Vec<Expr>
│   ├── value.rs                Value, Chunk, Op, Proto, Closure, CaptureSrc
│   ├── env.rs                  Globals (runtime) + Interner + type_env + define_native
│   ├── ty.rs                   Type lattice + is_subtype + join
│   ├── check.rs                bidirectional type checker
│   ├── compiler.rs             Expr → Chunk; special forms; closure capture
│   ├── vm.rs                   stack machine, Call/Return, MakeClosure
│   ├── builtins.rs             install_prelude (+ - * / = < > <= >=, list ops, print)
│   └── bin/
│       └── ishango.rs          REPL + `-e` + file runner
└── tests/
    └── programs.rs             end-to-end Lisp programs
```

## REPL

Two REPL backends, picked at compile time via the `repl` Cargo feature
(default-on, so `cargo install` ships the rich one):

| Build                                       | REPL behaviour                                              |
|---------------------------------------------|-------------------------------------------------------------|
| `cargo build -p ishango` *(default)*        | rustyline-based: arrow-key history, paren matching, tab completion |
| `cargo build -p ishango --no-default-features` | plain `stdin().read_line` loop, zero deps                 |

The library half (`lib.rs` and everything under `src/`) never references
rustyline — only the bin does, behind `#[cfg(feature = "repl")]`. Disabling
the feature is what keeps the wasm lib build clean.

The rich REPL provides:

- **History** persisted to `~/.ishango_history` (best effort; failure is silent).
- **Multi-line input on unbalanced parens.** Hitting Enter inside an open
  `(` switches to a continuation prompt; the validator only releases the
  form once the brackets balance. Powered by `MatchingBracketValidator`.
- **Live bracket highlighting** while editing.
- **Tab completion** against:
  - Special-form names (`if`, `let`, `lambda`, `define`, `set!`, `begin`, `quote`)
  - Literal keywords (`nil`, `#t`, `#f`)
  - Every global currently in `Globals` — which means the prelude
    (`+`, `cons`, `car`, …) and every name the user has `define`d since
    the session started. The completion list is refreshed after each
    successful evaluation via `editor.helper_mut()`.

The prompt is `ish> `. Quit with `:quit`, `:q`, or Ctrl-D.

If rustyline can't open the terminal (e.g. running in a non-TTY pipe), the
rich REPL falls back to the plain `stdin` loop automatically.

## Verifying locally

```sh
cargo build   -p ishango                                                # default = repl
cargo build   -p ishango --no-default-features                          # lib + plain REPL
cargo test    -p ishango
cargo clippy  -p ishango --all-targets -- -D warnings
cargo build   -p ishango --target wasm32-unknown-unknown --lib --no-default-features
cargo run -q  -p ishango -- -e '(let ((x 10)) (* x x))'   # → 100
```

## Benchmarks

`cargo bench -p ishango` runs `benches/core.rs` — a small hand-rolled
suite (no `criterion` dep, so the workspace stays buildable without
crates.io). Each scenario reports min / median / mean / p99 / max / total
over N iterations. Three groups are covered:

- **End-to-end (cold)** — full lex → parse → compile → run with a fresh
  `Globals` per iteration. The cost a one-off caller pays.
- **REPL-style (warm)** — the same scenario but with a `Globals` reused
  across iterations, so the interner already holds every symbol.
- **Pipeline stages** — lex, parse, compile, and `vm.run` measured
  separately on `fact(10)` so it's obvious where time goes.

Sample run on a 2024 MacBook (apple-silicon, release mode):

```
── end-to-end (fresh Globals per iteration) ──
  smallest expr     min= 416ns  median= 541ns  ...   (200,000 iters)
  (let)-nested      min=3.04µs  median=3.38µs  ...    (50,000 iters)
  fact(10)          min=4.33µs  median=5.00µs  ...    (20,000 iters)
  fact(15)          min=5.83µs  median=6.29µs  ...    (10,000 iters)
  fib(20)           min=4.53ms  median=5.14ms  ...     (1,000 iters)
  closure-heavy     min=4.17µs  median=4.46µs  ...    (50,000 iters)

── pipeline stages — fact(10) ──
  lex               min= 416ns  median= 500ns
  parse             min= 250ns  median= 292ns
  compile (cold)    min= 541ns  median= 625ns
  vm only           min=2.67µs  median=2.92µs
```

Two things to read out of that:

1. For small programs the **VM dominates** the runtime (~58% of fact(10)),
   not the front end. Front-end micro-optimisation will move the needle
   less than VM dispatch improvements (computed-goto, interned global
   lookup, tail-call op).
2. `fib(20)` does ~21k recursive calls and lands at ~5ms, so a `Call`
   round-trip costs ~240ns end-to-end including the arithmetic — a
   reasonable baseline for a stack VM in safe Rust without TCO.

Add a scenario by appending to the `pipeline_benches` list in
`benches/core.rs`; the report format is shared.

## Limitations (v1) and future work

- **No proper tail-call optimisation.** Recursion runs on the host stack;
  deep recursion will overflow. Add a `TailCall` op + trampoline.
- **`set!` cannot mutate captured locals.** Captures are value-snapshots,
  not shared cells. Lua-style "open upvalues" would lift this.
- **No macros / `define-syntax`.** Defer until the host-binding story is
  clear; a procedural macro layer slots in above the parser.
- **No GC.** `Rc` is fine until programs build cycles via mutable closures;
  revisit when `set!` on captures lands.
- **Internal `define` is disallowed.** Only top-level `define` is
  recognised; use `let` inside functions.
- **No tail position detection for `and`/`or`** — they aren't yet defined
  as special forms; build via `if` for now.

These are explicit deferrals, not unknowns — the architecture leaves room
for each to slot in without restructuring.
