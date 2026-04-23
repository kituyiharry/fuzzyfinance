use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Aggregate counts derived from the parsed FlatZinc model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelStats {
    pub total_variables: usize,
    pub temporary_variables: usize,
    pub active_variables: usize,
    pub total_constraints: usize,
    pub active_constraints: usize,
    pub strong_propagation_constraints: usize,
    /// Count of each constraint type (e.g. `"int_eq": 3`).
    pub constraint_types: HashMap<String, usize>,
}

/// The domain of a FlatZinc variable as reported by OR-Tools after parsing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainInfo {
    /// `"interval"` | `"list"` | `"bool"` | `"float"` | `"all_int"`
    pub kind: String,
    // interval / float interval
    pub min: Option<serde_json::Value>,
    pub max: Option<serde_json::Value>,
    // single value
    pub value: Option<serde_json::Value>,
    // explicit integer list (present when kind = "list" and size ≤ 64)
    pub values: Option<Vec<i64>>,
    pub size: Option<usize>,
    pub is_set: Option<bool>,
}

/// A variable from the FlatZinc model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableInfo {
    pub name: String,
    pub domain: DomainInfo,
    /// Introduced by the flattener (not in the original MiniZinc model).
    pub temporary: bool,
    /// Still referenced after presolve — inactive variables are dropped.
    pub active: bool,
    /// Final solution value. Populated only when the model was solved with
    /// `solve_with_info()`; absent for UNSAT/UNKNOWN or non-debug solves.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

/// A single argument to a FlatZinc constraint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArgumentInfo {
    /// `"int"` | `"interval"` | `"int_list"` | `"domain_list"` |
    /// `"float"` | `"float_interval"` | `"float_list"` |
    /// `"var"` | `"var_array"` | `"void"`
    pub kind: String,
    // int / float scalar
    pub value: Option<serde_json::Value>,
    // interval
    pub min: Option<serde_json::Value>,
    pub max: Option<serde_json::Value>,
    // var ref
    pub name: Option<String>,
    pub domain: Option<DomainInfo>,
    // lists / arrays
    pub values: Option<Vec<i64>>,
    pub size: Option<usize>,
    pub count: Option<usize>,
}

/// A constraint from the FlatZinc model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintInfo {
    /// FlatZinc constraint name, e.g. `"int_lin_le"`.
    #[serde(rename = "type")]
    pub kind: String,
    pub active: bool,
    pub strong_propagation: bool,
    pub symmetric_breaking: bool,
    pub redundant: bool,
    pub args: Vec<ArgumentInfo>,
}

/// A float objective term `coeff * var`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FloatTerm {
    pub coeff: f64,
    pub var: Option<String>,
}

/// The solve goal from the FlatZinc model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectiveInfo {
    /// `"satisfy"` | `"minimize"` | `"maximize"`
    pub kind: String,
    /// Set when the objective is over an integer variable.
    pub variable: Option<String>,
    pub domain: Option<DomainInfo>,
    /// Set when the objective is a float linear expression.
    pub float_terms: Option<Vec<FloatTerm>>,
    pub offset: Option<f64>,
}

/// Array index bounds from a `SolutionOutputSpecs` entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundsInfo {
    pub min: i64,
    pub max: i64,
}

/// A parsed annotation node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationInfo {
    /// `"id"` | `"call"` | `"int"` | `"interval"` | `"int_list"` |
    /// `"var"` | `"var_array"` | `"string"` | `"list"` | `"unknown"`
    pub kind: String,
    pub id: Option<String>,
    pub args: Option<Vec<AnnotationInfo>>,
    pub value: Option<serde_json::Value>,
    pub name: Option<String>,
    pub min: Option<i64>,
    pub max: Option<i64>,
    pub count: Option<usize>,
    pub items: Option<Vec<AnnotationInfo>>,
}

/// An output specification (`output_var` / `output_array`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputInfo {
    pub name: String,
    pub is_array: bool,
    /// Dimension bounds for array outputs.
    pub bounds: Option<Vec<BoundsInfo>>,
    pub variable_count: Option<usize>,
    /// Scalar variable name.
    pub variable: Option<String>,
    pub display_as_boolean: bool,
}

/// Complete structural description of a parsed FlatZinc model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub stats: ModelStats,
    pub variables: Vec<VariableInfo>,
    pub constraints: Vec<ConstraintInfo>,
    pub objective: ObjectiveInfo,
    pub outputs: Vec<OutputInfo>,
    pub search_annotations: Vec<AnnotationInfo>,
}
