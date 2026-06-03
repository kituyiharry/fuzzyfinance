import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, inArray } from 'drizzle-orm';
import { buildReceiptExportCsv } from '$lib/server/receipt-csv';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await request.json();
	const { receiptIds } = body;

	if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
		error(400, 'receiptIds must be a non-empty array');
	}
	if (receiptIds.length > 500) error(400, 'Maximum 500 receipts per export');

	const uid = locals.user.id;

	// Load receipts — verify all belong to this user and active workspace
	const receipts = await db.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, uid),
			...(locals.workspaceId ? [eq(schema.receipt.workspaceId, locals.workspaceId)] : []),
			inArray(schema.receipt.id, receiptIds)
		));

	if (receipts.length === 0) error(404, 'No matching receipts found');

	const lineItems = await db.select()
		.from(schema.receiptLineItem)
		.where(inArray(schema.receiptLineItem.receiptId, receipts.map(r => r.id)));

	const { csv: csvData, rowCount } = buildReceiptExportCsv(receipts, lineItems);
	const dateStr = new Date().toISOString().slice(0, 10);
	const fileName = `fuzzyfinance_export_${dateStr}_${receipts.length}receipts.csv`;

	const [exported] = await db.insert(schema.receiptExport).values({
		id:           crypto.randomUUID(),
		userId:       uid,
		workspaceId:  locals.workspaceId ?? null,
		fileName,
		receiptCount: receipts.length,
		rowCount,
		csvData,
		receiptIds:   JSON.stringify(receipts.map(r => r.id)),
	}).returning({ id: schema.receiptExport.id });

	return json({ id: exported.id, fileName, receiptCount: receipts.length, rowCount });
}
