import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

const STUCK_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [receipt] = await db
		.select({
			id:           schema.receipt.id,
			status:       schema.receipt.status,
			errorMessage: schema.receipt.errorMessage,
			merchantName: schema.receipt.merchantName,
			total:        schema.receipt.total,
			currency:     schema.receipt.currency,
			duplicateOf:  schema.receipt.duplicateOf,
			updatedAt:    schema.receipt.updatedAt
		})
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	// Auto-heal stuck processing rows
	if (receipt.status === 'processing') {
		const age = Date.now() - (receipt.updatedAt?.getTime() ?? 0);
		if (age > STUCK_PROCESSING_MS) {
			const msg = 'Processing timed out. Please re-upload this receipt.';
			await db.update(schema.receipt)
				.set({ status: 'failed', errorMessage: msg })
				.where(eq(schema.receipt.id, params.id));
			return json({ ...receipt, status: 'failed', errorMessage: msg });
		}
	}

	return json(receipt);
}
