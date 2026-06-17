import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { buildReceiptExportCsv } from '$lib/server/receipt-csv';
import { buildSaleExportCsv } from '$lib/server/sale-csv';

/**
 * @param {string | null | undefined} s
 */
function parseDate(s) {
	if (!s) return null;
	const d = new Date(`${s}T00:00:00Z`);
	return isNaN(d.getTime()) ? null : d;
}

/**
 * "Save this view" — captures a date range as a pair of saved exports
 * (one expense, one revenue) so the same analysis can be retrieved
 * later from the visualization listing without re-running the live
 * query.
 *
 * Currency filter mirrors the live view: only documents in the
 * workspace's baseline currency are included. Empty sides are
 * skipped — the response payload reports back which sides were saved
 * and which were skipped (and why), so the UI can show a meaningful
 * confirmation.
 *
 * Request body:
 *   { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 *
 * Response:
 *   {
 *     expense: { id, fileName, docCount, rowCount } | { skipped: 'no-docs' | 'all-excluded' },
 *     revenue: { id, fileName, docCount, rowCount } | { skipped: 'no-docs' | 'all-excluded' }
 *   }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Body must be a JSON object');

	const start = parseDate(body.start);
	const end   = parseDate(body.end);
	if (!start || !end || start > end) error(400, 'Invalid date range — end must be on or after start');
	const endInclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);

	const userId = locals.user.id;
	const workspaceId = locals.workspaceId ?? null;

	let baselineCurrency = 'AUD';
	if (workspaceId) {
		const [ws] = await db
			.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, workspaceId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	const dateStr = new Date().toISOString().slice(0, 10);
	const rangeLabel = `${body.start}_${body.end}`;

	const expense = await _saveExpenseSide({ userId, workspaceId, start, endInclusive, baselineCurrency, dateStr, rangeLabel });
	const revenue = await _saveRevenueSide({ userId, workspaceId, start, endInclusive, baselineCurrency, dateStr, rangeLabel });

	return json({ expense, revenue, baselineCurrency, range: { start: body.start, end: body.end } });
}

/**
 * @param {{ userId: string, workspaceId: string|null, start: Date, endInclusive: Date, baselineCurrency: string, dateStr: string, rangeLabel: string }} ctx
 */
async function _saveExpenseSide(ctx) {
	const { userId, workspaceId, start, endInclusive, baselineCurrency, dateStr, rangeLabel } = ctx;
	const wsFilter = workspaceId ? [eq(schema.receipt.workspaceId, workspaceId)] : [];

	const all = await db.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, userId),
			gte(schema.receipt.receiptDate, start),
			lte(schema.receipt.receiptDate, endInclusive),
			...wsFilter,
		));

	const receipts = all.filter((r) => (r.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
	if (all.length === 0)        return { skipped: /** @type {const} */ ('no-docs') };
	if (receipts.length === 0)   return { skipped: /** @type {const} */ ('all-excluded'), excludedCount: all.length };

	const lineItems = await db.select()
		.from(schema.receiptLineItem)
		.where(inArray(schema.receiptLineItem.receiptId, receipts.map((r) => r.id)));

	const { csv, rowCount } = buildReceiptExportCsv(receipts, lineItems);
	const fileName = `fuzzyfinance_export_${dateStr}_expense_${rangeLabel}_${receipts.length}receipts.csv`;

	const [row] = await db.insert(schema.receiptExport).values({
		id:           crypto.randomUUID(),
		userId,
		workspaceId,
		fileName,
		receiptCount: receipts.length,
		rowCount,
		csvData:      csv,
		receiptIds:   JSON.stringify(receipts.map((r) => r.id)),
	}).returning({ id: schema.receiptExport.id });

	return { id: row.id, fileName, docCount: receipts.length, rowCount };
}

/**
 * @param {{ userId: string, workspaceId: string|null, start: Date, endInclusive: Date, baselineCurrency: string, dateStr: string, rangeLabel: string }} ctx
 */
async function _saveRevenueSide(ctx) {
	const { userId, workspaceId, start, endInclusive, baselineCurrency, dateStr, rangeLabel } = ctx;
	const wsFilter = workspaceId ? [eq(schema.sale.workspaceId, workspaceId)] : [];

	const all = await db.select()
		.from(schema.sale)
		.where(and(
			eq(schema.sale.userId, userId),
			gte(schema.sale.saleDate, start),
			lte(schema.sale.saleDate, endInclusive),
			...wsFilter,
		));

	const sales = all.filter((s) => (s.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
	if (all.length === 0)     return { skipped: /** @type {const} */ ('no-docs') };
	if (sales.length === 0)   return { skipped: /** @type {const} */ ('all-excluded'), excludedCount: all.length };

	const lineItems = await db.select()
		.from(schema.saleLineItem)
		.where(inArray(schema.saleLineItem.saleId, sales.map((s) => s.id)));

	const { csv, rowCount } = buildSaleExportCsv(sales, lineItems);
	const fileName = `fuzzyfinance_export_${dateStr}_revenue_${rangeLabel}_${sales.length}sales.csv`;

	const [row] = await db.insert(schema.saleExport).values({
		id:           crypto.randomUUID(),
		userId,
		workspaceId,
		fileName,
		saleCount:    sales.length,
		rowCount,
		csvData:      csv,
		saleIds:      JSON.stringify(sales.map((s) => s.id)),
	}).returning({ id: schema.saleExport.id });

	return { id: row.id, fileName, docCount: sales.length, rowCount };
}
