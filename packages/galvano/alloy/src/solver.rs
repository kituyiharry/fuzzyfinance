//! Solve functions for both pipeline paths.

use std::{
    ffi::{CStr, CString},
    path::Path,
};

use crate::{
    backend::{FlatZinc, SolverBackend},
    types::{CompileRequest, SolveError, SolveOptions, SolveRequest, SolveResponse, SolveStatus},
};

/* ── Pipeline A — end-to-end via libminizinc ──────────────────────────────── */

/// Compile and solve in one step using libminizinc's built-in solver pipeline.
///
/// This is the **default** path when no custom backend is registered.
/// It calls `mzn_solve` in the C++ shim, which handles both compilation and
/// solving in a single `MznSolver::run()` call.
///
/// **Blocking call** — dispatch via `spawn_blocking` in async code.
pub fn solve(req: &SolveRequest) -> Result<SolveResponse, SolveError> {
    let model_c = CString::new(req.model.as_str()).map_err(|_| SolveError::NulInInput)?;
    let data_c: Option<CString> = req.data.as_deref().map(CString::new).transpose()
        .map_err(|_| SolveError::NulInInput)?;
    let solver_c: Option<CString> = req.solver.as_deref().map(CString::new).transpose()
        .map_err(|_| SolveError::NulInInput)?;
    let stdlib_c = CString::new(req.stdlib_dir.to_string_lossy().as_ref())
        .map_err(|_| SolveError::NulInInput)?;

    let mut result = unsafe {
        alloy_sys::mzn_solve(
            model_c.as_ptr(),
            data_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
            solver_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
            req.timeout_ms as i32,
            stdlib_c.as_ptr(),
        )
    };

    extract_result(&mut result)
}

/* ── Pipeline B — compile then dispatch to backend ────────────────────────── */

/// Compile a MiniZinc model and solve it using the given backend.
///
/// Use this when you have a custom [`SolverBackend`] registered. The
/// compilation step always uses libminizinc; only the FlatZinc → solutions
/// step is delegated to `backend`.
///
/// **Blocking call** — dispatch via `spawn_blocking` in async code.
pub fn solve_with(
    req: &SolveRequest,
    backend: &dyn SolverBackend,
) -> Result<SolveResponse, SolveError> {
    if !backend.is_available() {
        return Err(SolveError::BackendUnavailable(backend.id().to_string().leak()));
    }

    let compile_req = CompileRequest::from_solve(req);
    let fzn = crate::compiler::compile(&compile_req)?;
    let opts = SolveOptions::from_solve(req);
    backend.solve_fzn(&fzn, &opts)
}

/* ── used by LibminizincBackend::solve_fzn ────────────────────────────────── */

/// Solve a pre-compiled FlatZinc model using libminizinc's built-in solver.
/// Called by [`crate::LibminizincBackend`]; not usually called directly.
///
/// **Blocking call.**
pub fn solve_fzn_libmzn(
    fzn: &FlatZinc,
    opts: &SolveOptions,
    stdlib_dir: &Path,
    solver_id: Option<&str>,
) -> Result<SolveResponse, SolveError> {
    let fzn_c = CString::new(fzn.source.as_str()).map_err(|_| SolveError::NulInInput)?;
    let stdlib_c = CString::new(stdlib_dir.to_string_lossy().as_ref())
        .map_err(|_| SolveError::NulInInput)?;

    let effective_solver = opts.solver_id.as_deref().or(solver_id);
    let solver_c: Option<CString> = effective_solver.map(CString::new).transpose()
        .map_err(|_| SolveError::NulInInput)?;

    let mut result = unsafe {
        alloy_sys::mzn_solve_fzn(
            fzn_c.as_ptr(),
            solver_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
            opts.timeout_ms as i32,
            stdlib_c.as_ptr(),
        )
    };

    extract_result(&mut result)
}

/* ── list solvers ─────────────────────────────────────────────────────────── */

/// List solver IDs available to libminizinc. Returns an empty vec on error.
///
/// **Blocking call.**
pub fn list_solvers(stdlib_dir: &Path) -> Vec<String> {
    let stdlib_c = match CString::new(stdlib_dir.to_string_lossy().as_ref()) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let ptr = unsafe { alloy_sys::mzn_list_solvers(stdlib_c.as_ptr()) };
    if ptr.is_null() { return Vec::new(); }

    let mut out = Vec::new();
    let mut i = 0usize;
    loop {
        let item = unsafe { *ptr.add(i) };
        if item.is_null() { break; }
        out.push(unsafe { CStr::from_ptr(item) }.to_string_lossy().into_owned());
        i += 1;
    }

    unsafe { alloy_sys::mzn_free_solvers(ptr) };
    out
}

/* ── shared helper ────────────────────────────────────────────────────────── */

fn extract_result(result: &mut alloy_sys::MznResult) -> Result<SolveResponse, SolveError> {
    let output = if result.output.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(result.output) }.to_string_lossy().into_owned()
    };

    let error_msg = if result.error.is_null() {
        None
    } else {
        Some(unsafe { CStr::from_ptr(result.error) }.to_string_lossy().into_owned())
    };

    let status = SolveStatus::from_int(result.status);
    let time_ms = result.time_ms as u64;

    unsafe { alloy_sys::mzn_free_result(&raw mut *result) };

    if status == SolveStatus::Error {
        return Err(SolveError::Solver(
            error_msg.unwrap_or_else(|| "unknown solver error".into()),
        ));
    }

    Ok(SolveResponse { status, output, error: error_msg, time_ms })
}
