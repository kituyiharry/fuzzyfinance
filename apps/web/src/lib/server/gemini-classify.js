/**
 * Gemini-based category classifier facade.
 *
 * Picks a credential in priority order:
 *   1. The user's Google integration access token, if the integration is
 *      connected AND its granted scopes include
 *      `generative-language.retriever`.
 *   2. The Worker-secret `GEMINI_API_KEY` (read inside `gemini.js` from
 *      `$env/dynamic/private`). API keys are NEVER stored in the
 *      database; the deployment env owns them.
 *
 * If neither path is usable, classification calls return nulls per item
 * and the caller treats the hop as silently skipped.
 *
 * Used by the Xero sync waterfall as the second hop after embeddings.
 */

import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { env as privateEnv } from '$env/dynamic/private';
import { classifyLineItems } from '$lib/server/gemini';
import { getValidAccessToken } from '$lib/server/token-refresh';

const GEMINI_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';

/**
 * Resolve a Gemini credential for this user. Returns the descriptor of
 * which credential path is available, or `null` when neither is.
 *
 * @param {string} userId
 * @returns {Promise<{ kind: 'oauth', accessToken: string } | { kind: 'envApiKey' } | null>}
 */
export async function resolveGeminiCredential(userId) {
	// 1. OAuth via Google integration (if the user granted the Gemini scope).
	const [googleIntegration] = await db.select()
		.from(schema.integration)
		.where(and(
			eq(schema.integration.userId, userId),
			eq(schema.integration.provider, 'google')
		));
	if (googleIntegration) {
		const scopes = googleIntegration.scopes ? _parseScopes(googleIntegration.scopes) : [];
		if (scopes.includes(GEMINI_SCOPE)) {
			try {
				const accessToken = await getValidAccessToken(userId, 'google');
				if (accessToken) return { kind: 'oauth', accessToken };
			} catch {
				// Fall through to env key.
			}
		}
	}

	// 2. Worker-env API key. `gemini.js` reads this from `$env/dynamic/private`
	// when no access token is supplied.
	if (privateEnv.GEMINI_API_KEY) return { kind: 'envApiKey' };

	return null;
}

/**
 * Hard cap on items per Gemini call. Empirically, the model reliably
 * stays inside its 25s timeout for ~25 items per prompt; large batches
 * (200+) routinely blow past it because the model has to generate a
 * proportionally large JSON array. AutoFix can pass hundreds of unique
 * descriptions in a single call — we chunk transparently here so callers
 * don't have to think about it. The editor's Autofill path, which only
 * ever sends a handful at a time, is unaffected.
 */
const GEMINI_BATCH_SIZE = 25;

/**
 * Classify a batch of line items via Gemini. Wrap the lower-level
 * `classifyLineItems` from `gemini.js` with credential resolution and
 * transparent chunking.
 *
 * `documentCategory` is passed through as context — biases Gemini
 * toward staying consistent with the document-level intent when one
 * is already set.
 *
 * @param {{
 *   userId:            string,
 *   workspaceId?:      string | null,
 *   documentCategory?: string | null,
 *   items:             Array<{ description: string | null, type?: string | null }>
 * }} opts
 * @returns {Promise<Array<{ primary: string, secondary: string } | null>>}
 *   One entry per input item, in input order. `null` when Gemini doesn't
 *   come back with a confident result for that index. Per-batch failures
 *   are isolated — null gets returned for that slice, the rest still go.
 */
export async function classifyLineItemsViaGemini(opts) {
	if (opts.items.length === 0) return [];

	const cred = await resolveGeminiCredential(opts.userId);
	if (!cred) return opts.items.map(() => null);

	// OAuth → pass the access token. Env-key path → omit it, so
	// `classifyLineItems` falls back to `env.GEMINI_API_KEY` from
	// `$env/dynamic/private` (a Worker secret).
	const accessToken = cred.kind === 'oauth' ? cred.accessToken : null;

	/** @type {Array<{ primary: string, secondary: string } | null>} */
	const out = opts.items.map(() => null);

	for (let start = 0; start < opts.items.length; start += GEMINI_BATCH_SIZE) {
		const slice = opts.items.slice(start, start + GEMINI_BATCH_SIZE);
		try {
			const items = slice.map((it) => ({
				description: it.description ?? '(no description)',
				type:        it.type ?? undefined
			}));
			const classifications = await classifyLineItems(items, {
				documentCategory: opts.documentCategory ?? undefined,
				accessToken
			});

			// `classifications[k].index` is relative to THIS slice (0..slice.length-1).
			const byIndex = new Map(classifications.map((c) => [c.index, c]));
			for (let i = 0; i < slice.length; i++) {
				const c = byIndex.get(i);
				if (!c) continue;
				const primary   = c.primaryCategory   ?? '';
				const secondary = c.secondaryCategory ?? '';
				if (!primary || primary === 'Other') continue;
				out[start + i] = { primary, secondary };
			}
		} catch (/** @type {any} */ err) {
			// Per-batch failure is non-fatal: lines in this slice stay null,
			// the next batch still runs. A 25s timeout on one chunk no longer
			// kills the entire AutoFix.
			console.warn(`[gemini-classify] batch ${start}-${start + slice.length} failed:`, err?.message ?? err);
		}
	}

	return out;
}

/**
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
function _parseScopes(raw) {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
