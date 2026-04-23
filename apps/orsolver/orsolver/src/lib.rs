use std::ffi::{CStr, CString};

#[cfg(test)]
mod tests;

#[derive(Debug, PartialEq)]
pub enum SolveStatus {
    Sat,
    Unsat,
    Unknown,
}

#[derive(Debug)]
pub struct SolveResult {
    pub status: SolveStatus,
    pub output: String,
}

pub fn solve(fzn_model: &str) -> Result<SolveResult, String> {
    let c_model = CString::new(fzn_model).map_err(|e| e.to_string())?;
    let mut err_ptr: *mut std::os::raw::c_char = std::ptr::null_mut();

    let result_ptr = unsafe {
        orsolver_sys::solve_flatzinc(c_model.as_ptr(), &mut err_ptr)
    };

    if result_ptr.is_null() {
        let msg = if !err_ptr.is_null() {
            let s = unsafe { CStr::from_ptr(err_ptr) }.to_string_lossy().into_owned();
            unsafe { orsolver_sys::free_solve_result(err_ptr) };
            s
        } else {
            "unknown solver error".to_string()
        };
        return Err(msg);
    }

    let raw = unsafe { CStr::from_ptr(result_ptr) }.to_string_lossy().into_owned();
    unsafe { orsolver_sys::free_solve_result(result_ptr) };

    let status = if raw.contains("=====UNSATISFIABLE=====") {
        SolveStatus::Unsat
    } else if raw.contains("=====UNKNOWN=====") {
        SolveStatus::Unknown
    } else if raw.contains("----------") {
        SolveStatus::Sat
    } else {
        SolveStatus::Unknown
    };

    Ok(SolveResult { status, output: raw })
}
