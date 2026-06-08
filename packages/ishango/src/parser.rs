use crate::ast::Expr;
use crate::error::Error;
use crate::lexer::{Token, TokenKind};

pub fn parse(tokens: &[Token]) -> Result<Vec<Expr>, Error> {
    let mut p = Parser { tokens, pos: 0 };
    let mut forms = Vec::new();
    while p.pos < p.tokens.len() {
        forms.push(p.parse_expr()?);
    }
    Ok(forms)
}

struct Parser<'a> {
    tokens: &'a [Token],
    pos:    usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn bump(&mut self) -> Option<&Token> {
        let t = self.tokens.get(self.pos);
        if t.is_some() { self.pos += 1; }
        t
    }

    fn parse_expr(&mut self) -> Result<Expr, Error> {
        let Some(tok) = self.peek() else {
            return Err(Error::parse("unexpected EOF", None));
        };
        let span = tok.span;
        match &tok.kind {
            TokenKind::LParen => {
                self.bump();
                let mut items = Vec::new();
                loop {
                    match self.peek() {
                        Some(t) if t.kind == TokenKind::RParen => {
                            self.bump();
                            return Ok(Expr::List(items, span));
                        }
                        Some(_) => items.push(self.parse_expr()?),
                        None => return Err(Error::parse("unterminated list", Some(span))),
                    }
                }
            }
            TokenKind::RParen => Err(Error::parse("unexpected `)`", Some(span))),
            TokenKind::Quote => {
                self.bump();
                let inner = self.parse_expr()?;
                Ok(Expr::Quote(Box::new(inner), span))
            }
            TokenKind::Int(n)     => { let n = *n;   self.bump(); Ok(Expr::Int(n, span)) }
            TokenKind::Float(x)   => { let x = *x;   self.bump(); Ok(Expr::Float(x, span)) }
            TokenKind::Bool(b)    => { let b = *b;   self.bump(); Ok(Expr::Bool(b, span)) }
            TokenKind::Nil        => { self.bump(); Ok(Expr::Nil(span)) }
            TokenKind::Str(s)     => { let s = s.clone(); self.bump(); Ok(Expr::Str(s, span)) }
            TokenKind::Sym(s)     => { let s = s.clone(); self.bump(); Ok(Expr::Sym(s, span)) }
        }
    }
}
