import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
	if (!locals.user) redirect(302, '/');

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

	return { sale, lineItems };
}
