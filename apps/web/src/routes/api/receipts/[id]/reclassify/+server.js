import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { classifyLineItems } from '$lib/server/gemini';
import { normalizeUnitType } from '$lib/server/unit-normalizer';
import { logger } from '$lib/server/logger';

const LOG = '[receipts/reclassify]';

/**
 * Re-categorise every line item on a receipt by sending the existing
 * descriptions back through Gemini. Used to backfill records added
 * before the taxonomy existed.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals }) {
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
	if (lineItems.length === 0) {
		return json({ success: true, updated: 0, message: 'No line items to classify' });
	}

	lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

	let classifications;
	try {
		classifications = await classifyLineItems(
			lineItems.map((li) => ({
				description: li.description ?? '',
				unitSize:    li.unitSize    ?? '',
				unitType:    li.unitType    ?? '',
			})),
			{ documentCategory: receipt.category ?? undefined },
		);
	} catch (/** @type {any} */ e) {
		logger.error(LOG, 'gemini_failed', { receiptId: params.id, err: String(e?.message ?? e) });
		if (e?.code === 'RATE_LIMITED') error(429, e.message);
		error(502, `Reclassification failed: ${e?.message ?? 'unknown error'}`);
	}

	// Build index → classification map, then update each line item in place.
	const byIndex = new Map(classifications.map((c) => [c.index, c]));
	let updated = 0;
	for (let i = 0; i < lineItems.length; i++) {
		const cls = byIndex.get(i);
		if (!cls) continue;
		const primary   = cls.primaryCategory === 'Other' ? null : (cls.primaryCategory || null);
		const secondary = (cls.secondaryCategory || '').trim() || null;
		const unitSize  = (cls.unitSize || '').trim() || null;
		const unitType  = normalizeUnitType(cls.unitType) || null;
		await db
			.update(schema.receiptLineItem)
			.set({ primaryCategory: primary, secondaryCategory: secondary, unitSize, unitType })
			.where(eq(schema.receiptLineItem.id, lineItems[i].id));
		updated++;
	}

	logger.info(LOG, 'reclassified', { receiptId: params.id, updated });
	return json({ success: true, updated });
}
