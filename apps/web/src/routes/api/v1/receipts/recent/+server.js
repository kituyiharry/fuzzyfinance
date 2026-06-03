import { json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { requireScope } from '$lib/server/api-auth';

/**
 * GET /api/v1/receipts/recent?limit=10
 * Returns the user's most recently created receipts (newest first).
 *
 * Scope required: receipts.read
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET(event) {
	requireScope(event, 'receipts.read');

	const limitRaw = Number(event.url.searchParams.get('limit') ?? 10);
	const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10), 50);

	// @ts-ignore — guaranteed by requireScope
	const userId = event.locals.user.id;

	const rows = await db
		.select({
			id:            schema.receipt.id,
			merchant:      schema.receipt.merchantName,
			receiptDate:   schema.receipt.receiptDate,
			total:         schema.receipt.total,
			currency:      schema.receipt.currency,
			category:      schema.receipt.category,
			createdAt:     schema.receipt.createdAt,
		})
		.from(schema.receipt)
		.where(and(eq(schema.receipt.userId, userId)))
		.orderBy(desc(schema.receipt.createdAt))
		.limit(limit);

	return json({ items: rows });
}
