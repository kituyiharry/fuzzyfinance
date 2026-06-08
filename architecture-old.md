# FuzzyFinance Architecture

## Overview

FuzzyFinance is a monorepo containing two client applications — a SvelteKit web app deployed on Cloudflare Workers, and a Flutter mobile app — backed by a shared database package. The system allows users to capture receipts and sales documents, extract structured data from them via AI, and sync the originals and their metadata to connected cloud storage (Google Drive, OneDrive) and spreadsheets (Google Sheets, Excel).

---

## Infrastructure

| Layer | Technology |
|---|---|
| Web hosting | Cloudflare Workers (edge runtime) |
| Database | Cloudflare D1 (SQLite, accessed via Drizzle ORM) |
| File storage | Cloudflare R2 (object storage) |
| Vector index | Cloudflare Vectorize |
| AI extraction | Google Gemini |
| Session / auth | better-auth (stateful, cookie-based) |
| Cloud integrations | Google Drive, Google Sheets, Microsoft OneDrive, Excel |
| Mobile | Flutter (iOS / Android) |

---

## 1. Document Handling: Upload to Complete

### Status lifecycle

```
pending → processing → staged → complete
                     ↘ failed   ↘ complete_no_sync
```

### Step-by-step flow

**1. Upload (web or mobile → POST /api/receipts or /api/sales)**

- Auth is validated (see Section 2).
- File is validated: MIME type whitelist, 10 MB size cap, 30 uploads/day per user.
- A SHA-256 hash of the file is computed for exact-duplicate detection (Stage 1 dedup). If a matching hash exists the upload is rejected immediately.
- File bytes are uploaded to Cloudflare R2 at `receipts/{userId}/{id}/{filename}`.
- A DB row is inserted with `status = 'pending'`. This is the only DB write at this stage.
- The server returns `202 Accepted` with the new document ID.
- The AI processor is queued via Cloudflare Workers' `ctx.waitUntil()` — it runs concurrently after the response is sent.

**2. Background processing (receipt-processor.js / sales-processor.js)**

- File bytes are fetched from R2.
- Metadata is scanned for AI-generation signals and authenticity risk markers.
- Gemini extracts structured fields: merchant, date, total, line items (receipts); document title, revenue, cost, margin, line items (sales).
- Extracted data is persisted to the DB: the main row is updated and child `receiptLineItem` / `saleLineItem` rows are inserted.
- Stage 2 dedup: checks for an existing receipt/invoice number belonging to the same user and flags semantic duplicates.
- The document is vectorized in Cloudflare Vectorize for future semantic search.
- `status` is updated to `'staged'`. On any unrecoverable error, `status` is set to `'failed'` with an `errorMessage`.

**3. Status polling (web only)**

- After receiving the `202`, the upload page polls `GET /api/receipts/{id}/status` every 2 seconds.
- The status endpoint includes a safety check: if a document has been in `processing` for more than 5 minutes, it auto-marks it `'failed'` to avoid silent hangs.
- Polling stops when a terminal status is reached: `staged`, `complete`, `complete_no_sync`, or `failed`.
- The mobile app does not poll; it reads from cache and the detail page re-fetches on load.

**4. User review (staged)**

- The document is visible on the home timeline and detail page.
- The user may edit extracted fields (merchant name, date, total, line items, tags, notes) before committing.
- Actions available: **Edit**, **Commit**, **Abort**.
- Abort immediately deletes the R2 object, removes the vector index entry, and hard-deletes the DB row (cascade deletes line items).

**5. Commit (POST /api/receipts/{id}/commit)**

- Only permitted when `status = 'staged'`; returns `409` otherwise.
- Returns `202` immediately; the committer is queued via `ctx.waitUntil()`.

**6. Cloud sync (receipt-committer.js / sales-committer.js)**

- The committer loads the freshest DB state (so any user edits are captured).
- File bytes are re-fetched from R2.
- For each connected integration (Google or Microsoft):
  - A valid OAuth access token is obtained. If the stored token is within its TTL it is used directly; otherwise it is refreshed.
  - The file is uploaded to the appropriate Drive folder: `/{root}/{year}/{month}/`.
  - A row is appended to the linked spreadsheet (Google Sheets or Excel) for that month's tab.
  - On a 401/UNAUTHENTICATED error from the cloud API, the token is force-refreshed and the operation is retried once.
  - On a permanent auth failure (`invalid_grant`, revoked access), the error is stored with an `AUTH_REQUIRED:` prefix in `errorMessage` and processing continues to final status.
- `r2ExpiresAt` is set to 7 days from now so the R2 object is retained for a grace period.
- Final status: `'complete'` if cloud sync succeeded (or no integrations are connected); `'complete_no_sync'` if sync was attempted and failed.

