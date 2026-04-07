import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { deleteReceiptVector } from '$lib/server/vectorize';

const TEXT_FIELDS = ['merchantName', 'total', 'subtotal', 'tax', 'tip', 'currency', 'paymentMethod', 'category', 'notes'];

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	const lineItems = await db
		.select()
		.from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receipt.id));

	lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

	return json({ ...receipt, lineItems });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	// Delete from R2 if still present
	if (receipt.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(receipt.r2Key);
		} catch {
			// Non-fatal
		}
	}

	// Delete vector if indexed
	if (receipt.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteReceiptVector(platform.env, receipt.id);
		} catch {
			// Non-fatal
		}
	}

	await db
		.delete(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');
	if (receipt.status !== 'staged') error(409, 'Only staged receipts can be edited');

	const body = await request.json();
	const { merchantName, receiptDate, total, subtotal, tax, tip, currency, paymentMethod, category, notes, lineItems = [] } = body;

	// ── Compute corrected fields vs AI snapshot ─────────────────────────
	const correctedFields = [];

	if (receipt.aiExtractedJson) {
		const ai = JSON.parse(receipt.aiExtractedJson);

		for (const field of TEXT_FIELDS) {
			const incoming = body[field] ?? '';
			const original = ai[field] ?? '';
			if (String(incoming).trim() !== String(original).trim()) {
				correctedFields.push(field);
			}
		}

		// Compare receiptDate as YYYY-MM-DD strings
		const incomingDate = receiptDate ?? '';
		const originalDate = ai.receiptDate ? String(ai.receiptDate).slice(0, 10) : '';
		if (incomingDate !== originalDate) correctedFields.push('receiptDate');

		// Compare line items by JSON structure (strip DB-only fields like id, sortOrder)
		/** @param {{ description?: string; qty?: string; unitPrice?: string; total?: string }} li */
		const normaliseItem = (li) => ({ description: li.description, qty: li.qty, unitPrice: li.unitPrice, total: li.total });
		const incomingItems = (lineItems ?? []).map(normaliseItem);
		const originalItems = (ai.lineItems ?? []).map(normaliseItem);
		if (JSON.stringify(incomingItems) !== JSON.stringify(originalItems)) {
			correctedFields.push('lineItems');
		}
	}

	// ── Upsert line items ────────────────────────────────────────────────
	await db.delete(schema.receiptLineItem).where(eq(schema.receiptLineItem.receiptId, params.id));

	if (lineItems.length) {
		await db.insert(schema.receiptLineItem).values(
			lineItems.map((/** @type {any} */ li, /** @type {number} */ i) => ({
				id:          crypto.randomUUID(),
				receiptId:   params.id,
				description: li.description || null,
				qty:         li.qty         || null,
				unitPrice:   li.unitPrice   || null,
				total:       li.total       || null,
				sortOrder:   i
			}))
		);
	}

	// ── Patch receipt row ────────────────────────────────────────────────
	const parsedDate = receiptDate ? new Date(receiptDate) : null;

	await db.update(schema.receipt).set({
		merchantName:   merchantName   || null,
		receiptDate:    parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null,
		total:          total          || null,
		subtotal:       subtotal       || null,
		tax:            tax            || null,
		tip:            tip            || null,
		currency:       currency       || null,
		paymentMethod:  paymentMethod  || null,
		category:       category       || null,
		notes:          notes          || null,
		lineItemsJson:  JSON.stringify(lineItems),
		correctedFields: JSON.stringify(correctedFields)
	}).where(eq(schema.receipt.id, params.id));

	return json({ success: true, correctedFields });
}
