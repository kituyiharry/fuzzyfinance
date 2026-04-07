import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { deleteReceiptVector } from '$lib/server/vectorize';

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
