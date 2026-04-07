# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.12.8 create --template demo --types jsdoc --add prettier eslint tailwindcss="plugins:forms" vitest="usages:unit,component" sveltekit-adapter="adapter:cloudflare+cfTarget:workers" devtools-json drizzle="database:sqlite+sqlite:libsql" better-auth="demo:password" mcp="ide:claude-code,gemini+setup:remote" --install npm fuzzyfinance
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.


  ---
  What was built

  Database (run npm run db:generate && npm run db:push from apps/web/)

  - receipts.schema.js — receipt table (status state machine, all extracted fields, R2/Drive/Sheet/vector IDs) + receiptLineItem table with Drizzle relations
  - integrations.schema.js — added metadataJson column to cache Drive folder ID + ledger file ID per user (avoids re-searching on every upload)

  Cloudflare infra config

  - wrangler.jsonc — R2 bucket (RECEIPT_BUCKET), Workers AI (AI), Vectorize (RECEIPTS_INDEX) bindings
  - app.d.ts — typed the new platform env bindings

  Server utilities (src/lib/server/)

  ┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         File         │                                                       Does                                                       │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ token-refresh.js     │ Checks tokenExpiresAt, calls Google/Microsoft refresh endpoints, updates DB                                      │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ gemini.js            │ Gemini 2.0 Flash with enforced JSON responseSchema — extracts merchant, date, total, line items, category, notes │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ google-drive.js      │ Creates/finds FuzzyFinance Receipts folder, multipart file upload                                                │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ google-sheets.js     │ Creates/finds FuzzyFinance Ledger spreadsheet, writes header row, appends receipt rows                           │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ onedrive.js          │ Same for OneDrive + Excel via Graph API                                                                          │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ vectorize.js         │ Workers AI text embedding → Vectorize upsert/query/delete                                                        │
  ├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ receipt-processor.js │ Full pipeline orchestrator — runs as background task via ctx.waitUntil()                                         │
  └──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Pipeline flow

  POST /api/receipts → validate → R2.put → DB insert (pending) → ctx.waitUntil(process) → 202 {receiptId}

  Background (receipt-processor):
    R2.get → Gemini extract → DB update + line items insert
    → Workers AI embed → Vectorize upsert
    → [for each integration] Drive/OneDrive upload + Sheets/Excel row
    → R2.delete → DB update (complete)

  API routes

  - POST /api/receipts — upload endpoint, returns 202 {receiptId} immediately
  - GET /api/receipts — list all receipts for user
  - GET /api/receipts/[id] — receipt + line items
  - DELETE /api/receipts/[id] — removes DB row, R2 object, Vectorize vector
  - GET /api/receipts/[id]/status — lightweight polling ({status, errorMessage, merchantName, total})
  - POST /api/receipts/[id]/retry-sync — re-runs pipeline for failed/no-sync receipts
  - POST /api/receipts/search — semantic search via Vectorize, returns scored + sorted DB rows

  Dashboard pages

  - /dashboard/receipts — sortable table with inline search, status badges, sync indicators
  - /dashboard/receipts/upload — drag-and-drop dropzone → upload → live polling progress steps
  - /dashboard/receipts/[id] — full detail: all extracted fields, line items table, sync status cards (Drive/Sheets/Vectorize), retry/delete actions

  Setup commands

  # 1. Install new dependency (already done)
  npm install @google/generative-ai

  # 2. Provision Cloudflare resources (once per environment)
  wrangler r2 bucket create fuzzyfinance-receipts
  wrangler vectorize create receipts-index --dimensions=768 --metric=cosine

  # 3. Run DB migration
  npm run db:generate && npm run db:push   # from apps/web/

  # 4. Add to .env
  GEMINI_API_KEY=your_key_here

