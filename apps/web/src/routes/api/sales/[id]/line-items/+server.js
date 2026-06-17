import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import {
	isExternallySourced,
	checkLineItemsBalance,
	checkTaxAmountUntouched
} from '$lib/server/refinement';
import { indexLineItems, deleteLineItemVectors } from '$lib/server/vectorize';
import { normalizeUnitType } from '$lib/server/unit-normalizer';

/**
 * Bulk-replace a sale's line items. Mirror of the receipt version —
 * balances against `sale.totalRevenue` instead of `receipt.total`.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function PUT({ params, locals, request, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));
	if (!sale) error(404, 'Sale not found');

	/** @type {{ lineItems: Array<{ id?: string|null, description?: string|null, unitsSold?: string|null, sellPrice?: string|null, total: string|null, primaryCategory?: string|null, secondaryCategory?: string|null, kind?: 'standard'|'tax', aiSuggested?: boolean, unitSize?: string|null, unitType?: string|null }> }} */
	const body = await request.json();
	const incoming = Array.isArray(body.lineItems) ? body.lineItems : [];

	for (const li of incoming) {
		if (li.kind && li.kind !== 'standard' && li.kind !== 'tax') {
			error(400, `Unknown line-item kind: ${li.kind}`);
		}
	}

	// Capture prior state once — used for both the tax-lock check and the
	// vector-purge step below.
	const existing = await db.select()
		.from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, sale.id));
	const previous = existing.map((p) => ({ id: p.id }));

	// Sales have no header tax field in the schema, so the canonical tax
	// amount is the sum of existing `kind='tax'` line items at the moment
	// of save. The fast path passes through unchanged tax rows
	// (id + total match) so unrelated edits don't false-positive.
	if (isExternallySourced(sale.externalSource)) {
		const existingTax = existing.filter((li) => li.kind === 'tax');
		let expectedTaxTotal = 0;
		for (const li of existingTax) {
			const n = Number(li.total);
			if (Number.isFinite(n)) expectedTaxTotal += n;
		}
		const taxCheck = checkTaxAmountUntouched(
			incoming.map((li) => ({ id: li.id ?? null, total: li.total ?? null, kind: li.kind ?? 'standard' })),
			expectedTaxTotal,
			existingTax
		);
		if (!taxCheck.ok) error(409, taxCheck.message);
	}
    console.log([
        "checkLineItemsBalance for sales",
        incoming,
        sale
    ]);
	const balance = checkLineItemsBalance(
		incoming.map((li) => ({ total: li.total ?? null, kind: li.kind ?? 'standard' })),
		sale.totalRevenue
	);
	if (!balance.ok) error(409, balance.message);

	await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, sale.id));

	/** @type {Array<typeof schema.saleLineItem.$inferInsert>} */
	const toInsert = incoming.map((li, idx) => ({
		// Preserve the existing row id when present — keeps Vectorize vector
		// keys stable across edits and makes the by-id checks resilient to
		// repeated saves on the same page load.
		id:                li.id ?? crypto.randomUUID(),
		saleId:            sale.id,
		description:       li.description ?? null,
		type:              null,
		unitsSold:         li.unitsSold ?? null,
		buyPrice:          null,
		sellPrice:         li.sellPrice ?? null,
		margin:            null,
		total:             li.total ?? null,
		totalCost:         null,
		// Unit columns now accepted; type routed through the canonical
		// normaliser so it slots into the dropdown options reliably.
		unitSize:          li.unitSize ? String(li.unitSize).trim() || null : null,
		unitType:          li.unitType ? normalizeUnitType(li.unitType) ?? null : null,
		primaryCategory:   li.primaryCategory ?? null,
		secondaryCategory: li.secondaryCategory ?? null,
		sortOrder:         idx,
		kind:              li.kind ?? 'standard',
		aiSuggested:       li.aiSuggested === true
	}));

	if (toInsert.length > 0) {
		await db.insert(schema.saleLineItem).values(toInsert);
	}

	// Refresh the denormalised line-items JSON cache on the sale so
	// downstream sync flows (Google Sheets / OneDrive) see the new shape.
	// This is the ONLY field this endpoint may touch on the sale header.
	await db.update(schema.sale)
		.set({ lineItemsJson: JSON.stringify(toInsert.map((r) => ({
			description:       r.description,
			unitsSold:         r.unitsSold,
			sellPrice:         r.sellPrice,
			total:             r.total,
			unitSize:          r.unitSize,
			unitType:          r.unitType,
			primaryCategory:   r.primaryCategory,
			secondaryCategory: r.secondaryCategory,
			kind:              r.kind
		}))) })
		.where(eq(schema.sale.id, sale.id));

	const env = platform?.env;
	if (env) {
		const work = (async () => {
			try {
				if (previous.length > 0) await deleteLineItemVectors(env, previous.map((p) => p.id));
				const userConfirmed = toInsert.filter((r) => !r.aiSuggested && r.kind === 'standard');
				if (userConfirmed.length > 0) {
					await indexLineItems(env, {
						userId:      locals.user.id,
						workspaceId: sale.workspaceId,
						parentKind:  'sale',
						merchant:    sale.documentTitle
					}, userConfirmed.map((r) => ({
						id:                r.id ?? '',
						description:       r.description ?? null,
						primaryCategory:   r.primaryCategory ?? null,
						secondaryCategory: r.secondaryCategory ?? null,
						kind:              r.kind ?? 'standard'
					})));
				}
			} catch (/** @type {any} */ err) {
				console.warn('[sales/line-items] index update failed:', err?.message ?? err);
			}
		})();
		platform?.ctx?.waitUntil?.(work);
	}

	return json({ ok: true, count: incoming.length });
}
