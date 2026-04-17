use std::{sync::Arc, time::Duration};

use axum::{
    Router, http::StatusCode, routing::{get, post}
};
use tower_http::{timeout::TimeoutLayer, trace::TraceLayer};

use crate::{
    handlers::{health, solve, solve_files, solvers},
    AppState,
};

pub fn build(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health",      get(health::health))
        .route("/solvers",     get(solvers::list_solvers))
        .route("/solve",       post(solve::solve_inline))
        .route("/solve/files", post(solve_files::solve_files))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        // Hard ceiling: requests that take longer than 5 minutes get a 408.
        .layer(TimeoutLayer::with_status_code(StatusCode::TOO_MANY_REQUESTS, Duration::from_secs(300)))
}
