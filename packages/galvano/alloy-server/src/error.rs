use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

use alloy::SolveError;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("solver error: {0}")]
    Solver(#[from] SolveError),

    #[error("request timeout — solver did not finish in time")]
    Timeout,

    #[error("server busy — too many concurrent solve requests")]
    Busy,

    #[error("bad request: {0}")]
    BadRequest(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Timeout     => StatusCode::REQUEST_TIMEOUT,
            AppError::Busy        => StatusCode::TOO_MANY_REQUESTS,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Solver(_)   => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
