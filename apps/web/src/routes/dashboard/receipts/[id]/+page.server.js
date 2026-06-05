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

	const [receipt] = await db.select().from(schema.receipt)
		.where(and(eq(schema.receipt.id, params.id), eq(schema.receipt.userId, locals.user.id)));
	if (!receipt) error(404, 'Receipt not found');

	let baselineCurrency = 'AUD';
	const wsId = receipt.workspaceId ?? locals.workspaceId ?? null;
	if (wsId) {
		const [ws] = await db.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, wsId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	const lineItems = await db.select().from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receipt.id));
	lineItems.sort((a, b) => a.sortOrder - b.sortOrder);

	const [payableRow] = await db.select().from(schema.payable)
		.where(eq(schema.payable.receiptId, receipt.id));

	let payable = null;
	if (payableRow) {
		const updates = await db.select().from(schema.payableUpdate)
			.where(eq(schema.payableUpdate.payableId, payableRow.id))
			.orderBy(asc(schema.payableUpdate.createdAt));
		payable = { ...payableRow, updates };
	}

	return { receipt, lineItems, payable, categories, unitTypes: UNIT_TYPES, baselineCurrency };
}
