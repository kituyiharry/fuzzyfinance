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
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

interface Env {
	ASSETS: Fetcher;
	/** Cloudflare R2 bucket — transit buffer for receipt file uploads */
	fuzzyfinance_receipts: R2Bucket;
	/** Workers AI — used for receipt text embedding */
	AI: Ai;
	/** Cloudflare Vectorize — semantic receipt search */
	VECTORIZE: VectorizeIndex;
}

export {};
