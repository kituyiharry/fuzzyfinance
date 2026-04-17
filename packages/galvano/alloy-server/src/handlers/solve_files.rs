use std::{sync::Arc, time::Duration};

use axum::{extract::{Multipart, State}, Json};

use alloy::{SolveRequest, SolveResponse};
use crate::{error::AppError, AppState};

/// `POST /solve/files` — multipart/form-data
///
/// Fields:
/// - `model`   (required) — MiniZinc model file content
/// - `data`    (optional) — DZN data file content
/// - `solver`  (optional text) — solver ID
/// - `timeout` (optional text) — time limit in milliseconds
pub async fn solve_files(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<SolveResponse>, AppError> {
    let mut model: Option<String> = None;
    let mut data: Option<String> = None;
    let mut solver: Option<String> = None;
    let mut timeout_ms: Option<u32> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        let text = field
            .text()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        match name.as_str() {
            "model"   => model   = Some(text),
            "data"    => data    = Some(text),
            "solver"  => solver  = Some(text),
            "timeout" => timeout_ms = text.trim().parse().ok(),
            _         => {} // ignore unknown fields
        }
    }

    let model = model
        .ok_or_else(|| AppError::BadRequest("missing 'model' field".into()))?;

    let permit = state
        .semaphore
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::Busy)?;

    let req = SolveRequest {
        model,
        data,
        solver,
        timeout_ms: timeout_ms.unwrap_or(state.config.default_timeout_ms),
        stdlib_dir: state.config.stdlib_dir.clone(),
    };

    let outer_timeout = Duration::from_millis(req.timeout_ms as u64 + 2_000);

    let backend = Arc::clone(&state.backend);

    let result = tokio::time::timeout(
        outer_timeout,
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            alloy::solve_with(&req, backend.as_ref())
        }),
    )
    .await
    .map_err(|_| AppError::Timeout)?
    .map_err(|_| AppError::Solver(alloy::SolveError::Join))?
    .map_err(AppError::Solver)?;

    Ok(Json(result))
}
