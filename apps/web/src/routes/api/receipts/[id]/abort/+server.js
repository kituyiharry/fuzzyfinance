import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { deleteReceiptVector } from '$lib/server/vectorize';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');
	if (receipt.status !== 'staged') error(409, 'Only staged receipts can be aborted');

	// Delete R2 object
	if (receipt.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(receipt.r2Key);
		} catch {
			// Non-fatal
		}
	}

	// Delete vector index entry
	if (receipt.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteReceiptVector(platform.env, receipt.id);
		} catch {
			// Non-fatal
		}
	}

	// Delete receipt row (line items cascade via FK)
	await db
		.delete(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	return json({ success: true });
}
