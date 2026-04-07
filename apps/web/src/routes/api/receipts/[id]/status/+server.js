import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

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
			currency:     schema.receipt.currency
		})
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));

	if (!receipt) error(404, 'Receipt not found');

	return json(receipt);
}
