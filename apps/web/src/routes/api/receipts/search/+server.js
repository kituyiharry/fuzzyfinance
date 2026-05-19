import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, or, like, inArray } from 'drizzle-orm';
import { searchReceipts } from '$lib/server/vectorize';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await request.json();
	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if (!query) error(400, 'Missing query string');

	const uid = locals.user.id;

	// 1. Semantic search via Vectorize
	let matches = /** @type {Array<{ id: string; score: number }>} */ ([]);
	try {
		if (platform?.env?.AI && platform?.env?.VECTORIZE) {
			matches = await searchReceipts(platform.env, uid, query);
		}
	} catch { /* non-fatal — fall through to LIKE */ }

	const vectorIdSet = new Set(matches.map((m) => m.id));

	// 2. LIKE search covering merchant, category, notes, and line item descriptions
	const likeRows = await db
		.select({ id: schema.receipt.id })
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, uid),
			or(
				like(schema.receipt.merchantName,  `%${query}%`),
				like(schema.receipt.category,      `%${query}%`),
				like(schema.receipt.notes,         `%${query}%`),
				like(schema.receipt.lineItemsJson, `%${query}%`)
			)
		));

	// Deduplicate: LIKE hits already covered by vectorize don't need re-fetching
	const likeOnlyIds = likeRows.map((r) => r.id).filter((id) => !vectorIdSet.has(id));

	const allIds = [...vectorIdSet, ...likeOnlyIds];
	if (!allIds.length) return json([]);

	const rows = await db
		.select()
		.from(schema.receipt)
		.where(inArray(schema.receipt.id, allIds));

	// Vectorize matches get their similarity score; LIKE-only matches get 0
	const scored = rows
		.map((row) => ({
			...row,
			score: matches.find((m) => m.id === row.id)?.score ?? 0
		}))
		.sort((a, b) => b.score - a.score);

	return json(scored);
}