**7. R2 cleanup (r2-cleanup.js, background cron)**

- Deletes R2 objects where `r2ExpiresAt < now` (synced documents past their grace period).
- Also deletes R2 objects for abandoned documents: `r2ExpiresAt IS NULL` and status in `{pending, processing, staged, failed}` and `createdAt < now − 30 days`.

---

## 2. User Session Authentication

### Mechanism

Both the web app and mobile app use **stateful, cookie-based sessions** managed by better-auth. There are no JWTs used for session validation — every authenticated request requires a database lookup.

### Web app flow

**Sign-in**

1. User authenticates via Google OAuth in the browser.
2. better-auth exchanges the OAuth code for a verified identity, creates a session row in D1 (`session` table), and sets an HTTP session cookie in the response.
3. Session is configured with a 30-day expiry (`expiresIn`) and auto-extended by 1 day on each use after the `updateAge` threshold (1 day).

**Per-request validation (hooks.server.js)**

1. For every incoming request, `auth.api.getSession()` reads the session cookie from request headers and queries the D1 `session` table to validate it.
2. **This is a database hit on every request.** There is no in-memory cache or stateless token to bypass it.
3. If the session row exists and is not expired, `event.locals.user` and `event.locals.session` are populated and the request proceeds.
4. If the session is stale enough to trigger `updateAge`, better-auth also **writes** back to D1 to extend `expiresAt` — a second DB operation on those requests.

**Per-route auth check (API handlers)**

- Route handlers check `if (!locals.user) error(401)` — a simple in-process guard, no further DB call.
- All subsequent DB queries in the handler use `locals.user.id` to scope data to the authenticated user.

**Sign-out**

- The session row is deleted from D1. The cookie is cleared. Token revocation is immediate with no propagation delay (unlike JWTs).

### Mobile app flow

**Sign-in**

1. `GoogleSignIn` from the `google_sign_in` package obtains a Google ID token on device.
2. The ID token is POSTed to `POST /api/auth/sign-in/social` on the web server.
3. better-auth verifies the ID token with Google, creates a session row in D1, and returns the session cookie in the `Set-Cookie` response header.
4. The mobile app extracts the raw `Set-Cookie` header value and persists it to `FlutterSecureStorage` under the key `fuzzy_session_cookie`.
5. The cookie is simultaneously injected into an in-memory `CookieJar` (via `dio_cookie_manager`) so the next request is authenticated without a restart.

**Per-request auth (ApiClient / Dio)**

1. On cold start, `_restoreSession()` reads the persisted cookie from secure storage and re-injects it into the `CookieJar`. This completes before any API requests fire (guarded by `await client.sessionReady`).
2. Every outgoing Dio request automatically attaches the cookie from the jar. The server validates it against D1 on every request — same as web.
3. An `_AuthInterceptor` watches all responses. If a `401` is received, it calls `onUnauthorized()`, which transitions the `AuthState` to `signedOut` with a descriptive message, redirecting the user to the sign-in screen.

**Sign-out**

- `POST /api/auth/sign-out` is called to delete the session row in D1.
- `GoogleSignIn.signOut()` clears the Google credential on device.
- `FlutterSecureStorage` key is deleted and the `CookieJar` is cleared.

### Summary table

| Aspect | Web | Mobile |
|---|---|---|
| Credential at rest | HTTP cookie (browser managed) | Raw `Set-Cookie` value in `FlutterSecureStorage` |
| Sent on each request | Browser attaches cookie automatically | Dio `CookieJar` injects from in-memory jar |
| DB hit per request | Yes — D1 session table lookup | Yes — same server-side validation |
| Session expiry | 30 days, extended on use | Same (server-side) |
| Expired session handling | Redirected by SvelteKit layout guard | `_AuthInterceptor` → `onUnauthorized()` → sign-in screen |
| Sign-out guarantees | Immediate (row deleted) | Immediate (row deleted + local state cleared) |

---

## 3. External Services

| Service | Purpose | Auth mechanism |
|---|---|---|
| Google OAuth | User sign-in (web + mobile) | OAuth 2.0 authorisation code (web) / ID token exchange (mobile) |
| Google Drive | Receipt/sale file storage | OAuth access token per user, stored in D1, refreshed on expiry |
| Google Sheets | Ledger spreadsheet rows | Same OAuth token as Drive |
| Microsoft OneDrive | Alternative file storage | OAuth access token per user, stored in D1, refreshed on expiry |
| Microsoft Excel (Graph API) | Alternative ledger spreadsheet | Same OAuth token as OneDrive |
| Google Gemini | AI field extraction | API key (server-side, not per-user) |
| Cloudflare R2 | Raw file storage (pre-sync buffer) | Workers binding (no per-request auth) |
| Cloudflare D1 | Relational database | Workers binding |
| Cloudflare Vectorize | Semantic search index | Workers binding |

