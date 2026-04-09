import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, inArray } from 'drizzle-orm';

const CSV_HEADERS = [
	'Receipt ID', 'Merchant', 'Receipt Date', 'Category', 'Tags',
	'Receipt Total', 'Currency', 'Line Item Description', 'Qty', 'Unit Price', 'Line Item Total'
];

/** @param {unknown} val */
function cell(val) {
	const str = String(val ?? '');
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** @param {string[]} row */
const csvRow = (row) => row.map(cell).join(',');

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

	// Load receipts — verify all belong to this user
	const receipts = await db.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, uid),
			inArray(schema.receipt.id, receiptIds)
		));

	if (receipts.length === 0) error(404, 'No matching receipts found');

	// Load line items for all receipts
	const lineItems = await db.select()
		.from(schema.receiptLineItem)
		.where(inArray(schema.receiptLineItem.receiptId, receipts.map(r => r.id)));

	// Group line items by receipt ID
	/** @type {Map<string, typeof lineItems>} */
	const itemsByReceipt = new Map();
	for (const li of lineItems) {
		const group = itemsByReceipt.get(li.receiptId) ?? [];
		group.push(li);
		itemsByReceipt.set(li.receiptId, group);
	}

	// Build CSV rows
	const rows = [csvRow(CSV_HEADERS)];

	for (const r of receipts) {
		const items = (itemsByReceipt.get(r.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
		const tags = (() => { try { return JSON.parse(r.tags ?? '[]').join('; '); } catch { return ''; } })();
		const receiptDate = r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 10) : '';

		if (items.length === 0) {
			// One row for the receipt with no line items
			rows.push(csvRow([
				r.id,
				r.merchantName ?? '',
				receiptDate,
				r.category ?? '',
				tags,
				r.total ?? '',
				r.currency ?? '',
				'', '', '', ''
			]));
		} else {
			for (const li of items) {
				rows.push(csvRow([
					r.id,
					r.merchantName ?? '',
					receiptDate,
					r.category ?? '',
					tags,
					r.total ?? '',
					r.currency ?? '',
					li.description ?? '',
					li.qty ?? '',
					li.unitPrice ?? '',
					li.total ?? ''
				]));
			}
		}
	}

	const csvData = rows.join('\n');
	const rowCount = rows.length - 1; // exclude header
	const dateStr = new Date().toISOString().slice(0, 10);
	const fileName = `fuzzyfinance_export_${dateStr}_${receipts.length}receipts.csv`;

	const [exported] = await db.insert(schema.receiptExport).values({
		id: crypto.randomUUID(),
		userId: uid,
		fileName,
		receiptCount: receipts.length,
		rowCount,
		csvData,
		receiptIds: JSON.stringify(receipts.map(r => r.id)),
	}).returning({ id: schema.receiptExport.id });

	return json({ id: exported.id, fileName, receiptCount: receipts.length, rowCount });
}
