use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use orsolver::{inspect, solve, solve_with_info, SolveStatus};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;

#[derive(Deserialize)]
struct SolveRequest {
    model: String,
    /// When true the response includes a `model_info` field with the full
    /// structural description of the parsed FlatZinc model.
    #[serde(default)]
    debug: bool,
}

#[derive(Deserialize)]
struct BatchJob {
    id: String,
    model: String,
    #[serde(default)]
    debug: bool,
}

#[derive(Deserialize)]
struct BatchRequest {
    jobs: Vec<BatchJob>,
}

fn status_str(s: &SolveStatus) -> &'static str {
    match s {
        SolveStatus::Sat     => "sat",
        SolveStatus::Unsat   => "unsat",
        SolveStatus::Unknown => "unknown",
    }
}

/// Run solve (and optionally inspect) for one model, returning a JSON value.
/// Returns `{"error": "..."}` on failure.
fn run_job(model: &str, debug: bool) -> Value {
    let result = if debug {
        solve_with_info(model)
    } else {
        solve(model)
    };

    match result {
        Ok(r) => {
            let mut v = json!({
                "status": status_str(&r.status),
                "output": r.output,
            });
            if let Some(info) = r.model_info {
                v["model_info"] = json!(info);
            }
            v
        }
        Err(e) => json!({ "error": e }),
    }
}

async fn health() -> &'static str {
    "ok"
}

async fn solve_handler(Json(payload): Json<SolveRequest>) -> impl IntoResponse {
    let model = payload.model;
    let debug = payload.debug;

    let value = tokio::task::spawn_blocking(move || run_job(&model, debug))
        .await
        .unwrap_or_else(|e| json!({ "error": e.to_string() }));

    if value.get("error").is_some() {
        (StatusCode::UNPROCESSABLE_ENTITY, Json(value)).into_response()
    } else {
        (StatusCode::OK, Json(value)).into_response()
    }
}

async fn batch_handler(Json(payload): Json<BatchRequest>) -> impl IntoResponse {
    let handles: Vec<_> = payload
        .jobs
        .into_iter()
        .map(|job| {
            tokio::task::spawn_blocking(move || {
                (job.id, run_job(&job.model, job.debug))
            })
        })
        .collect();

    let mut results: HashMap<String, Value> = HashMap::new();
    for handle in handles {
        match handle.await {
            Ok((id, value)) => { results.insert(id, value); }
            Err(e) => {
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

async fn inspect_handler(Json(payload): Json<SolveRequest>) -> impl IntoResponse {
    let model = payload.model;

    let result = tokio::task::spawn_blocking(move || inspect(&model))
        .await
        .unwrap_or_else(|e| Err(e.to_string()));

    match result {
        Ok(info) => (StatusCode::OK, Json(json!(info))).into_response(),
        Err(e)   => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": e })),
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
        .route("/health",        get(health))
        .route("/solve",         post(solve_handler))
        .route("/solve/batch",   post(batch_handler))
        .route("/solve/inspect", post(inspect_handler));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("orsolver-server listening on :{port}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
