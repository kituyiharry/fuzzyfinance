# FuzzyFinance

Personal finance platform for managing receipts and sales documents with AI-powered data extraction, cloud storage sync, and a mobile companion app.

---

## Repository Structure

```
fuzzyfinance/
├── apps/
│   ├── web/          # SvelteKit web app — primary backend + dashboard
│   ├── fuzzies/      # Flutter mobile app — iOS & Android companion
│   └── orsolver/     # Rust constraint solver service (Cloudflare Container)
└── packages/
    └── db/           # @fuzzyfinance/db — shared Drizzle schema, DTOs, repos
```

---

## Apps

### `apps/web` — Web App & API

SvelteKit 5 application deployed to Cloudflare Workers. Handles all server-side logic: file ingestion, AI extraction, cloud sync, auth, and the dashboard UI.

**Architecture**

- **Runtime:** Cloudflare Workers (edge, no Node.js)
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM — shared schema from `@fuzzyfinance/db`
- **Storage:** Cloudflare R2 — uploaded receipt/sale files live here until committed
- **AI extraction:** Google Gemini (`gemini-2.5-flash`) — parses uploaded documents into structured JSON (merchant, totals, line items, etc.)
- **Semantic search:** Cloudflare Workers AI (`bge-base-en-v1.5`) generates embeddings; Cloudflare Vectorize stores and queries them
- **Auth:** better-auth with Google OAuth and a Drizzle SQLite adapter; cookie-based sessions
- **Cloud sync:** after extraction, receipts/sales can be committed to Google Drive or OneDrive (Microsoft Graph); a linked spreadsheet is updated automatically

**Key flows**

1. User uploads a file → stored in R2, background job kicks off
2. Gemini extracts structured data → saved to D1, embedded into Vectorize → status set to `staged`
3. User reviews and commits → file moved to Drive/OneDrive, R2 object deleted → status `complete`
4. Semantic search queries Vectorize; AI Q&A combines vector results with Gemini for natural-language answers

**External dependencies**

| Service | Purpose |
|---|---|
| Cloudflare D1 | Primary database |
| Cloudflare R2 | Temporary file storage |
| Cloudflare Workers AI | Text embeddings |
| Cloudflare Vectorize | Vector search index |
| Google Gemini API | Document data extraction & AI Q&A |
| Google OAuth + Drive + Sheets | Auth and cloud sync |
| Microsoft OAuth + OneDrive + Excel | Alternative cloud sync |

**Environment variables** — create `apps/web/.env`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
IOS_GOOGLE_CLIENT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
BETTER_AUTH_SECRET=          # 32+ char random string
GEMINI_API_KEY=
CLOUDFLARE_ACCOUNT_ID=       # for drizzle-kit DB access
CLOUDFLARE_D1_DATABASE_ID=
CLOUDFLARE_API_TOKEN=
```

**Running locally**

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

For a realistic preview with real Cloudflare bindings (D1, R2, Workers AI):

```bash
npm run preview      # wrangler dev --port 4173
```

Database:

```bash
npm run db:generate  # generate migration files from schema changes
npm run db:push:local   # apply migrations to local D1
npm run db:studio    # open Drizzle Studio UI
```

**Deploying**

```bash
npm run build
wrangler deploy
# Apply DB migrations to production
wrangler d1 migrations apply DB --remote
```

A daily cron job (`0 3 * * *`) automatically cleans up expired R2 objects; it is registered as part of the Worker deployment.

---

### `apps/fuzzies` — Mobile App

Flutter companion app for iOS and Android. Connects to the `apps/web` API over HTTP for auth, uploads, and document browsing.

**Architecture**

- **Framework:** Flutter 3.x with Material Design
- **State management:** Riverpod
- **Routing:** go_router
- **HTTP:** Dio with cookie jar (session cookies forwarded for auth)
- **Auth:** Google Sign-In SDK + secure credential storage via flutter_secure_storage
- **Local cache:** Hive (structured) + SharedPreferences (simple key-value)
- **Media:** image_picker + file_picker for camera and document uploads

The app is a thin client — all business logic lives in the web API. The mobile app handles file selection, auth handshake, and renders document lists/details with Hero-animated transitions.

**Running locally**

```bash
cd apps/fuzzies
flutter pub get
flutter run              # requires a connected device or emulator
flutter run --release    # optimised build
```

Ensure the `baseUrl` in `lib/core/config/app_config.dart` points to your running web server (e.g. `http://localhost:5173` for development).

**Building for distribution**

```bash
# Android
flutter build apk --release
flutter build appbundle --release   # preferred for Play Store

# iOS
flutter build ios --release
```

---

### `apps/orsolver` — Constraint Solver Service

Rust microservice that solves FlatZinc constraint satisfaction models using Google OR-Tools CP-SAT. Deployed as a Cloudflare Container fronted by a Worker proxy.

**Architecture**

- **Language:** Rust (edition 2021), async via Tokio, HTTP via Axum
- **Solver:** Google OR-Tools v9.15 (CP-SAT + FlatZinc frontend), compiled from source at build time via a C++ FFI shim (`orsolver-sys`)
- **Build:** multi-stage Docker image — Rust builder stage compiles OR-Tools and the server binary; slim Debian runtime stage copies the binary and shared `.so` libraries
- **Deployment:** Cloudflare Containers (Docker), exposed through a Worker proxy (`src/worker.js`) using a Durable Object binding

**API** (port 3000)

```
GET  /health          → "ok"
POST /solve           → { "model": "<FlatZinc>", "debug": false }
POST /solve/batch     → { "jobs": [{ "id": "...", "model": "..." }] }
```

**Running locally**

```bash
cd apps/orsolver
cargo build                    # first build compiles OR-Tools (~10–20 min)
cargo run -p orsolver-server   # server on :3000
cargo test -p orsolver         # integration tests
```

**Deploying**

```bash
docker build -t orsolver .
# Push to Cloudflare Containers registry, then:
wrangler deploy
```

The Worker proxy at `wrangler.toml` forwards requests to the container via the `ORSOLVER` Durable Object binding.

---

## Packages

### `packages/db` — `@fuzzyfinance/db`

Shared database layer. Exports Drizzle ORM schema definitions, DTOs, and repository functions used by `apps/web` (and potentially future services).

**Exports**

```js
import { schema, dto, repo } from '@fuzzyfinance/db';
```

**Schema tables**

| Module | Tables |
|---|---|
| `auth.schema.js` | `user`, `session`, `account`, `verification` |
| `receipts.schema.js` | `receipt`, `receipt_line_item` |
| `sales.schema.js` | `sale`, `sale_line_item` |
| `integrations.schema.js` | `integration` (Google/Microsoft OAuth tokens) |
| `conversations.schema.js` | `conversation` (AI chat history) |
| `ledger.schema.js` | `payable`, `payable_update`, `receivable`, `receivable_update` |
| `announcements.schema.js` | `announcement` |
| `exports.schema.js` | `receipt_export` |

**Regenerating TypeScript types** (after schema changes):

```bash
npm run build:types -w packages/db
```

---

## Monorepo Commands

Run from the repo root:

```bash
npm run dev            # start web dev server
npm run build          # production build for web
npm run lint           # prettier + eslint check
npm run format         # prettier + eslint fix
npm run gen            # regenerate Cloudflare Worker types (wrangler types)
npm run db:generate    # generate Drizzle migration files
npm run db:push:local  # apply migrations locally
npm run db:push:remote # apply migrations to production D1
npm run db:studio      # open Drizzle Studio
npm run auth:schema    # regenerate better-auth schema into packages/db
```
