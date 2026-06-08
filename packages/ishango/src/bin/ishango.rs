use std::process::ExitCode;

use ishango::{compiler, env, lexer, parser, vm};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    match args.as_slice() {
        []                          => repl::run(),
        [flag, src] if flag == "-e" => eval_expr(src),
        [path]                      => run_file(path),
        _ => {
            eprintln!("usage: ishango                # REPL");
            eprintln!("       ishango FILE.lisp     # run file");
            eprintln!("       ishango -e '<expr>'   # eval expression");
            ExitCode::from(64)
        }
    }
}

fn eval_expr(src: &str) -> ExitCode {
    match ishango::run(src) {
        Ok(v)  => { println!("{v}"); ExitCode::SUCCESS }
        Err(e) => { eprintln!("{e}"); ExitCode::FAILURE }
    }
}

fn run_file(path: &str) -> ExitCode {
    let src = match std::fs::read_to_string(path) {
        Ok(s)  => s,
        Err(e) => { eprintln!("ishango: cannot read `{path}`: {e}"); return ExitCode::FAILURE; }
    };
    match ishango::run(&src) {
        Ok(_)  => ExitCode::SUCCESS,
        Err(e) => { eprintln!("{e}"); ExitCode::FAILURE }
    }
}

/// Run one parsed snippet against an existing `Globals`. Shared by both
/// REPL implementations so behaviour stays identical regardless of which
/// front-end the user is talking to.
fn run_once(src: &str, globals: &mut env::Globals) -> Result<ishango::Value, ishango::Error> {
    let tokens = lexer::tokenize(src)?;
    let forms  = parser::parse(&tokens)?;
    let chunk  = compiler::compile(&forms, globals)?;
    let mut v  = vm::Vm::new(globals);
    v.run(chunk)
}

// ─── REPL backends ─────────────────────────────────────────────────────
//
// Two implementations chosen at compile time:
//   • `repl` feature ON  (default) → rustyline-based, history + bracket
//                                     matching + tab completion.
//   • `repl` feature OFF           → plain stdin loop. Used by minimal /
//                                     wasm builds and as a fallback when
//                                     rustyline can't open a TTY.
//
// Both keep one `Globals` across iterations so `define`d names accumulate
// and the interner stays warm.

#[cfg(feature = "repl")]
mod repl {
    use std::process::ExitCode;

    use ishango::builtins;
    use ishango::env::Globals;

    use rustyline::completion::{Completer, Pair};
    use rustyline::error::ReadlineError;
    use rustyline::highlight::{Highlighter, MatchingBracketHighlighter};
    use rustyline::hint::Hinter;
    use rustyline::history::DefaultHistory;
    use rustyline::validate::{MatchingBracketValidator, ValidationContext, ValidationResult, Validator};
    use rustyline::{Cmd, CompletionType, Config, Context, EditMode, Editor, Helper, KeyEvent};

    use super::run_once;

    /// Names always available regardless of what the user has defined —
    /// special forms plus literal constants. Completed alongside globals.
    const RESERVED: &[&str] = &[
        "if", "let", "lambda", "define", "defun", "set!", "begin", "quote", "the",
        "nil", "#t", "#f",
    ];

    /// Holds the live completion vocabulary. Refreshed from `Globals` after
    /// each successful evaluation so user-defined names show up immediately.
    struct IshangoHelper {
        names:        Vec<String>,
        validator:    MatchingBracketValidator,
        highlighter:  MatchingBracketHighlighter,
    }

    impl IshangoHelper {
        fn new() -> Self {
            Self {
                names:       RESERVED.iter().map(|s| (*s).to_string()).collect(),
                validator:   MatchingBracketValidator::new(),
                highlighter: MatchingBracketHighlighter::new(),
            }
        }

        fn refresh(&mut self, globals: &Globals) {
            self.names.clear();
            self.names.extend(RESERVED.iter().map(|s| (*s).to_string()));
            for k in globals.map.keys() {
                self.names.push(k.to_string());
            }
            self.names.sort_unstable();
            self.names.dedup();
        }
    }

    impl Completer for IshangoHelper {
        type Candidate = Pair;

        fn complete(
            &self,
            line: &str,
            pos: usize,
            _ctx: &Context<'_>,
        ) -> rustyline::Result<(usize, Vec<Pair>)> {
            // Walk backwards from the cursor to find the start of the current
            // word. Lisp atoms break on whitespace, parens, quote, semicolon.
            let bytes = line.as_bytes();
            let mut start = pos;
            while start > 0 {
                let c = bytes[start - 1];
                if matches!(c, b' ' | b'\t' | b'\n' | b'(' | b')' | b'\'' | b';' | b'"') {
                    break;
                }
                start -= 1;
            }
            let prefix = &line[start..pos];
            if prefix.is_empty() {
                return Ok((start, Vec::new()));
            }
            let matches: Vec<Pair> = self.names.iter()
                .filter(|n| n.starts_with(prefix))
                .map(|n| Pair { display: n.clone(), replacement: n.clone() })
                .collect();
            Ok((start, matches))
        }
    }

