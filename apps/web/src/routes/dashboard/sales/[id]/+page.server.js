// @ts-nocheck
import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, asc } from 'drizzle-orm';
import categories from '$lib/server/categories.json';
import { UNIT_TYPES } from '$lib/server/unit-normalizer';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
	if (!locals.user) redirect(302, '/');

	const [sale] = await db.select().from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));
	if (!sale) error(404, 'Sale not found');

	let baselineCurrency = 'AUD';
	const wsId = sale.workspaceId ?? locals.workspaceId ?? null;
	if (wsId) {
		const [ws] = await db.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, wsId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	const lineItems = await db.select().from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, sale.id));
	lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

	const [receivableRow] = await db.select().from(schema.receivable)
		.where(eq(schema.receivable.saleId, sale.id));

	let receivable = null;
	if (receivableRow) {
		const updates = await db.select().from(schema.receivableUpdate)
			.where(eq(schema.receivableUpdate.receivableId, receivableRow.id))
			.orderBy(asc(schema.receivableUpdate.createdAt));
		receivable = { ...receivableRow, updates };
	}

	return { sale, lineItems, receivable, categories, unitTypes: UNIT_TYPES, baselineCurrency };
}
