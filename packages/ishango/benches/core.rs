//! Hand-rolled timing benchmarks. No external bench framework — `cargo bench`
//! still compiles this in release mode, which is all we need for relative
//! "where does the time go" measurements.
//!
//! Each scenario reports min / median / mean over N iterations and the total
//! elapsed time. Iteration counts are tuned so every scenario finishes inside
//! a few seconds on a modern laptop.
//!
//! Add a scenario by appending to the `pipeline_benches` array. To measure a
//! single stage (lex / parse / compile / run) call `bench_stages(...)`.

use std::hint::black_box;
use std::time::{Duration, Instant};

use ishango::builtins::install_prelude;
use ishango::env::Globals;
use ishango::{compiler, lexer, parser, vm};

const FACT_10: &str = "
    (define fact (lambda (n) (if (= n 0) 1 (* n (fact (- n 1))))))
    (fact 10)
";

const FACT_15: &str = "
    (define fact (lambda (n) (if (= n 0) 1 (* n (fact (- n 1))))))
    (fact 15)
";

const FIB_20: &str = "
    (define fib (lambda (n)
        (if (< n 2) n
            (+ (fib (- n 1)) (fib (- n 2))))))
    (fib 20)
";

const CLOSURE_HEAVY: &str = "
    (define mk-adder (lambda (n) (lambda (x) (+ x n))))
    (define add5  (mk-adder 5))
    (define add10 (mk-adder 10))
    (define add20 (mk-adder 20))
    (+ (add5 1) (add10 2) (add20 3))
";

const LET_NEST: &str = "
    (let ((a 1) (b 2) (c 3))
      (let ((d (+ a b)) (e (* b c)))
        (let ((f (- e d)))
          (+ a b c d e f))))
";

fn main() {
    println!("ishango benches — release: {}", if cfg!(debug_assertions) { "no (debug build!)" } else { "yes" });
    println!();
    section("end-to-end (fresh Globals per iteration)");
    bench_pipeline("smallest expr",      "(+ 1 2)",      200_000);
    bench_pipeline("(let)-nested",       LET_NEST,        50_000);
    bench_pipeline("fact(10)",           FACT_10,         20_000);
    bench_pipeline("fact(15)",           FACT_15,         10_000);
    bench_pipeline("fib(20)",            FIB_20,           1_000);
    bench_pipeline("closure-heavy",      CLOSURE_HEAVY,   50_000);

    println!();
    section("REPL-style (shared Globals across iterations)");
    bench_pipeline_warm("fact(10) warm", FACT_10,         20_000);

    println!();
    section("pipeline stages — fact(10)");
    bench_stages(FACT_10, 20_000);
}

fn section(title: &str) {
    println!("── {title} {}", "─".repeat(60usize.saturating_sub(title.len() + 4)));
}

/// Run the full pipeline (lex → parse → compile → vm.run) with a freshly
/// constructed `Globals` each iteration. Captures the cost a caller pays for
/// a *cold* evaluation.
fn bench_pipeline(name: &str, src: &str, iters: usize) {
    let mut samples = Vec::with_capacity(iters);
    // Warm-up — page caches, branch predictor, etc. Not counted.
    for _ in 0..(iters / 20).max(1) {
        let mut g = Globals::new();
        install_prelude(&mut g);
        let _ = ishango::run_with(src, &mut g).unwrap();
    }
    let total_start = Instant::now();
    for _ in 0..iters {
        let mut g = Globals::new();
        install_prelude(&mut g);
        let t = Instant::now();
        let v = ishango::run_with(black_box(src), &mut g).unwrap();
        samples.push(t.elapsed());
        black_box(v);
    }
    report(name, &mut samples, total_start.elapsed());
}

/// Same scenario but with a single `Globals` reused across iterations —
/// shows the benefit of interning + global persistence in a REPL setting.
fn bench_pipeline_warm(name: &str, src: &str, iters: usize) {
    let mut g = Globals::new();
    install_prelude(&mut g);
    // Warm the globals once so the `define` cost lands on the first iteration.
    let _ = ishango::run_with(src, &mut g).unwrap();

    let mut samples = Vec::with_capacity(iters);
    let total_start = Instant::now();
    for _ in 0..iters {
        let t = Instant::now();
        let v = ishango::run_with(black_box(src), &mut g).unwrap();
        samples.push(t.elapsed());
        black_box(v);
    }
    report(name, &mut samples, total_start.elapsed());
}

