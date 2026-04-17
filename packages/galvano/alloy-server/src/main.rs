mod config;
mod error;
mod handlers;
mod router;

use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use alloy::SolverBackend;
use config::{BackendKind, Config};

pub struct AppState {
    pub config: Config,
    /// Active solver backend. Handlers call `alloy::solve_with(&req, state.backend.as_ref())`.
    pub backend: Arc<dyn SolverBackend>,
    /// Limits concurrent blocking solver calls so we don't starve the runtime.
    pub semaphore: Arc<Semaphore>,
}

#[tokio::main]
async fn main() {
    let config = Config::from_env();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let backend: Arc<dyn SolverBackend> = match &config.backend {
        BackendKind::Libminizinc { solver_id } => Arc::new(alloy::LibminizincBackend {
            stdlib_dir: config.stdlib_dir.clone(),
            solver_id: solver_id.clone(),
        }),
        BackendKind::Stub => Arc::new(alloy::StubBackend { name: "stub" }),
    };

    tracing::info!("backend = {}", backend.id());

    let state = Arc::new(AppState {
        semaphore: Arc::new(Semaphore::new(config.worker_limit)),
        backend,
        config,
    });

    let addr = format!("0.0.0.0:{}", state.config.port);
    tracing::info!("alloy-server listening on {addr}");
    tracing::info!("stdlib_dir = {}", state.config.stdlib_dir.display());

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, router::build(state))
        .await
        .expect("server error");
}
