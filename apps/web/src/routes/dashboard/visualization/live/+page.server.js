import { error, redirect } from '@sveltejs/kit';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { buildReceiptExportCsv } from '$lib/server/receipt-csv';

/**
 * Parse a YYYY-MM-DD string into a Date at UTC midnight.
 * Returns null for invalid/missing input.
 * @param {string | null | undefined} s
 */
function parseDate(s) {
	if (!s) return null;
	const d = new Date(`${s}T00:00:00Z`);
	return isNaN(d.getTime()) ? null : d;
}

/**
 * Live alluvial: builds an ephemeral export from receipts in the date range
 * and asks hedaz to analyse it inline (no R2, no DB row).
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ url, locals, platform }) {
	if (!locals.user) redirect(302, '/');

	const startStr = url.searchParams.get('start');
	const endStr   = url.searchParams.get('end');

	// Render picker-only view when no range is set.
	if (!startStr || !endStr) {
		return { range: null, alluvial: null, meta: null, errorMessage: null };
	}

	const start = parseDate(startStr);
	const end   = parseDate(endStr);
	if (!start || !end || start > end) {
		return {
			range: { start: startStr, end: endStr },
			alluvial: null,
			meta: null,
			errorMessage: 'Invalid date range — end must be on or after start.',
		};
	}
	// end-of-day so receipts on the end date are included
	const endInclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);

	if (!platform?.env?.HEDAZ) error(500, 'HEDAZ service binding missing');

	const wsFilter = locals.workspaceId
		? [eq(schema.receipt.workspaceId, locals.workspaceId)]
		: [];

	const receipts = await db
		.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, locals.user.id),
			gte(schema.receipt.receiptDate, start),
			lte(schema.receipt.receiptDate, endInclusive),
			...wsFilter,
		));

	if (receipts.length === 0) {
		return {
			range: { start: startStr, end: endStr },
			alluvial: null,
			meta: { receiptCount: 0, rowCount: 0 },
			errorMessage: 'No receipts in this date range.',
		};
	}

	const lineItems = await db
		.select()
		.from(schema.receiptLineItem)
		.where(inArray(schema.receiptLineItem.receiptId, receipts.map((r) => r.id)));

	const { csv, rowCount } = buildReceiptExportCsv(receipts, lineItems);

	let bundle;
	try {
		const hedazResponse = await platform.env.HEDAZ.fetch(
			new Request('http://hedaz/analyse/export-inline', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ csv_text: csv, default_currency: 'AUD' }),
			})
		);
		if (!hedazResponse.ok) {
			const detail = await hedazResponse.text();
			return {
				range: { start: startStr, end: endStr },
				alluvial: null,
				trendline: null,
				meta: { receiptCount: receipts.length, rowCount },
				errorMessage: `Analysis failed: ${detail}`,
			};
		}
		bundle = await hedazResponse.json();
	} catch (/** @type {any} */ e) {
		return {
			range: { start: startStr, end: endStr },
			alluvial: null,
			trendline: null,
			meta: { receiptCount: receipts.length, rowCount },
			errorMessage: `Analysis failed: ${e?.message ?? 'unknown error'}`,
		};
	}

	return {
		range: { start: startStr, end: endStr },
		alluvial:  bundle.alluvial  ?? null,
		trendline: bundle.trendline ?? null,
		meta: { receiptCount: receipts.length, rowCount },
		errorMessage: null,
	};
}
