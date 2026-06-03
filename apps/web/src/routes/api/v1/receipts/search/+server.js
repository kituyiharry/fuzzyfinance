import { error, json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { requireScope } from '$lib/server/api-auth';
import { searchReceipts } from '$lib/server/vectorize';

/**
 * GET /api/v1/receipts/search?q=…&limit=10
 *
 * Semantic search over the user's receipts via Cloudflare Vectorize. Returns
 * `{ matches: [{ id, score, merchant, receiptDate, total, currency, category }] }`
 * enriched with structured columns so the caller can render summaries without
 * a second round-trip per match.
 *
 * Scope required: receipts.read
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET(event) {
	requireScope(event, 'receipts.read');

	const q = (event.url.searchParams.get('q') ?? '').trim();
	if (!q) error(400, 'Missing query parameter: q');

	const limitRaw = Number(event.url.searchParams.get('limit') ?? 10);
	const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10), 25);

	if (!event.platform?.env?.VECTORIZE) error(500, 'Vector search is not available');

	// @ts-ignore — guaranteed by requireScope
	const userId = event.locals.user.id;

	const hits = await searchReceipts(event.platform.env, userId, q, limit);
	if (hits.length === 0) return json({ matches: [] });

	const rows = await db
		.select({
			id:           schema.receipt.id,
			merchant:     schema.receipt.merchantName,
			receiptDate:  schema.receipt.receiptDate,
			total:        schema.receipt.total,
			currency:     schema.receipt.currency,
			category:     schema.receipt.category,
		})
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, userId),
			inArray(schema.receipt.id, hits.map((h) => h.id)),
		));

	/** @type {Map<string, typeof rows[number]>} */
	const byId = new Map(rows.map((r) => [r.id, r]));
	const matches = hits
		.map((h) => {
			const r = byId.get(h.id);
			if (!r) return null;
			return { ...r, score: h.score };
		})
		.filter(Boolean);

	return json({ matches });
}
