use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Serialize)]
pub struct SolversResponse {
    solvers: Vec<String>,
}

pub async fn list_solvers(State(state): State<Arc<AppState>>) -> Json<SolversResponse> {
    let stdlib_dir = state.config.stdlib_dir.clone();
    // list_solvers is fast but still blocking (file I/O + config parsing).
    let solvers = tokio::task::spawn_blocking(move || alloy::list_solvers(&stdlib_dir))
        .await
        .unwrap_or_default();

    Json(SolversResponse { solvers })
}
