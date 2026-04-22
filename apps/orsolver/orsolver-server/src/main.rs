use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use orsolver::{solve, SolveStatus};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Deserialize)]
struct SolveRequest {
    model: String,
}

#[derive(Serialize)]
struct SolveResponse {
    status: String,
    output: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

async fn health() -> &'static str {
    "ok"
}

async fn solve_handler(
    Json(payload): Json<SolveRequest>,
) -> impl IntoResponse {
    let model = payload.model.clone();

    let result = tokio::task::spawn_blocking(move || solve(&model)).await;

    match result {
        Ok(Ok(r)) => {
            let status = match r.status {
                SolveStatus::Sat => "sat",
                SolveStatus::Unsat => "unsat",
                SolveStatus::Unknown => "unknown",
            };
            (
                StatusCode::OK,
                Json(serde_json::json!({ "status": status, "output": r.output })),
            )
                .into_response()
        }
        Ok(Err(e)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let app = Router::new()
        .route("/health", get(health))
        .route("/solve", post(solve_handler));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("orsolver-server listening on :{port}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
