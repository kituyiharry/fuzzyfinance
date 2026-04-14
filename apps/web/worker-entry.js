/**
 * Cloudflare Worker entry point.
 *
 * Wraps the SvelteKit-generated worker and adds a `scheduled` handler for the
 * daily R2 cleanup cron trigger. All regular HTTP requests are forwarded to the
 * SvelteKit fetch handler unchanged.
 *
 * This file is only referenced AFTER a build (`npm run build`). The wrangler.jsonc
 * `"main"` field points here; `wrangler dev` uses the preview script which also
 * builds first.
 */

// @ts-ignore — generated at build time
import svelteKitWorker from './.svelte-kit/cloudflare/_worker.js';
import { runWithDb } from './src/lib/server/db/index.js';
import { cleanupExpiredR2Objects } from './src/lib/server/r2-cleanup.js';

export default {
	/**
	 * All HTTP requests are handled by the SvelteKit worker as normal.
	 *
	 * @param {Request} request
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	fetch(request, env, ctx) {
		return svelteKitWorker.fetch(request, env, ctx);
	},

	/**
	 * Scheduled event — fired by the Cloudflare Cron Trigger defined in wrangler.jsonc.
	 * Runs the R2 cleanup job inside the same D1-backed async context used by all
	 * request handlers.
	 *
	 * @param {ScheduledEvent} _event
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	scheduled(_event, env, ctx) {
		ctx.waitUntil(
			runWithDb(env.DB, () => cleanupExpiredR2Objects(env))
		);
	},
};