    impl Hinter for IshangoHelper {
        type Hint = String;
    }

    impl Highlighter for IshangoHelper {
        fn highlight<'l>(&self, line: &'l str, pos: usize) -> std::borrow::Cow<'l, str> {
            self.highlighter.highlight(line, pos)
        }
        fn highlight_char(&self, line: &str, pos: usize, forced: bool) -> bool {
            self.highlighter.highlight_char(line, pos, forced)
        }
    }

    impl Validator for IshangoHelper {
        fn validate(&self, ctx: &mut ValidationContext) -> rustyline::Result<ValidationResult> {
            self.validator.validate(ctx)
        }
        fn validate_while_typing(&self) -> bool {
            self.validator.validate_while_typing()
        }
    }

    impl Helper for IshangoHelper {}

    pub fn run() -> ExitCode {
        println!("ishango v{} — rich REPL (Ctrl-D or :quit to exit, TAB to complete)", env!("CARGO_PKG_VERSION"));

        let mut globals = Globals::new();
        builtins::install_prelude(&mut globals);

        let config = Config::builder()
            .completion_type(CompletionType::List)
            .edit_mode(EditMode::Emacs)
            .auto_add_history(true)
            .build();

        let mut editor: Editor<IshangoHelper, DefaultHistory> = match Editor::with_config(config) {
            Ok(e) => e,
            Err(_) => {
                eprintln!("ishango: terminal unavailable, falling back to plain REPL");
                return fallback::run();
            }
        };
        // Re-bind Tab to force completion (some terminals send different codes).
        editor.bind_sequence(KeyEvent::from('\t'), Cmd::Complete);

        let mut helper = IshangoHelper::new();
        helper.refresh(&globals);
        editor.set_helper(Some(helper));

        // History file in the user's home — best effort, missing dir is fine.
        let history_path = std::env::var_os("HOME")
            .map(|h| std::path::PathBuf::from(h).join(".ishango_history"));
        if let Some(p) = &history_path {
            let _ = editor.load_history(p);
        }

        loop {
            match editor.readline("ish> ") {
                Ok(line) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() { continue; }
                    if trimmed == ":quit" || trimmed == ":q" { break; }
                    match run_once(trimmed, &mut globals) {
                        Ok(v)  => println!("{v}"),
                        Err(e) => eprintln!("{e}"),
                    }
                    if let Some(h) = editor.helper_mut() {
                        h.refresh(&globals);
                    }
                }
                Err(ReadlineError::Eof) | Err(ReadlineError::Interrupted) => break,
                Err(e) => { eprintln!("readline error: {e}"); return ExitCode::FAILURE; }
            }
        }

        if let Some(p) = &history_path {
            let _ = editor.save_history(p);
        }
        ExitCode::SUCCESS
    }

    pub mod fallback {
        use std::process::ExitCode;
        use super::super::repl_plain;
        pub fn run() -> ExitCode { repl_plain::run() }
    }
}

#[cfg(not(feature = "repl"))]
mod repl {
    use std::process::ExitCode;
    use super::repl_plain;
    pub fn run() -> ExitCode { repl_plain::run() }
}

/// Plain `stdin().read_line` REPL — no deps, used as the fallback when
/// rustyline isn't available (feature off, or terminal init failed).
mod repl_plain {
    use std::io::{self, BufRead, Write};
    use std::process::ExitCode;

    use ishango::{builtins, env};
    use super::run_once;

    pub fn run() -> ExitCode {
        println!("ishango v{} — plain REPL (:quit or Ctrl-D to exit)", env!("CARGO_PKG_VERSION"));
        let mut globals = env::Globals::new();
        builtins::install_prelude(&mut globals);

        let stdin = io::stdin();
        let mut stdout = io::stdout();
        let mut handle = stdin.lock();
        let mut line = String::new();

        loop {
            print!("> ");
            let _ = stdout.flush();
            line.clear();
            match handle.read_line(&mut line) {
                Ok(0) => { println!(); return ExitCode::SUCCESS; }
                Ok(_) => {}
                Err(e) => { eprintln!("read error: {e}"); return ExitCode::FAILURE; }
            }
            let trimmed = line.trim();
            if trimmed.is_empty() { continue; }
            if trimmed == ":quit" || trimmed == ":q" { return ExitCode::SUCCESS; }

            match run_once(trimmed, &mut globals) {
                Ok(v)  => println!("{v}"),
                Err(e) => eprintln!("{e}"),
            }
        }
    }
}
