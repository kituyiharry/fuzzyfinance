import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { suggestCategoriesForLines } from '$lib/server/vectorize';
import { classifyLineItemsViaGemini } from '$lib/server/gemini-classify';
import { extractUnitsFromDescription } from '$lib/server/unit-normalizer';

/**
 * On-demand category suggester. Same two-hop waterfall the Xero
 * post-sync classifier uses:
 *
 *   1. Embeddings — embed the line's description (with merchant context)
 *      and run kNN over the workspace's labelled history. Confidence
 *      gated by score + consensus floors in `_aggregateSuggestion`.
 *   2. Gemini — for lines the embeddings hop returned `null` for, batch
 *      them into one Gemini call against the full taxonomy. Credential
 *      resolution: OAuth (Google integration with the Gemini scope) >
 *      `env.GEMINI_API_KEY` (Worker secret).
 *
 * URL is `/embeddings/suggest` for backwards-compat — historically only
 * the embeddings path lived here. Callers (the refinement editor's
 * "Autofill" button, primarily) don't need to know which hop produced
 * a result; the response shape is unchanged.
 *
 * Request body:
 *   {
 *     merchant: string | null,
 *     lines:    Array<{ description: string | null }>
 *   }
 *
 * Response:
 *   {
 *     suggestions: Array<{
 *       primary:   string,
 *       secondary: string,
 *       score?:    number,                  // present only for embeddings hits
 *       source:    'embeddings' | 'gemini',
 *       unitSize?: string,                  // present when a unit was extracted
 *       unitType?: string,                  // canonical abbreviation (kg, L, pk, …)
 *       unitSource?: 'gemini' | 'regex'     // which path produced unitSize/unitType
 *     } | null>
 *   }
 *
 * Unit info comes from Gemini when that hop fired; otherwise from a
 * lightweight regex pass over the description that matches known unit
 * aliases (handles "2L", "500ml", "0.784 kg", "40pk" patterns). Either
 * way the unit type is normalised to its canonical abbreviation before
 * the response goes out.
 *
 * `null` at index `i` means neither hop could classify line `i` —
 * leave it as the user found it.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals, request, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.AI || !env?.VECTORIZE) error(503, 'AI / Vectorize bindings unavailable');

	const workspaceId = params.id;
	const [ws] = await db.select()
		.from(schema.workspace)
		.where(and(
			eq(schema.workspace.id, workspaceId),
			eq(schema.workspace.userId, locals.user.id)
		));
	if (!ws) error(404, 'Workspace not found');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Body must be a JSON object');

	const merchant = typeof body.merchant === 'string' ? body.merchant : null;
	/** @type {Array<{ description: string | null }>} */
	const lines = Array.isArray(body.lines) ? body.lines : [];
	if (lines.length === 0) return json({ suggestions: [] });

	/** @type {Array<{ primary: string, secondary: string, score?: number, source: 'embeddings' | 'gemini', unitSize?: string, unitType?: string, unitSource?: 'gemini' | 'regex' } | null>} */
	const suggestions = lines.map(() => null);

	// Hop 1 — embeddings. Fail-open: a Vectorize hiccup or empty index
	// is just "all nulls", and Gemini still gets to try.
	try {
		const results = await suggestCategoriesForLines(env, {
			userId:      locals.user.id,
			workspaceId,
			merchant
		}, lines.map((l) => ({ description: l?.description ?? null })));
		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			if (r) suggestions[i] = { primary: r.primary, secondary: r.secondary, score: r.score, source: 'embeddings' };
		}
	} catch (/** @type {any} */ err) {
		console.warn('[embeddings/suggest] embeddings hop failed:', err?.message ?? err);
	}

	// Hop 2 — Gemini for descriptions the embeddings hop couldn't
	// confidently classify. Batched into one call.
	const pendingIndexes = suggestions
		.map((s, i) => (s ? -1 : i))
		.filter((i) => i >= 0);

	if (pendingIndexes.length > 0) {
		try {
			const items = pendingIndexes.map((i) => ({ description: lines[i]?.description ?? null }));
			const gemini = await classifyLineItemsViaGemini({
				userId:      locals.user.id,
				workspaceId,
				items
			});
			for (let k = 0; k < pendingIndexes.length; k++) {
				const g = gemini[k];
				if (!g) continue;
				/** @type {NonNullable<typeof suggestions[number]>} */
				const entry = { primary: g.primary, secondary: g.secondary, source: 'gemini' };
				if (g.unitSize && g.unitType) {
					entry.unitSize   = g.unitSize;
					entry.unitType   = g.unitType;
					entry.unitSource = 'gemini';
				}
				suggestions[pendingIndexes[k]] = entry;
			}
		} catch (/** @type {any} */ err) {
			console.warn('[embeddings/suggest] gemini hop failed:', err?.message ?? err);
		}
	}

	// Hop 3 (free) — regex unit extraction for every classified line that
	// didn't already get a unit from Gemini. Gives embeddings-only hits a
	// chance to carry units forward when the description is unambiguous.
	for (let i = 0; i < suggestions.length; i++) {
		const s = suggestions[i];
		if (!s || s.unitSize) continue;
		const extracted = extractUnitsFromDescription(lines[i]?.description ?? null);
		if (extracted) {
			s.unitSize   = extracted.size;
			s.unitType   = extracted.type;
			s.unitSource = 'regex';
		}
	}

	return json({ suggestions });
}
