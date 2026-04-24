import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';
import { processSale } from '$lib/server/sales-processor';
import { commitSale } from '$lib/server/sales-committer';

const RETRYABLE_STATUSES = new Set(['complete_no_sync', 'failed']);

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env) error(503, 'Platform bindings unavailable');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');

	if (!RETRYABLE_STATUSES.has(sale.status ?? '')) {
		error(409, `Sale cannot be retried from status: ${sale.status}`);
	}

	await db
		.update(schema.sale)
		.set({ status: sale.status === 'complete_no_sync' ? 'staged' : 'pending', errorMessage: null })
		.where(eq(schema.sale.id, sale.id));

	if (sale.status === 'complete_no_sync') {
		platform.ctx.waitUntil(commitSale(platform.env, sale.id));
	} else {
		platform.ctx.waitUntil(processSale(platform.env, sale.id));
	}

	return json({ queued: true });
}
