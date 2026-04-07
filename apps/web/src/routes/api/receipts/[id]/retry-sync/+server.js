import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { processReceipt } from '$lib/server/receipt-processor';

const RETRYABLE_STATUSES = new Set(['complete_no_sync', 'failed']);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env) error(503, 'Platform bindings unavailable');

	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	if (!RETRYABLE_STATUSES.has(receipt.status ?? '')) {
		error(409, `Receipt cannot be retried from status: ${receipt.status}`);
	}

	// Reset to pending so the processor re-runs the full pipeline
	await db
		.update(schema.receipt)
		.set({ status: 'pending', errorMessage: null })
		.where(eq(schema.receipt.id, receipt.id));

	platform.ctx.waitUntil(processReceipt(platform.env, receipt.id));

	return json({ queued: true });
}
