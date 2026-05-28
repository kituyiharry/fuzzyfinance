use worker::*;

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    Router::new()
        .get_async("/health", |_, _| async move {
            Response::ok("hedaz operational")
        })
        // Future: POST /analyse/export   — analyse a CSV export from EXPORTS bucket
        // Future: POST /analyse/receipts — aggregate over raw files in RECEIPTS bucket
        .run(req, env)
        .await
}
