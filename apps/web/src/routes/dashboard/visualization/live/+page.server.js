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
 * @param {string | null | undefined} raw
 * @returns {'expense' | 'revenue'}
 */
function parseSide(raw) {
	return raw === 'revenue' ? 'revenue' : 'expense';
}

/**
 * Live alluvial: builds an ephemeral export from receipts OR sales in a
 * date range and asks hedaz to analyse it inline. The `side` query
 * param selects which dataset (default `expense` = receipts; `revenue`
 * = sales). Either way the response shape is the same alluvial + trend
 * bundle, so the UI can swap between sides with no server-shape change.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ url, locals, platform }) {
	if (!locals.user) redirect(302, '/');

	const side = parseSide(url.searchParams.get('side'));

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

	// Render picker-only view when no range is set.
	if (!startStr || !endStr) {
		return { side, range: null, alluvial: null, trendline: null, meta: null, baselineCurrency, errorMessage: null };
	}

	const start = parseDate(startStr);
	const end   = parseDate(endStr);
	if (!start || !end || start > end) {
		return {
			side,
			range: { start: startStr, end: endStr },
			alluvial: null,
			trendline: null,
			meta: null,
			baselineCurrency,
			errorMessage: 'Invalid date range — end must be on or after start.',
		};
	}
	const endInclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);

	if (!platform?.env?.HEDAZ) error(500, 'HEDAZ service binding missing');

	let csv, rowCount, docCount, excludedCount;

	if (side === 'revenue') {
		const wsFilter = locals.workspaceId
			? [eq(schema.sale.workspaceId, locals.workspaceId)]
			: [];

		const allSales = await db
			.select()
			.from(schema.sale)
			.where(and(
				eq(schema.sale.userId, locals.user.id),
				gte(schema.sale.saleDate, start),
				lte(schema.sale.saleDate, endInclusive),
				...wsFilter,
			));

		const sales = allSales.filter((s) => (s.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
		excludedCount = allSales.length - sales.length;
		docCount = sales.length;

		if (sales.length === 0) {
			return {
				side,
				range: { start: startStr, end: endStr },
				alluvial: null,
				trendline: null,
				meta: { docCount: 0, rowCount: 0, excludedCount },
				baselineCurrency,
				errorMessage: excludedCount > 0
					? `No revenue documents in ${baselineCurrency} for this range (${excludedCount} excluded for currency mismatch).`
					: 'No revenue documents in this date range.',
			};
		}

		const lineItems = await db
			.select()
			.from(schema.saleLineItem)
			.where(inArray(schema.saleLineItem.saleId, sales.map((s) => s.id)));

		const built = buildSaleExportCsv(sales, lineItems);
		csv      = built.csv;
		rowCount = built.rowCount;
	} else {
		const wsFilter = locals.workspaceId
			? [eq(schema.receipt.workspaceId, locals.workspaceId)]
			: [];

		const allReceipts = await db
			.select()
			.from(schema.receipt)
			.where(and(
				eq(schema.receipt.userId, locals.user.id),
				gte(schema.receipt.receiptDate, start),
				lte(schema.receipt.receiptDate, endInclusive),
				...wsFilter,
			));

		const receipts = allReceipts.filter((r) => (r.currency ?? baselineCurrency).toUpperCase() === baselineCurrency.toUpperCase());
		excludedCount = allReceipts.length - receipts.length;
		docCount = receipts.length;

		if (receipts.length === 0) {
			return {
				side,
				range: { start: startStr, end: endStr },
				alluvial: null,
				trendline: null,
				meta: { docCount: 0, rowCount: 0, excludedCount },
				baselineCurrency,
				errorMessage: excludedCount > 0
					? `No receipts in ${baselineCurrency} for this range (${excludedCount} excluded for currency mismatch).`
					: 'No receipts in this date range.',
			};
		}

		const lineItems = await db
			.select()
			.from(schema.receiptLineItem)
			.where(inArray(schema.receiptLineItem.receiptId, receipts.map((r) => r.id)));

		const built = buildReceiptExportCsv(receipts, lineItems);
		csv      = built.csv;
		rowCount = built.rowCount;
	}

	let bundle;
	try {
		const hedazResponse = await platform.env.HEDAZ.fetch(
			new Request('http://hedaz/analyse/export-inline', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ csv_text: csv, default_currency: baselineCurrency }),
			})
		);
		if (!hedazResponse.ok) {
			const detail = await hedazResponse.text();
			return {
				side,
				range: { start: startStr, end: endStr },
				alluvial: null,
				trendline: null,
				meta: { docCount, rowCount, excludedCount },
				baselineCurrency,
				errorMessage: `Analysis failed: ${detail}`,
			};
		}
		bundle = await hedazResponse.json();
	} catch (/** @type {any} */ e) {
		return {
			side,
			range: { start: startStr, end: endStr },
			alluvial: null,
			trendline: null,
			meta: { docCount, rowCount, excludedCount },
			baselineCurrency,
			errorMessage: `Analysis failed: ${e?.message ?? 'unknown error'}`,
		};
	}

	return {
		side,
		range: { start: startStr, end: endStr },
		alluvial:  bundle.alluvial  ?? null,
		trendline: bundle.trendline ?? null,
		meta: { docCount, rowCount, excludedCount },
		baselineCurrency,
		errorMessage: null,
	};
}
