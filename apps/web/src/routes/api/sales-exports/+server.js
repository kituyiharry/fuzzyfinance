import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, inArray } from 'drizzle-orm';

const CSV_HEADERS = [
	'Sale ID', 'Sale Date', 'Uploaded At', 'Category', 'Tags',
	'Total Revenue', 'Total Cost', 'Total Margin', 'Currency',
	'Line Item Description', 'Type', 'Units Sold', 'Buy Price', 'Sell Price',
	'Margin %', 'Line Item Total', 'Line Item Total Cost',
	'Unit Size', 'Unit Type', 'Primary Category', 'Secondary Category'
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
	const { saleIds } = body;

	if (!Array.isArray(saleIds) || saleIds.length === 0) {
		error(400, 'saleIds must be a non-empty array');
	}
	if (saleIds.length > 500) error(400, 'Maximum 500 sales per export');

	const uid = locals.user.id;

	const sales = await db.select()
		.from(schema.sale)
		.where(and(
			eq(schema.sale.userId, uid),
			...(locals.workspaceId ? [eq(schema.sale.workspaceId, locals.workspaceId)] : []),
			inArray(schema.sale.id, saleIds)
		));

	if (sales.length === 0) error(404, 'No matching sales found');

	const lineItems = await db.select()
		.from(schema.saleLineItem)
		.where(inArray(schema.saleLineItem.saleId, sales.map(s => s.id)));

	/** @type {Map<string, typeof lineItems>} */
	const itemsBySale = new Map();
	for (const li of lineItems) {
		const group = itemsBySale.get(li.saleId) ?? [];
		group.push(li);
		itemsBySale.set(li.saleId, group);
	}

	const rows = [csvRow(CSV_HEADERS)];

	for (const s of sales) {
		const items = (itemsBySale.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
		const tags      = (() => { try { return JSON.parse(s.tags ?? '[]').join('; '); } catch { return ''; } })();
		const saleDate  = s.saleDate  ? new Date(s.saleDate).toISOString().slice(0, 10) : '';
		const uploadedAt = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '';

		/** @param {typeof lineItems[0] | null} li */
		const buildRow = (li) => [
			s.id,
			saleDate,
			uploadedAt,
			s.category       ?? '',
			tags,
			s.totalRevenue   ?? '',
			s.totalCost      ?? '',
			s.totalMargin    ?? '',
			s.currency       ?? '',
			li?.description  ?? '',
			li?.type         ?? '',
			li?.unitsSold    ?? '',
			li?.buyPrice     ?? '',
			li?.sellPrice    ?? '',
			li?.margin       ?? '',
			li?.total        ?? '',
			li?.totalCost    ?? '',
			li?.unitSize     ?? '',
			li?.unitType     ?? '',
			li?.primaryCategory   ?? '',
			li?.secondaryCategory ?? '',
		];

		if (items.length === 0) {
			rows.push(csvRow(buildRow(null)));
		} else {
			for (const li of items) {
				rows.push(csvRow(buildRow(li)));
			}
		}
	}

	const csvData   = rows.join('\n');
	const rowCount  = rows.length - 1;
	const dateStr   = new Date().toISOString().slice(0, 10);
	const fileName  = `fuzzyfinance_sales_export_${dateStr}_${sales.length}sales.csv`;

	const [exported] = await db.insert(schema.saleExport).values({
		id:          crypto.randomUUID(),
		userId:      uid,
		workspaceId: locals.workspaceId ?? null,
		fileName,
		saleCount:   sales.length,
		rowCount,
		csvData,
		saleIds:     JSON.stringify(sales.map(s => s.id)),
	}).returning({ id: schema.saleExport.id });

	return json({ id: exported.id, fileName, saleCount: sales.length, rowCount }, { status: 201 });
}
