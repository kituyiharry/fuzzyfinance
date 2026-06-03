import { error, json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { requireScope } from '$lib/server/api-auth';

/**
 * GET /api/v1/receipts/:id — full receipt + line items.
 *
 * Scope required: receipts.read
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET(event) {
	requireScope(event, 'receipts.read');

	// @ts-ignore — guaranteed by requireScope
	const userId = event.locals.user.id;
	const id = event.params.id;

	const [receipt] = await db
		.select({
			id:            schema.receipt.id,
			merchant:      schema.receipt.merchantName,
			receiptDate:   schema.receipt.receiptDate,
			total:         schema.receipt.total,
			subtotal:      schema.receipt.subtotal,
			tax:           schema.receipt.tax,
			tip:           schema.receipt.tip,
			currency:      schema.receipt.currency,
			paymentMethod: schema.receipt.paymentMethod,
			receiptNumber: schema.receipt.receiptNumber,
			invoiceNumber: schema.receipt.invoiceNumber,
			category:      schema.receipt.category,
			notes:         schema.receipt.notes,
			tags:          schema.receipt.tags,
			createdAt:     schema.receipt.createdAt,
		})
		.from(schema.receipt)
		.where(and(eq(schema.receipt.id, id), eq(schema.receipt.userId, userId)));

	if (!receipt) error(404, 'Receipt not found');

	const lineItems = await db
		.select({
			description:       schema.receiptLineItem.description,
			qty:               schema.receiptLineItem.qty,
			unitPrice:         schema.receiptLineItem.unitPrice,
			total:             schema.receiptLineItem.total,
			unitSize:          schema.receiptLineItem.unitSize,
			unitType:          schema.receiptLineItem.unitType,
			primaryCategory:   schema.receiptLineItem.primaryCategory,
			secondaryCategory: schema.receiptLineItem.secondaryCategory,
		})
		.from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, id))
		.orderBy(asc(schema.receiptLineItem.sortOrder));

	let tags = [];
	try { tags = JSON.parse(receipt.tags ?? '[]'); } catch { /* ignore */ }

	return json({ ...receipt, tags, lineItems });
}
