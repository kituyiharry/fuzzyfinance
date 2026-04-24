import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { deleteSaleVector } from '$lib/server/vectorize';
import { logger } from '$lib/server/logger';
import { batchInsert } from '$lib/server/db/batch-insert';

const LOG = '[sales/PATCH]';

const TEXT_FIELDS = ['documentTitle', 'totalRevenue', 'totalCost', 'totalMargin', 'currency', 'category', 'notes'];

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');

	const lineItems = await db
		.select()
		.from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, sale.id));

	lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

	return json({ ...sale, lineItems });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');

	// Delete from R2 if still present
	if (sale.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(sale.r2Key);
		} catch {
			// Non-fatal
		}
	}

	// Delete vector if indexed
	if (sale.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteSaleVector(platform.env, sale.id);
		} catch {
			// Non-fatal
		}
	}

	await db
		.delete(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');
	if (sale.status !== 'staged') error(409, 'Only staged sales can be edited');

	const body = await request.json();
	const { documentTitle, saleDate, totalRevenue, totalCost, totalMargin, currency, category, notes, lineItems = [], tags = [] } = body;

	// ── Compute corrected fields vs AI snapshot ─────────────────────────
	const correctedFields = [];

	if (sale.aiExtractedJson) {
		const ai = JSON.parse(sale.aiExtractedJson);

		for (const field of TEXT_FIELDS) {
			const incoming = body[field] ?? '';
			const original = ai[field] ?? '';
			if (String(incoming).trim() !== String(original).trim()) {
				correctedFields.push(field);
			}
		}

		const incomingDate = saleDate ?? '';
		const originalDate = ai.date ? String(ai.date).slice(0, 10) : '';
		if (incomingDate !== originalDate) correctedFields.push('saleDate');

		/** @param {any} li */
		const normaliseItem = (li) => ({
			description: li.description,
			type: li.type,
			unitsSold: li.unitsSold,
			buyPrice: li.buyPrice,
			sellPrice: li.sellPrice,
			total: li.total
		});
		const incomingItems = (lineItems ?? []).map(normaliseItem);
		const originalItems = (ai.lineItems ?? []).map(normaliseItem);
		if (JSON.stringify(incomingItems) !== JSON.stringify(originalItems)) {
			correctedFields.push('lineItems');
		}

		const incomingTagsSorted = [...(tags ?? [])].sort().join(',');
		const originalTagsSorted = [...(ai.tags ?? [])].sort().join(',');
		if (incomingTagsSorted !== originalTagsSorted) correctedFields.push('tags');
	}

	// ── Upsert line items ────────────────────────────────────────────────
	logger.info(LOG, 'deleting_existing_line_items', { saleId: params.id });
	await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, params.id));

	if (lineItems.length) {
		const items = lineItems.map((/** @type {any} */ li, /** @type {number} */ i) => ({
			id:          crypto.randomUUID(),
			saleId:      params.id,
			description: li.description || null,
			type:        li.type        || null,
			unitsSold:   li.unitsSold   || null,
			buyPrice:    li.buyPrice    || null,
			sellPrice:   li.sellPrice   || null,
			margin:      li.margin      || null,
			total:       li.total       || null,
			totalCost:   li.totalCost   || null,
			sortOrder:   i
		}));
		logger.info(LOG, 'inserting_line_items', { saleId: params.id, count: items.length });
		try {
			await batchInsert(db, schema.saleLineItem, items);
		} catch (err) {
			logger.error(LOG, 'line_items_insert_failed', { saleId: params.id, count: items.length, err: String(err) });
			error(500, 'Failed to save line items');
		}
	}

	// ── Patch sale row ────────────────────────────────────────────────
	const parsedDate = saleDate ? new Date(saleDate) : null;

	await db.update(schema.sale).set({
		documentTitle:   documentTitle  || null,
		saleDate:        parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null,
		totalRevenue:    totalRevenue   || null,
		totalCost:       totalCost      || null,
		totalMargin:     totalMargin    || null,
		currency:        currency       || null,
		category:        category       || null,
		notes:           notes          || null,
		tags:            JSON.stringify(Array.isArray(tags) ? tags : []),
		lineItemsJson:   JSON.stringify(lineItems),
		correctedFields: JSON.stringify(correctedFields)
	}).where(eq(schema.sale.id, params.id));

	return json({ success: true, correctedFields });
}
