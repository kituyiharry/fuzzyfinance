# FuzzyFinance

A personal finance platform for managing receipts, sales documents, and financial records with AI-powered data extraction and automatic cloud storage sync (Google Drive / OneDrive).

Built with SvelteKit, Cloudflare D1, R2, Workers AI, and Vectorize.

---

## Overview

- Upload receipt and sale documents (PDF, images)
- Extract structured data via Gemini AI
- Sync documents to Google Drive or OneDrive with auto-organized ledger spreadsheets
- Semantic search across documents via Cloudflare Vectorize
- Export receipts as CSV
- Spending and revenue analytics

---

## Prerequisites

- **Node.js** 20+
- **Wrangler** CLI (`npm install -g wrangler`) — authenticate with `wrangler login`
- A **Cloudflare account** with access to Workers, D1, R2, Workers AI, and Vectorize

---

## Cloudflare Resource Setup

Run once to provision the required resources:

```bash
# D1 database
wrangler d1 create fuzzyfinance-db

# R2 buckets
wrangler r2 bucket create fuzzyfinance-receipts
wrangler r2 bucket create fuzzyfinance-receipts-preview   # local/preview dev only

# Vectorize index (768 dims — bge-base-en-v1.5)
wrangler vectorize create receipts-index --dimensions=768 --metric=cosine
```

Copy the `database_id` returned by `d1 create` into `wrangler.jsonc`.

---

## Environment Variables

Create a `.env` file in `apps/web/` (never commit this):

```env
# Google OAuth — from Google Cloud Console
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft OAuth — from Azure App Registration
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Better Auth — any random 32+ character string
BETTER_AUTH_SECRET=

# Gemini AI — from Google AI Studio
GEMINI_API_KEY=

# Cloudflare credentials — for drizzle-kit migrations via D1 HTTP API
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_D1_DATABASE_ID=
CLOUDFLARE_API_TOKEN=
```

> `AI` and `VECTORIZE` are accessed via Worker bindings — no separate API keys needed.

---

## Local Development

Runs SvelteKit via Vite with a local SQLite D1 stub and in-memory R2.

```bash
npm install
npm run db:push:local   # seed local D1
npm run dev             # http://localhost:5173
```

---

## Dev Remote (Wrangler Preview)

Runs a local Wrangler worker connected to your **real** Cloudflare D1 and R2. Use this to test cloud integrations before deploying.

```bash
npm run build
npm run preview         # wrangler dev --port 4173 → http://localhost:4173
```

> Preview uses the `fuzzyfinance-receipts-preview` R2 bucket. D1 data is the real database — mutations persist.

---

## Production Deploy

```bash
npm run build
wrangler deploy
```

Deploys the Worker and static assets to Cloudflare. The daily Cron Trigger (`0 3 * * *`) for R2 cleanup is registered automatically.

---

## Database Migrations

```bash
# 1. Generate migration SQL from schema changes
npm run db:generate

# 2. Apply to local D1 (development)
npm run db:push:local

# 3. Apply to remote D1 (production)
npm run db:push
```

Remote migrations require `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` in `.env`.

---

## Announcements

Announcements are written directly to the `announcement` table — there is no admin UI in this app. Rows with `show_banner = 1` appear as dismissible banners across all dashboard pages. All active (non-expired) announcements are listed at `/dashboard/announcements`.

Example:

```sql
INSERT INTO announcement (id, title, body, type, show_banner, active, published_at)
VALUES (
  lower(hex(randomblob(16))),
  'Scheduled Maintenance',
  'The platform will be unavailable Saturday 03:00–05:00 UTC.',
  'maintenance',
  1,
  1,
  unixepoch('now') * 1000
);
```

Types: `info` | `warning` | `maintenance` | `release`
