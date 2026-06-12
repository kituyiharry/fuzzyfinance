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

/**
 * Bulk-replace a receipt's line items. The refinement editor's
 * "decompose" flow posts here with the whole new list.
 *
 * Rules:
 *   - All incoming rows are written; existing rows are deleted first.
 *   - On externally-sourced receipts, `kind='tax'` lines from the
 *     previous state must round-trip unchanged (amount-locked). Standard
 *     lines may be freely added / re-amounted / re-categorised.
 *   - The sum of incoming line totals must equal the receipt's header
 *     total (within 1¢), so a "decomposition" stays consistent.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function PUT({ params, locals, request, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));
	if (!receipt) error(404, 'Receipt not found');

	/** @type {{ lineItems: Array<{ id?: string|null, description?: string|null, qty?: string|null, unitPrice?: string|null, total: string|null, primaryCategory?: string|null, secondaryCategory?: string|null, kind?: 'standard'|'tax', aiSuggested?: boolean }> }} */
	const body = await request.json();
	const incoming = Array.isArray(body.lineItems) ? body.lineItems : [];

	for (const li of incoming) {
		if (li.kind && li.kind !== 'standard' && li.kind !== 'tax') {
			error(400, `Unknown line-item kind: ${li.kind}`);
		}
	}

	// Capture the prior state once — we need the row IDs (for the vector
	// purge below) AND the sum of existing tax lines (for the tax-amount
	// lock below).
	const existing = await db.select()
		.from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receipt.id));
	const previous = existing.map((p) => ({ id: p.id }));

	// Tax-line lock for externally-sourced rows. Canonical tax amount is:
	//   - the receipt's header `tax` field (Xero's TotalTax), if non-zero;
	//   - else the sum of existing `kind='tax'` line items (so docs that
	//     already have a tax row, but lack a header tax field, still lock
	//     to whatever is in the line-items table).
	// Sums just have to match — the user may freely re-distribute.
	if (isExternallySourced(receipt.externalSource)) {
		const existingTax = existing.filter((li) => li.kind === 'tax');
		const headerTax = Number(receipt.tax);
		let existingTaxSum = 0;
		for (const li of existingTax) {
			const n = Number(li.total);
			if (Number.isFinite(n)) existingTaxSum += n;
		}
		const expectedTaxTotal = Number.isFinite(headerTax) && headerTax > 0
			? headerTax
			: existingTaxSum;
		const taxCheck = checkTaxAmountUntouched(
			incoming.map((li) => ({ id: li.id ?? null, total: li.total ?? null, kind: li.kind ?? 'standard' })),
			expectedTaxTotal,
			existingTax
		);
		if (!taxCheck.ok) error(409, taxCheck.message);
	}

	// Totals must balance against the header total.
	const balance = checkLineItemsBalance(
		incoming.map((li) => ({ total: li.total ?? null, kind: li.kind ?? 'standard' })),
		receipt.total
	);
	if (!balance.ok) error(409, balance.message);

	// Wholesale replace.
	await db.delete(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receipt.id));

	/** @type {Array<typeof schema.receiptLineItem.$inferInsert>} */
	const toInsert = incoming.map((li, idx) => ({
		// Preserve the existing row id when present — keeps Vectorize vector
		// keys stable across edits and makes the by-id checks resilient to
		// repeated saves on the same page load.
		id:                li.id ?? crypto.randomUUID(),
		receiptId:         receipt.id,
		description:       li.description ?? null,
		qty:               li.qty ?? null,
		unitPrice:         li.unitPrice ?? null,
		total:             li.total ?? null,
		unitSize:          null,
		unitType:          null,
		primaryCategory:   li.primaryCategory ?? null,
		secondaryCategory: li.secondaryCategory ?? null,
		sortOrder:         idx,
		kind:              li.kind ?? 'standard',
		aiSuggested:       li.aiSuggested === true
	}));

	if (toInsert.length > 0) {
		await db.insert(schema.receiptLineItem).values(toInsert);
	}

	// Refresh the denormalised line-items JSON cache on the receipt so
	// downstream sync flows (Google Sheets / OneDrive) see the new shape.
	// This is the ONLY field this endpoint may touch on the receipt header.
	await db.update(schema.receipt)
		.set({ lineItemsJson: JSON.stringify(toInsert.map((r) => ({
			description:       r.description,
			qty:               r.qty,
			unitPrice:         r.unitPrice,
			total:             r.total,
			primaryCategory:   r.primaryCategory,
			secondaryCategory: r.secondaryCategory,
			kind:              r.kind
		}))) })
		.where(eq(schema.receipt.id, receipt.id));

	// Re-train + re-index in the background — the user's save shouldn't wait.
	const env = platform?.env;
	if (env) {
		const work = (async () => {
			try {
				if (previous.length > 0) await deleteLineItemVectors(env, previous.map((p) => p.id));
				const userConfirmed = toInsert.filter((r) => !r.aiSuggested && r.kind === 'standard');
				if (userConfirmed.length > 0) {
					await indexLineItems(env, {
						userId:      locals.user.id,
						workspaceId: receipt.workspaceId,
						parentKind:  'receipt',
						merchant:    receipt.merchantName
					}, userConfirmed.map((r) => ({
						id:                r.id ?? '',
						description:       r.description ?? null,
						primaryCategory:   r.primaryCategory ?? null,
						secondaryCategory: r.secondaryCategory ?? null,
						kind:              r.kind ?? 'standard'
					})));
				}
			} catch (/** @type {any} */ err) {
				console.warn('[receipts/line-items] index update failed:', err?.message ?? err);
			}
		})();
		platform?.ctx?.waitUntil?.(work);
	}

	return json({ ok: true, count: incoming.length });
}
