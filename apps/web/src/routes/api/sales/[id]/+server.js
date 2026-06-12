import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { deleteSaleVector } from '$lib/server/vectorize';
import { isExternallySourced } from '$lib/server/refinement';

/**
 * Sale resource endpoint — mirror of /api/receipts/[id]/+server.js.
 *
 *   GET     — full row + sorted line items.
 *   PATCH   — TRUE partial update. Only fields present in the body are
 *             modified; everything else is left untouched.
 *   DELETE  — row + R2 + Vectorize.
 *
 * Line items are owned by `./line-items` and never modified from here.
 *
 * Externally-sourced rows lock the upstream-canonical header amounts
 * and date; the rest stays editable.
 */

/** Fields the user may freely edit on any sale, regardless of source. */
const FREE_FIELDS = new Set([
	'category',
	'notes',
	'documentTitle',
	'tags'
]);

/** Fields that hold upstream-canonical data on synced rows. */
const LOCKED_WHEN_EXTERNAL = new Set([
	'totalRevenue',
	'totalCost',
	'totalMargin',
	'currency',
	'saleDate'
]);

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
export async function PATCH({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));
	if (!sale) error(404, 'Sale not found');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Body must be a JSON object');
	}

	const external = isExternallySourced(sale.externalSource);

	/** @type {Record<string, unknown>} */
	const patch = {};

	for (const [key, value] of Object.entries(body)) {
		if (FREE_FIELDS.has(key)) {
			if (key === 'tags') {
				patch.tags = JSON.stringify(Array.isArray(value) ? value : []);
			} else {
				patch[key] = value === '' ? null : value;
			}
			continue;
		}

		if (LOCKED_WHEN_EXTERNAL.has(key)) {
			if (external) {
				error(409, `Field "${key}" is locked on rows synced from ${sale.externalSource}`);
			}
			if (key === 'saleDate') {
				const d = value ? new Date(/** @type {any} */ (value)) : null;
				patch.saleDate = d && !isNaN(d.getTime()) ? d : null;
			} else {
				patch[key] = value === '' ? null : value;
			}
			continue;
		}

		error(400, `Field "${key}" is not editable via PATCH`);
	}

	if (Object.keys(patch).length === 0) {
		return json({ ok: true, updated: 0 });
	}

	await db.update(schema.sale).set(patch).where(eq(schema.sale.id, params.id));

	return json({ ok: true, updated: Object.keys(patch).length, fields: Object.keys(patch) });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');

	if (sale.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(sale.r2Key);
		} catch {
			// Non-fatal.
		}
	}

	if (sale.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteSaleVector(platform.env, sale.id);
		} catch {
			// Non-fatal.
		}
	}

	await db
		.delete(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	return json({ ok: true });
}
