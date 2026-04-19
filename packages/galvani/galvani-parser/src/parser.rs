use crate::ast::Model;

pub struct ParseError(pub String);

pub fn parse(_input: &str) -> Result<Model, ParseError> {
    Err(ParseError("not yet implemented".into()))
}
