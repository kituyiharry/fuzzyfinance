/// Minimal AST types for a FlatZinc model.
pub struct Model {
    pub items: Vec<Item>,
}

pub enum Item {
    VarDecl(VarDecl),
    Constraint(Constraint),
    SolveGoal(SolveGoal),
}

pub struct VarDecl {
    pub name: String,
    pub ty: VarType,
}

pub enum VarType {
    Bool,
    Int,
    Float,
}

pub struct Constraint {
    pub id: String,
    pub args: Vec<Expr>,
}

pub enum Expr {
    Bool(bool),
    Int(i64),
    Float(f64),
    Ident(String),
}

pub enum SolveGoal {
    Satisfy,
    Minimize(Expr),
    Maximize(Expr),
}
