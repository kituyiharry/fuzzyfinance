use serde::Deserialize;
use worker::*;

use hedaz_libs::alluvial::build_alluvial_data;
use hedaz_libs::context::Context as AnalyseContext;
use hedaz_libs::currency::Currency;
use hedaz_libs::models::parse_receipt_csv;

/// Bumped in lock-step with `apps/web/src/lib/server/visualization.js`
/// to invalidate cached visualization artefacts after a logic change.
const ANALYZER_VERSION: &str = "1.0.0";

#[derive(Deserialize)]
struct AnalyseRequest {
    csv_text: String,
    r2_key: String,
    default_currency: Option<String>,
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get_async("/health", |_, _| async move {
            Response::ok("hedaz operational")
        })
        .post_async("/analyse/export", analyse_export)
        .run(req, env)
        .await
}

async fn analyse_export(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: AnalyseRequest = req.json().await?;

    let rows = parse_receipt_csv(&body.csv_text);
    let default_currency: Currency = body
        .default_currency
        .as_deref()
        .map(|s| s.parse().unwrap_or_default())
        .unwrap_or(Currency::AUD);
    let analyse_ctx = AnalyseContext::new(default_currency);

    let alluvial = build_alluvial_data(&rows, &analyse_ctx)
        .map_err(|e| Error::RustError(e.to_string()))?;

    let json = serde_json::to_vec(&alluvial)
        .map_err(|e| Error::RustError(e.to_string()))?;

    ctx.env
        .bucket("EXPORTS")?
        .put(&body.r2_key, json)
        .execute()
        .await?;

    Response::from_json(&serde_json::json!({
        "ok": true,
        "r2_key": body.r2_key,
        "analyzer_version": ANALYZER_VERSION,
        "node_count": alluvial.nodes.len(),
        "link_count": alluvial.links.len(),
    }))
}
