import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { commitSale } from '$lib/server/sales-committer';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');
	if (sale.status !== 'staged') error(409, 'Only staged sales can be committed');
	if (!platform?.env) error(503, 'Platform bindings unavailable');

	platform.ctx.waitUntil(commitSale(platform.env, sale.id));

	return json({ queued: true });
}
