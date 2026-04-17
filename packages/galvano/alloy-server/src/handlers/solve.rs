use std::{sync::Arc, time::Duration};

use axum::{extract::State, Json};
use serde::Deserialize;

use alloy::{SolveRequest, SolveResponse};
use crate::{error::AppError, AppState};

/// JSON body for `POST /solve`.
#[derive(Debug, Deserialize)]
pub struct SolveBody {
    /// Complete MiniZinc model source.
    pub model: String,
    /// Optional DZN data (appended to the model).
    pub data: Option<String>,
    /// Solver ID (e.g. `"org.gecode.gecode"`). Omit → default solver.
    pub solver: Option<String>,
    /// Time limit in milliseconds. Omit → server default.
    pub timeout_ms: Option<u32>,
}

pub async fn solve_inline(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SolveBody>,
) -> Result<Json<SolveResponse>, AppError> {
    // Acquire a concurrency slot (non-blocking — returns Busy immediately).
    let permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::Busy)?;

    let req = SolveRequest {
        model: body.model,
        data: body.data,
        solver: body.solver,
        timeout_ms: body.timeout_ms.unwrap_or(state.config.default_timeout_ms),
        stdlib_dir: state.config.stdlib_dir.clone(),
    };

    // Give a 2-second grace window beyond the solver's own time limit.
    let outer_timeout = Duration::from_millis(req.timeout_ms as u64 + 2_000);

    // Clone the backend Arc so the closure owns it.
    let backend = Arc::clone(&state.backend);

    let result = tokio::time::timeout(
        outer_timeout,
        tokio::task::spawn_blocking(move || {
            let _permit = permit; // dropped when this closure returns
            alloy::solve_with(&req, backend.as_ref())
        }),
    )
    .await
    .map_err(|_| AppError::Timeout)?          // outer timeout elapsed
    .map_err(|_| AppError::Solver(alloy::SolveError::Join))?  // spawn_blocking panicked
    .map_err(AppError::Solver)?;              // solve_with returned Err

    Ok(Json(result))
}
