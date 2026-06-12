import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { indexLineItems } from '$lib/server/vectorize';

/**
 * One-shot backfill: embeds and indexes every standard line item in the
 * workspace that already has BOTH primary + secondary categories set.
 * Useful as a seed after migrating, or after a wipe of the Vectorize
 * index. Idempotent — re-running just re-upserts the same vectors.
 *
 * Returns `{ indexedReceipts, indexedSales, skipped }`.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.AI || !env?.VECTORIZE) error(500, 'AI / Vectorize bindings unavailable');

	const workspaceId = params.id;
	// Ownership check.
	const [ws] = await db.select()
		.from(schema.workspace)
		.where(and(eq(schema.workspace.id, workspaceId), eq(schema.workspace.userId, locals.user.id)));
	if (!ws) error(404, 'Workspace not found');

	const receipts = await db.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.userId, locals.user.id), eq(schema.receipt.workspaceId, workspaceId)));

	const sales = await db.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.userId, locals.user.id), eq(schema.sale.workspaceId, workspaceId)));

	let indexedReceipts = 0;
	let indexedSales    = 0;
	let skipped         = 0;

	for (const r of receipts) {
		const lines = await db.select()
			.from(schema.receiptLineItem)
			.where(eq(schema.receiptLineItem.receiptId, r.id));
		const labelled = lines.filter((l) => l.kind === 'standard' && !l.aiSuggested && l.primaryCategory && l.secondaryCategory);
		if (labelled.length === 0) { skipped += lines.length; continue; }
		const res = await indexLineItems(env, {
			userId:      locals.user.id,
			workspaceId,
			parentKind:  'receipt',
			merchant:    r.merchantName
		}, labelled);
		indexedReceipts += res.indexed;
		skipped         += res.skipped;
	}

	for (const s of sales) {
		const lines = await db.select()
			.from(schema.saleLineItem)
			.where(eq(schema.saleLineItem.saleId, s.id));
		const labelled = lines.filter((l) => l.kind === 'standard' && !l.aiSuggested && l.primaryCategory && l.secondaryCategory);
		if (labelled.length === 0) { skipped += lines.length; continue; }
		const res = await indexLineItems(env, {
			userId:      locals.user.id,
			workspaceId,
			parentKind:  'sale',
			merchant:    s.documentTitle
		}, labelled);
		indexedSales += res.indexed;
		skipped      += res.skipped;
	}

	return json({ ok: true, indexedReceipts, indexedSales, skipped });
}
