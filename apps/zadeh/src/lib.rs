use serde::Deserialize;
use worker::*;

use hedaz_libs::alluvial::build_alluvial_data;
use hedaz_libs::context::Context as AnalyseContext;
use hedaz_libs::currency::Currency;
use hedaz_libs::models::parse_receipt_csv;
use hedaz_libs::trendline::build_trendline;

/// Bumped in lock-step with `apps/web/src/lib/server/visualization.js`
/// to invalidate cached visualization artefacts after a logic change.
/// v2: bundle format now includes both `alluvial` and `trendline`.
const ANALYZER_VERSION: &str = "2.0.0";

#[derive(Deserialize)]
struct AnalyseRequest {
    csv_text: String,
    r2_key: String,
    default_currency: Option<String>,
}

#[derive(Deserialize)]
struct InlineAnalyseRequest {
    csv_text: String,
    default_currency: Option<String>,
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get_async("/health", |_, _| async move {
            Response::ok("hedaz operational")
        })
        .post_async("/analyse/export", analyse_export)
        .post_async("/analyse/export-inline", analyse_export_inline)
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
    let trendline = build_trendline(&rows, &analyse_ctx)
        .map_err(|e| Error::RustError(e.to_string()))?;

    let bundle = serde_json::json!({
        "alluvial": alluvial,
        "trendline": trendline,
    });
    let json = serde_json::to_vec(&bundle)
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
        "trend_bucket_count": trendline.buckets.len(),
        "trend_primary_series": trendline.primary_series.len(),
        "trend_secondary_series": trendline.secondary_series.len(),
    }))
}

/// Same as `analyse_export` but returns the bundle JSON directly in the
/// response body instead of writing it to R2. Used by the Live flow.
async fn analyse_export_inline(mut req: Request, _ctx: RouteContext<()>) -> Result<Response> {
    let body: InlineAnalyseRequest = req.json().await?;

    let rows = parse_receipt_csv(&body.csv_text);
    let default_currency: Currency = body
        .default_currency
        .as_deref()
        .map(|s| s.parse().unwrap_or_default())
        .unwrap_or(Currency::AUD);
    let analyse_ctx = AnalyseContext::new(default_currency);

    let alluvial = build_alluvial_data(&rows, &analyse_ctx)
        .map_err(|e| Error::RustError(e.to_string()))?;
    let trendline = build_trendline(&rows, &analyse_ctx)
        .map_err(|e| Error::RustError(e.to_string()))?;

    Response::from_json(&serde_json::json!({
        "alluvial": alluvial,
        "trendline": trendline,
    }))
}
