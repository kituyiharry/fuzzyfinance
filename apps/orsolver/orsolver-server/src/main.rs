use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use orsolver::{solve, SolveStatus};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;

#[derive(Deserialize)]
struct SolveRequest {
    model: String,
}

#[derive(Deserialize)]
struct BatchJob {
    id: String,
    model: String,
}

#[derive(Deserialize)]
struct BatchRequest {
    jobs: Vec<BatchJob>,
}

fn solve_result_json(model: &str) -> Value {
    match solve(model) {
        Ok(r) => {
            let status = match r.status {
                SolveStatus::Sat => "sat",
                SolveStatus::Unsat => "unsat",
                SolveStatus::Unknown => "unknown",
            };
            json!({ "status": status, "output": r.output })
        }
        Err(e) => json!({ "error": e }),
    }
}

async fn health() -> &'static str {
    "ok"
}

async fn solve_handler(Json(payload): Json<SolveRequest>) -> impl IntoResponse {
    let model = payload.model;
    let result = tokio::task::spawn_blocking(move || solve_result_json(&model)).await;

    match result {
        Ok(v) if v.get("error").is_some() => {
            (StatusCode::UNPROCESSABLE_ENTITY, Json(v)).into_response()
        }
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn batch_handler(Json(payload): Json<BatchRequest>) -> impl IntoResponse {
    let handles: Vec<_> = payload
        .jobs
        .into_iter()
        .map(|job| {
            let id = job.id;
            let model = job.model;
            let handle =
                tokio::task::spawn_blocking(move || (id, solve_result_json(&model)));
            handle
        })
        .collect();

    let mut results: HashMap<String, Value> = HashMap::new();
    for handle in handles {
        match handle.await {
            Ok((id, value)) => { results.insert(id, value); }
            Err(e) => {
                // spawn_blocking panicked — surface as a top-level error
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    }

    (StatusCode::OK, Json(json!({ "results": results }))).into_response()
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let app = Router::new()
        .route("/health", get(health))
        .route("/solve", post(solve_handler))
        .route("/solve/batch", post(batch_handler));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("orsolver-server listening on :{port}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
