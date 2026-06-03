import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { classifyLineItems } from '$lib/server/gemini';
import { normalizeUnitType } from '$lib/server/unit-normalizer';
import { logger } from '$lib/server/logger';

const LOG = '[sales/reclassify]';

/**
 * Re-categorise every line item on a sale by sending the existing
 * descriptions back through Gemini.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals }) {
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
				type:        li.type        ?? '',
			})),
			{ documentCategory: sale.category ?? undefined },
		);
	} catch (/** @type {any} */ e) {
		logger.error(LOG, 'gemini_failed', { saleId: params.id, err: String(e?.message ?? e) });
		if (e?.code === 'RATE_LIMITED') error(429, e.message);
		error(502, `Reclassification failed: ${e?.message ?? 'unknown error'}`);
	}

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
			.update(schema.saleLineItem)
			.set({ primaryCategory: primary, secondaryCategory: secondary, unitSize, unitType })
			.where(eq(schema.saleLineItem.id, lineItems[i].id));
		updated++;
	}

	logger.info(LOG, 'reclassified', { saleId: params.id, updated });
	return json({ success: true, updated });
}