/// Per-stage breakdown so callers can see whether the front-end or the VM
/// dominates a given program. Each stage's time is measured in isolation; the
/// inputs are the artefacts of the prior stage, materialised outside the timer.
fn bench_stages(src: &str, iters: usize) {
    // Lex
    {
        let mut samples = Vec::with_capacity(iters);
        for _ in 0..(iters / 20).max(1) { let _ = lexer::tokenize(src).unwrap(); }
        let total = Instant::now();
        for _ in 0..iters {
            let t = Instant::now();
            let toks = lexer::tokenize(black_box(src)).unwrap();
            samples.push(t.elapsed());
            black_box(toks);
        }
        report("lex", &mut samples, total.elapsed());
    }
    // Parse
    {
        let tokens = lexer::tokenize(src).unwrap();
        let mut samples = Vec::with_capacity(iters);
        for _ in 0..(iters / 20).max(1) { let _ = parser::parse(&tokens).unwrap(); }
        let total = Instant::now();
        for _ in 0..iters {
            let t = Instant::now();
            let forms = parser::parse(black_box(&tokens)).unwrap();
            samples.push(t.elapsed());
            black_box(forms);
        }
        report("parse", &mut samples, total.elapsed());
    }
    // Compile (fresh Globals so each iteration starts from a cold interner)
    {
        let tokens = lexer::tokenize(src).unwrap();
        let forms  = parser::parse(&tokens).unwrap();
        let mut samples = Vec::with_capacity(iters);
        for _ in 0..(iters / 20).max(1) {
            let mut g = Globals::new();
            install_prelude(&mut g);
            let _ = compiler::compile(&forms, &mut g).unwrap();
        }
        let total = Instant::now();
        for _ in 0..iters {
            let mut g = Globals::new();
            install_prelude(&mut g);
            let t = Instant::now();
            let chunk = compiler::compile(black_box(&forms), &mut g).unwrap();
            samples.push(t.elapsed());
            black_box(chunk);
        }
        report("compile (cold)", &mut samples, total.elapsed());
    }
    // VM only — pre-build the chunk + globals, time only `vm.run`.
    {
        let tokens = lexer::tokenize(src).unwrap();
        let forms  = parser::parse(&tokens).unwrap();
        let mut samples = Vec::with_capacity(iters);
        for _ in 0..(iters / 20).max(1) {
            let mut g = Globals::new();
            install_prelude(&mut g);
            let chunk = compiler::compile(&forms, &mut g).unwrap();
            let mut v = vm::Vm::new(&mut g);
            let _ = v.run(chunk).unwrap();
        }
        let total = Instant::now();
        for _ in 0..iters {
            // Re-build per iter so each run sees a fresh chunk + globals; the
            // chunk build itself is outside the timer.
            let mut g = Globals::new();
            install_prelude(&mut g);
            let chunk = compiler::compile(&forms, &mut g).unwrap();

            let mut v = vm::Vm::new(&mut g);
            let t = Instant::now();
            let val = v.run(black_box(chunk)).unwrap();
            samples.push(t.elapsed());
            black_box(val);
        }
        report("vm only", &mut samples, total.elapsed());
    }
}

fn report(name: &str, samples: &mut [Duration], total: Duration) {
    samples.sort_unstable();
    let n = samples.len();
    let min    = samples[0];
    let median = samples[n / 2];
    let p99    = samples[(n * 99 / 100).min(n - 1)];
    let max    = *samples.last().unwrap();
    let sum: Duration = samples.iter().sum();
    let mean = sum / n as u32;

    println!(
        "  {:<24}  n={:>7}   min={:>9}  median={:>9}  mean={:>9}  p99={:>9}  max={:>9}  total={:>8}",
        name, n,
        fmt(min), fmt(median), fmt(mean), fmt(p99), fmt(max), fmt(total),
    );
}

fn fmt(d: Duration) -> String {
    let ns = d.as_nanos();
    if ns < 1_000 {
        format!("{ns}ns")
    } else if ns < 1_000_000 {
        format!("{:.2}µs", ns as f64 / 1_000.0)
    } else if ns < 1_000_000_000 {
        format!("{:.2}ms", ns as f64 / 1_000_000.0)
    } else {
        format!("{:.2}s", ns as f64 / 1_000_000_000.0)
    }
}
