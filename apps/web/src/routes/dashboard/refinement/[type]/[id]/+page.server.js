import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, asc, eq } from 'drizzle-orm';
import { loadCategoriesForWorkspace } from '$lib/server/categories';
import { isExternallySourced } from '$lib/server/refinement';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
	if (!locals.user) redirect(302, '/');

	const type = params.type;
	if (type !== 'receipt' && type !== 'sale') error(404, 'Unknown document type');

	let workspace = null;
	if (locals.workspaceId) {
		const [ws] = await db.select()
			.from(schema.workspace)
			.where(eq(schema.workspace.id, locals.workspaceId));
		workspace = ws ?? null;
	}
	const categories = loadCategoriesForWorkspace(workspace);

	if (type === 'receipt') {
		const [row] = await db.select()
			.from(schema.receipt)
			.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));
		if (!row) error(404, 'Receipt not found');
		const lineItems = await db.select()
			.from(schema.receiptLineItem)
			.where(eq(schema.receiptLineItem.receiptId, row.id))
			.orderBy(asc(schema.receiptLineItem.sortOrder));
		return {
			type:       /** @type {const} */ ('receipt'),
			row,
            tax: row.tax,
			lineItems,
			categories,
			workspaceId: locals.workspaceId,
			locked:     isExternallySourced(row.externalSource)
		};
	}

	const [row] = await db.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));
	if (!row) error(404, 'Sale not found');
	const lineItems = await db.select()
		.from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, row.id))
		.orderBy(asc(schema.saleLineItem.sortOrder));
	return {
		type:        /** @type {const} */ ('sale'),
		row,
        tax: (row.tax ?? ""),
		lineItems,
		categories,
		workspaceId: locals.workspaceId,
		locked:      isExternallySourced(row.externalSource)
	};
}
