//! MiniZinc → FlatZinc compilation step (Pipeline B).
//!
//! This is always handled by libminizinc regardless of which [`crate::SolverBackend`]
//! is in use. The resulting [`crate::FlatZinc`] is then handed to the backend.

use std::{ffi::CString, path::Path};

use crate::{
    backend::FlatZinc,
    types::{CompileRequest, SolveError},
};

/// Compile a MiniZinc model to FlatZinc.
///
/// This is a **blocking** call — dispatch via `spawn_blocking` in async code.
///
/// # Errors
/// - [`SolveError::NulInInput`] if any string contains a null byte.
/// - [`SolveError::Compile`] if libminizinc reports a type or syntax error.
pub fn compile(req: &CompileRequest) -> Result<FlatZinc, SolveError> {
    let model_c = CString::new(req.model.as_str()).map_err(|_| SolveError::NulInInput)?;

    let data_c: Option<CString> = req
        .data
        .as_deref()
        .map(CString::new)
        .transpose()
        .map_err(|_| SolveError::NulInInput)?;

    let stdlib_c =
        CString::new(stdlib_str(&req.stdlib_dir)).map_err(|_| SolveError::NulInInput)?;

    let mut result = unsafe {
        alloy_sys::mzn_compile(
            model_c.as_ptr(),
            data_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
            stdlib_c.as_ptr(),
        )
    };

    let fzn = if result.fzn.is_null() {
        let err = if result.error.is_null() {
            "compilation failed (no output)".to_string()
        } else {
            // SAFETY: non-null, strdup-allocated.
            let s = unsafe { std::ffi::CStr::from_ptr(result.error) }
                .to_string_lossy()
                .into_owned();
            s
        };
        unsafe { alloy_sys::mzn_free_compile_result(&raw mut result) };
        return Err(SolveError::Compile(err));
    } else {
        // SAFETY: non-null, strdup-allocated.
        let s = unsafe { std::ffi::CStr::from_ptr(result.fzn) }
            .to_string_lossy()
            .into_owned();
        unsafe { alloy_sys::mzn_free_compile_result(&raw mut result) };
        s
    };

    Ok(FlatZinc { source: fzn })
}

fn stdlib_str(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}