### OAuth token lifecycle (cloud integrations)

- User connects Google or Microsoft from the Settings → Integrations page.
- Access token and refresh token are stored in the `integration` table in D1.
- `getValidAccessToken()` checks `tokenExpiresAt` before each cloud operation. If within TTL, the stored token is used directly. If expired, the refresh endpoint is called and the new token is persisted.
- If a cloud API returns a 401/UNAUTHENTICATED, `forceRefresh: true` is passed to bypass the TTL check and attempt an unconditional refresh, then the operation is retried once.
- If the refresh itself fails with a permanent error (`invalid_grant`, `interaction_required`) — meaning the user has revoked access — the error is stored with an `AUTH_REQUIRED:` prefix and surfaced as a reauthorisation banner on both web and mobile.

---

## 4. Future Considerations

### Performance & scaling

**Session lookup caching.** Every request pays a D1 round-trip for session validation. At low traffic this is negligible, but under load it becomes a bottleneck. A short-lived cache in Cloudflare Workers KV — keyed by session token hash, TTL of 60 seconds — would eliminate most D1 reads while keeping revocation lag acceptably small.

**JWT for stateless validation.** Replacing or supplementing the stateful session cookie with a short-lived signed JWT (e.g. 5 minutes) would allow session validation entirely in-memory at the edge. A lightweight revocation list in KV would handle sign-out. This is a meaningful architectural change but would significantly reduce D1 read pressure at scale.

**Background job queue.** Commit and processing jobs currently run via `ctx.waitUntil()`, which ties them to the lifetime of a single Worker invocation. A durable queue (Cloudflare Queues) would decouple ingestion from processing, enable retries with backoff, and give visibility into the job backlog — important if upload volume spikes.

**R2 streaming.** File bytes are fully buffered into memory during cloud sync (`arrayBuffer()`). For large files this increases Worker memory pressure. Streaming the R2 object body directly to the Drive/OneDrive upload endpoint would reduce peak memory usage.

### Security

**OAuth token encryption at rest.** Access and refresh tokens are stored in plaintext in D1. Encrypting them with a KMS-managed key (e.g. Cloudflare's key management or an external KMS) before writing would limit the blast radius if the database is ever read by an unauthorised party.

**File content validation beyond MIME type.** The upload handler validates MIME type from the request header, which is client-supplied and trivially spoofable. Adding server-side magic-byte inspection (reading the first few bytes of the R2 object to confirm file type) would close this gap.

**Rate limiting at the edge.** The 30 uploads/day limit is enforced by a DB count query on every upload. A Cloudflare Rate Limiting rule or a lightweight counter in Workers KV would enforce limits before the request reaches the Worker, reducing DB load and providing a harder guarantee.

**Session fixation and cookie hardening.** Ensure `better-auth` issues `HttpOnly`, `Secure`, and `SameSite=Lax` (or `Strict`) cookies by default. Rotate the session token on privilege escalation (e.g. after a re-authentication prompt before a destructive action).

**Secret rotation.** API keys (Gemini) and OAuth client secrets should be rotated on a schedule and stored in Cloudflare Workers Secrets (not environment variables committed to source). A secret manager integration would support rotation without redeployment.

### Reliability

**Idempotent commit.** If a Worker dies mid-commit (between Drive upload and spreadsheet update), the document can be left in an inconsistent state. Storing intermediate progress (`driveFileId`, `sheetId`) is already done, but an explicit re-entrant "resume commit" path — checking what was already done before repeating cloud calls — would make commits fully safe to retry.

**Dead-letter handling.** Jobs that fail permanently (e.g. repeated `AUTH_REQUIRED` errors) surface a message to the user but do not alert anyone operationally. A dead-letter destination (a dedicated D1 table or a logging sink) with a monitoring alert would allow proactive follow-up.

**Mobile offline queue.** The mobile app currently fires API requests directly. Adding a local queue (persisted to SQLite via `drift` or similar) would allow users to capture documents offline and sync when connectivity is restored, rather than receiving an immediate error.

### Observability

**Structured logging.** Server-side `console.error` / `console.warn` calls are scattered through the codebase. Routing these through a structured logger with consistent fields (userId, documentId, operation, duration, error code) would make Cloudflare Logpush or a third-party log aggregator (Datadog, Axiom) far more useful for debugging production issues.

**Metrics on commit latency.** The time between a user pressing Commit and the document reaching `complete` is invisible. Instrumenting the committer with start/end timestamps written to D1 (or emitted as analytics events) would allow tracking p50/p99 sync latency per cloud provider.
