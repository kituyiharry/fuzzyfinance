import { error, redirect } from '@sveltejs/kit';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
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
 * Live alluvial: builds ephemeral exports from receipts AND sales in a
 * date range and asks hedaz to analyse both inline. The result is a pair
 * of per-side bundles ({ alluvial, trendline, meta, errorMessage }) so
 * the page can render expense + revenue side-by-side.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ url, locals, platform }) {
	if (!locals.user) redirect(302, '/');

	let baselineCurrency = 'AUD';
	if (locals.workspaceId) {
		const [ws] = await db
			.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, locals.workspaceId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	const startStr = url.searchParams.get('start');
	const endStr   = url.searchParams.get('end');

	const emptySide = { alluvial: null, trendline: null, meta: null, errorMessage: null };

	if (!startStr || !endStr) {
		return { range: null, baselineCurrency, expense: emptySide, revenue: emptySide };
	}

	const start = parseDate(startStr);
	const end   = parseDate(endStr);
	if (!start || !end || start > end) {
		const invalid = { ...emptySide, errorMessage: 'Invalid date range — end must be on or after start.' };
		return {
			range: { start: startStr, end: endStr },
			baselineCurrency,
			expense: invalid,
			revenue: invalid,
		};
	}
	const endInclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);

	if (!platform?.env?.HEDAZ) error(500, 'HEDAZ service binding missing');

	const [expense, revenue] = await Promise.all([
		_buildExpenseSide({ userId: locals.user.id, workspaceId: locals.workspaceId ?? null, start, endInclusive, baselineCurrency, platform }),
		_buildRevenueSide({ userId: locals.user.id, workspaceId: locals.workspaceId ?? null, start, endInclusive, baselineCurrency, platform }),
	]);

	return {
		range: { start: startStr, end: endStr },
		baselineCurrency,
		expense,
		revenue,
	};
}

/**
 * @param {{ userId: string, workspaceId: string|null, start: Date, endInclusive: Date, baselineCurrency: string, platform: any }} ctx
 */
async function _buildExpenseSide(ctx) {
	const { userId, workspaceId, start, endInclusive, baselineCurrency, platform } = ctx;
	const wsFilter = workspaceId ? [eq(schema.receipt.workspaceId, workspaceId)] : [];

	const allReceipts = await db.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, userId),
			gte(schema.receipt.receiptDate, start),
			lte(schema.receipt.receiptDate, endInclusive),
			...wsFilter,
		));

	const receipts = allReceipts.filter((r) => (r.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
	const excludedCount = allReceipts.length - receipts.length;

	if (receipts.length === 0) {
		return {
			alluvial: null,
			trendline: null,
			meta: { docCount: 0, rowCount: 0, excludedCount },
			errorMessage: excludedCount > 0
				? `No receipts in ${baselineCurrency} for this range (${excludedCount} excluded for currency mismatch).`
				: 'No receipts in this date range.',
		};
	}

	const lineItems = await db.select()
		.from(schema.receiptLineItem)
		.where(inArray(schema.receiptLineItem.receiptId, receipts.map((r) => r.id)));

	const { csv, rowCount } = buildReceiptExportCsv(receipts, lineItems);
	return _analyseCsv({ csv, rowCount, docCount: receipts.length, excludedCount, baselineCurrency, platform });
}

/**
 * @param {{ userId: string, workspaceId: string|null, start: Date, endInclusive: Date, baselineCurrency: string, platform: any }} ctx
 */
async function _buildRevenueSide(ctx) {
	const { userId, workspaceId, start, endInclusive, baselineCurrency, platform } = ctx;
	const wsFilter = workspaceId ? [eq(schema.sale.workspaceId, workspaceId)] : [];

	const allSales = await db.select()
		.from(schema.sale)
		.where(and(
			eq(schema.sale.userId, userId),
			gte(schema.sale.saleDate, start),
			lte(schema.sale.saleDate, endInclusive),
			...wsFilter,
		));

	const sales = allSales.filter((s) => (s.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
	const excludedCount = allSales.length - sales.length;

	if (sales.length === 0) {
		return {
			alluvial: null,
			trendline: null,
			meta: { docCount: 0, rowCount: 0, excludedCount },
			errorMessage: excludedCount > 0
				? `No revenue documents in ${baselineCurrency} for this range (${excludedCount} excluded for currency mismatch).`
				: 'No revenue documents in this date range.',
		};
	}

	const lineItems = await db.select()
		.from(schema.saleLineItem)
		.where(inArray(schema.saleLineItem.saleId, sales.map((s) => s.id)));

	const { csv, rowCount } = buildSaleExportCsv(sales, lineItems);
	return _analyseCsv({ csv, rowCount, docCount: sales.length, excludedCount, baselineCurrency, platform });
}

/**
 * Shared hedaz call. Either-side payload arrives as `csv_text`; hedaz
 * doesn't need to know whether it's expense or revenue — the column
 * grammar is the same.
 *
 * @param {{ csv: string, rowCount: number, docCount: number, excludedCount: number, baselineCurrency: string, platform: any }} ctx
 */
async function _analyseCsv(ctx) {
	const { csv, rowCount, docCount, excludedCount, baselineCurrency, platform } = ctx;
	try {
		const hedazResponse = await platform.env.HEDAZ.fetch(
			new Request('http://hedaz/analyse/export-inline', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ csv_text: csv, default_currency: baselineCurrency }),
			})
		);
		if (!hedazResponse.ok) {
			const detail = await hedazResponse.text();
			return {
				alluvial: null,
				trendline: null,
				meta: { docCount, rowCount, excludedCount },
				errorMessage: `Analysis failed: ${detail}`,
			};
		}
		const bundle = await hedazResponse.json();
		return {
			alluvial:  bundle.alluvial  ?? null,
			trendline: bundle.trendline ?? null,
			meta: { docCount, rowCount, excludedCount },
			errorMessage: null,
		};
	} catch (/** @type {any} */ e) {
		return {
			alluvial: null,
			trendline: null,
			meta: { docCount, rowCount, excludedCount },
			errorMessage: `Analysis failed: ${e?.message ?? 'unknown error'}`,
		};
	}
}
