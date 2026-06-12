import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { deleteReceiptVector } from '$lib/server/vectorize';
import { isExternallySourced } from '$lib/server/refinement';

/**
 * Receipt resource endpoint.
 *
 *   GET     — full row + sorted line items.
 *   PATCH   — TRUE partial update. Only fields explicitly present in the
 *             request body are updated. Missing fields are left untouched
 *             (no silent null-out, which was a destructive footgun in the
 *             previous implementation that wiped name/date/amounts when
 *             callers sent { category } only).
 *   DELETE  — row + R2 object + Vectorize entry.
 *
 * Line items are NEVER touched by this endpoint. They have their own
 * endpoint at `./line-items` with its own balance + tax-lock semantics.
 *
 * Externally-sourced rows (Xero / QB / MYOB / FreshBooks) lock the
 * upstream-canonical header fields — caller gets a 409 if they try to
 * patch one of those. Categorisation + free-form metadata stay editable.
 */

/** Fields the user may freely edit on any receipt, regardless of source. */
const FREE_FIELDS = new Set([
	'category',
	'notes',
	'merchantName',
	'paymentMethod',
	'receiptNumber',
	'invoiceNumber',
	'tags'
]);

/** Fields that hold upstream-canonical data on synced rows — patchable
 *  only when the row is locally-sourced. */
const LOCKED_WHEN_EXTERNAL = new Set([
	'total',
	'subtotal',
	'tax',
	'tip',
	'currency',
	'receiptDate'
]);

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
export async function PATCH({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));
	if (!receipt) error(404, 'Receipt not found');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Body must be a JSON object');
	}

	const external = isExternallySourced(receipt.externalSource);

	/** @type {Record<string, unknown>} */
	const patch = {};

	for (const [key, value] of Object.entries(body)) {
		if (FREE_FIELDS.has(key)) {
			if (key === 'tags') {
				patch.tags = JSON.stringify(Array.isArray(value) ? value : []);
			} else {
				// `null` clears, string sets, blank-string normalises to null.
				patch[key] = value === '' ? null : value;
			}
			continue;
		}

		if (LOCKED_WHEN_EXTERNAL.has(key)) {
			if (external) {
				error(409, `Field "${key}" is locked on rows synced from ${receipt.externalSource}`);
			}
			if (key === 'receiptDate') {
				const d = value ? new Date(/** @type {any} */ (value)) : null;
				patch.receiptDate = d && !isNaN(d.getTime()) ? d : null;
			} else {
				patch[key] = value === '' ? null : value;
			}
			continue;
		}

		// Unknown key — reject loudly. Better than silent acceptance with
		// the risk of typos shadowing real fields.
		error(400, `Field "${key}" is not editable via PATCH`);
	}

	if (Object.keys(patch).length === 0) {
		return json({ ok: true, updated: 0 });
	}

	await db.update(schema.receipt).set(patch).where(eq(schema.receipt.id, params.id));

	return json({ ok: true, updated: Object.keys(patch).length, fields: Object.keys(patch) });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	if (receipt.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(receipt.r2Key);
		} catch {
			// Non-fatal — orphaned R2 object is acceptable.
		}
	}

	if (receipt.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteReceiptVector(platform.env, receipt.id);
		} catch {
			// Non-fatal.
		}
	}

	await db
		.delete(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	return json({ ok: true });
}
