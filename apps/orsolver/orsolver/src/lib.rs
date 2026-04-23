use std::collections::HashMap;
use std::ffi::{CStr, CString};

pub mod model_info;
pub use model_info::ModelInfo;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, PartialEq)]
pub enum SolveStatus {
    Sat,
    Unsat,
    Unknown,
}

#[derive(Debug)]
pub struct SolveResult {
    pub status: SolveStatus,
    pub output: String,
    pub model_info: Option<ModelInfo>,
}

// ── FFI helper ────────────────────────────────────────────────────────────────

fn call_ffi<F>(fzn_model: &str, f: F) -> Result<String, String>
where
    F: FnOnce(*const std::os::raw::c_char, *mut *mut std::os::raw::c_char)
        -> *mut std::os::raw::c_char,
{
    let c_model = CString::new(fzn_model).map_err(|e| e.to_string())?;
    let mut err_ptr: *mut std::os::raw::c_char = std::ptr::null_mut();

    let result_ptr = unsafe { f(c_model.as_ptr(), &mut err_ptr) };

    if result_ptr.is_null() {
        let msg = if !err_ptr.is_null() {
            let s = unsafe { CStr::from_ptr(err_ptr) }.to_string_lossy().into_owned();
            unsafe { orsolver_sys::free_solve_result(err_ptr) };
            s
        } else {
            "unknown error".to_string()
        };
        return Err(msg);
    }

    let raw = unsafe { CStr::from_ptr(result_ptr) }.to_string_lossy().into_owned();
    unsafe { orsolver_sys::free_solve_result(result_ptr) };
    Ok(raw)
}

// ── solution output parser ────────────────────────────────────────────────────

// Parse `name = value;` assignment lines from OR-Tools FlatZinc output.
//
// Each non-separator, non-empty line before the first `----------` is an
// assignment. Values are parsed to their natural JSON type: integer, float,
// boolean, or string (for arrays like `array1d(1..3, [1,2,3])`).
//
// OR-Tools may emit multiple solution blocks for optimisation problems; only
// the *last* assignment for each variable is kept (the optimal solution).
fn parse_solution(output: &str) -> HashMap<String, serde_json::Value> {
    let mut map: HashMap<String, serde_json::Value> = HashMap::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('-') || line.starts_with('=') {
            continue;
        }
        // Format: `name = value;`  (semicolon is optional in some outputs)
        let Some((name, rest)) = line.split_once(" = ") else { continue };
        let name = name.trim().to_string();
        let raw_val = rest.trim().trim_end_matches(';').trim();

        let value = if raw_val == "true" {
            serde_json::Value::Bool(true)
        } else if raw_val == "false" {
            serde_json::Value::Bool(false)
        } else if let Ok(i) = raw_val.parse::<i64>() {
            serde_json::json!(i)
        } else if let Ok(f) = raw_val.parse::<f64>() {
            serde_json::json!(f)
        } else {
            // Arrays: `array1d(1..3, [1, 2, 3])` — kept as a string
            serde_json::Value::String(raw_val.to_string())
        };

        map.insert(name, value);
    }

    map
}

fn classify_status(output: &str) -> SolveStatus {
    if output.contains("=====UNSATISFIABLE=====") {
        SolveStatus::Unsat
    } else if output.contains("=====UNKNOWN=====") {
        SolveStatus::Unknown
    } else if output.contains("----------") {
        SolveStatus::Sat
    } else {
        SolveStatus::Unknown
    }
}

// ── public API ────────────────────────────────────────────────────────────────

/// Solve a FlatZinc model. Only declared `output_var` variables appear in the
/// output. No model metadata is attached to the result.
pub fn solve(fzn_model: &str) -> Result<SolveResult, String> {
    let raw = call_ffi(fzn_model, |m, e| unsafe {
        orsolver_sys::solve_flatzinc(m, e)
    })?;
    Ok(SolveResult {
        status: classify_status(&raw),
        output: raw,
        model_info: None,
    })
}

/// Parse a FlatZinc model and return its structural description. Does not solve.
pub fn inspect(fzn_model: &str) -> Result<ModelInfo, String> {
    let raw = call_ffi(fzn_model, |m, e| unsafe {
        orsolver_sys::inspect_flatzinc(m, e)
    })?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("failed to deserialise model info: {e}"))
}

/// Solve with full debug information.
///
/// Uses `solve_flatzinc_full` which injects every non-temporary active
/// variable into the output specs before solving, so the output string
/// contains assignments for *all* model variables (not just `output_var`
/// annotated ones). The solution values are then parsed and attached to the
/// corresponding `VariableInfo.value` field in `model_info`.
pub fn solve_with_info(fzn_model: &str) -> Result<SolveResult, String> {
    // Full solve — captures values for all non-temporary active variables.
    let raw = call_ffi(fzn_model, |m, e| unsafe {
        orsolver_sys::solve_flatzinc_full(m, e)
    })?;

    let status = classify_status(&raw);

    // Build model info; annotate each variable with its solution value.
    let mut info = inspect(fzn_model)?;
    if status == SolveStatus::Sat {
        let solution = parse_solution(&raw);
        for var in &mut info.variables {
            if let Some(val) = solution.get(&var.name) {
                var.value = Some(val.clone());
            }
        }
    }

    Ok(SolveResult { status, output: raw, model_info: Some(info) })
}
