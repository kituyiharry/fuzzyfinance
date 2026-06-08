use crate::ast::Span;
use crate::error::Error;

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    LParen,
    RParen,
    Quote,
    Int(i64),
    Float(f64),
    Str(String),
    Sym(String),
    Bool(bool),
    Nil,
}

#[derive(Debug, Clone)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

pub fn tokenize(src: &str) -> Result<Vec<Token>, Error> {
    let mut out  = Vec::new();
    let mut line = 1u32;
    let mut col  = 1u32;
    let bytes    = src.as_bytes();
    let mut i    = 0;

    while i < bytes.len() {
        let b = bytes[i];
        let start = Span::new(line, col);

        // Whitespace
        if b == b' ' || b == b'\t' || b == b'\r' {
            i += 1; col += 1; continue;
        }
        if b == b'\n' {
            i += 1; line += 1; col = 1; continue;
        }

        // Line comment ; ...
        if b == b';' {
            while i < bytes.len() && bytes[i] != b'\n' { i += 1; }
            continue;
        }

        // Parens
        if b == b'(' { out.push(Token { kind: TokenKind::LParen, span: start }); i += 1; col += 1; continue; }
        if b == b')' { out.push(Token { kind: TokenKind::RParen, span: start }); i += 1; col += 1; continue; }
        if b == b'\'' { out.push(Token { kind: TokenKind::Quote,  span: start }); i += 1; col += 1; continue; }

        // String literal "..."
        if b == b'"' {
            i += 1; col += 1;
            let mut buf = String::new();
            while i < bytes.len() && bytes[i] != b'"' {
                let c = bytes[i];
                if c == b'\\' {
                    i += 1; col += 1;
                    if i >= bytes.len() {
                        return Err(Error::lex("unterminated string escape", start));
                    }
                    match bytes[i] {
                        b'n'  => buf.push('\n'),
                        b't'  => buf.push('\t'),
                        b'r'  => buf.push('\r'),
                        b'\\' => buf.push('\\'),
                        b'"'  => buf.push('"'),
                        other => return Err(Error::lex(format!("unknown escape \\{}", other as char), start)),
                    }
                    i += 1; col += 1;
                } else if c == b'\n' {
                    buf.push('\n');
                    i += 1; line += 1; col = 1;
                } else {
                    buf.push(c as char);
                    i += 1; col += 1;
                }
            }
            if i >= bytes.len() {
                return Err(Error::lex("unterminated string", start));
            }
            i += 1; col += 1; // closing "
            out.push(Token { kind: TokenKind::Str(buf), span: start });
            continue;
        }

        // Atom: read until whitespace/paren/quote/eof
        let atom_start = i;
        while i < bytes.len() {
            let c = bytes[i];
            if c == b' ' || c == b'\t' || c == b'\n' || c == b'\r'
                || c == b'(' || c == b')' || c == b'\'' || c == b';'
            {
                break;
            }
            i += 1; col += 1;
        }
        let atom = &src[atom_start..i];

        let kind = classify_atom(atom);
        out.push(Token { kind, span: start });
    }

    Ok(out)
}

fn classify_atom(s: &str) -> TokenKind {
    match s {
        "nil"   => return TokenKind::Nil,
        "#t"    => return TokenKind::Bool(true),
        "#f"    => return TokenKind::Bool(false),
        _ => {}
    }
    if let Ok(n) = s.parse::<i64>() {
        return TokenKind::Int(n);
    }
    if let Ok(x) = s.parse::<f64>() {
        // s.parse::<f64>() accepts plain integers too, so only take this
        // branch when the literal *looks* float-ish (decimal point or exponent).
        if s.contains('.') || s.contains('e') || s.contains('E') {
            return TokenKind::Float(x);
        }
    }
    TokenKind::Sym(s.to_string())
}
