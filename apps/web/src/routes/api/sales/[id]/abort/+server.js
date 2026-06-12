import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { deleteSaleVector } from '$lib/server/vectorize';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');
	//if (sale.status !== 'staged') error(409, 'Only staged sales can be aborted');

	// Delete R2 object
	if (sale.r2Key && platform?.env?.fuzzyfinance_receipts) {
		try {
			await platform.env.fuzzyfinance_receipts.delete(sale.r2Key);
		} catch {
			// Non-fatal
		}
	}

	// Delete vector index entry
	if (sale.vectorId && platform?.env?.VECTORIZE) {
		try {
			await deleteSaleVector(platform.env, sale.id);
		} catch {
			// Non-fatal
		}
	}

	// Delete sale row (line items cascade via FK)
	await db
		.delete(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	return json({ success: true });
}
