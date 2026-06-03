import type { User, Session } from 'better-auth/minimal';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			user?: User;
			session?: Session;
			workspaceId?: string | null;
			/** Set on /api/v1/* requests by the Bearer-token middleware. */
			tokenScopes?: Set<string>;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

interface Env {
	/** Cloudflare D1 — primary relational database */
	DB: D1Database;
	ASSETS: Fetcher;
	/** Cloudflare R2 bucket — transit buffer for receipt/sale file uploads */
	fuzzyfinance_receipts: R2Bucket;
	/** Cloudflare R2 bucket — export artifacts (CSV files, analysis outputs) */
	fuzzyfinance_exports: R2Bucket;
	/** Workers AI — used for text embedding */
	AI: Ai;
	/** Cloudflare Vectorize — semantic search index */
	VECTORIZE: VectorizeIndex;
	/** Service binding to the hedaz analysis worker */
	HEDAZ: Fetcher;
}

export {};
