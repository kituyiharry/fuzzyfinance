use std::{env, fs, process};

use galvani_parser::parser::parse;
use galvani_solver::backend::SolveResult;
use galvani_solver::solver::Solver;

mod stub_backend;
use stub_backend::StubBackend;

fn usage() -> ! {
    eprintln!("Usage: galvani [OPTIONS] <file.fzn>");
    eprintln!();
    eprintln!("Options:");
    eprintln!("  --solver <name>   Backend solver to use (default: stub)");
    eprintln!("  --all-solutions   Enumerate all solutions");
    eprintln!("  --help            Print this message");
    process::exit(1);
}

struct Args {
    file: String,
    solver: String,
    all_solutions: bool,
}

fn parse_args() -> Args {
    let raw: Vec<String> = env::args().skip(1).collect();
    let mut file = None;
    let mut solver = "stub".to_string();
    let mut all_solutions = false;
    let mut i = 0;

    while i < raw.len() {
        match raw[i].as_str() {
            "--help" => usage(),
            "--all-solutions" => all_solutions = true,
            "--solver" => {
                i += 1;
                solver = raw.get(i).cloned().unwrap_or_else(|| usage());
            }
            arg if arg.starts_with('-') => {
                eprintln!("Unknown option: {arg}");
                usage();
            }
            path => file = Some(path.to_string()),
        }
        i += 1;
    }

    Args {
        file: file.unwrap_or_else(|| usage()),
        solver,
        all_solutions,
    }
}

fn main() {
    let args = parse_args();

    let src = fs::read_to_string(&args.file).unwrap_or_else(|e| {
        eprintln!("error: cannot read '{}': {e}", args.file);
        process::exit(1);
    });

    let model = parse(&src).unwrap_or_else(|e| {
        eprintln!("parse error: {}", e.0);
        process::exit(1);
    });

    if args.solver != "stub" {
        eprintln!("error: unknown solver '{}'", args.solver);
        process::exit(1);
    }

    let mut solver = Solver::new(StubBackend);

    if args.all_solutions {
        eprintln!("% all-solutions enumeration not yet implemented");
    }

    match solver.solve(&model) {
        SolveResult::Sat => println!("=========="),
        SolveResult::Unsat => println!("=====UNSATISFIABLE====="),
        SolveResult::Unknown => println!("=====UNKNOWN====="),
    }
}
