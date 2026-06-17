/**
 * Sale export CSV. Uses the SAME column layout as the receipt CSV so
 * the hedaz Rust analyser doesn't need to special-case revenue input
 * — it just sees rows with a "Total" and a "Primary/Secondary Category"
 * column and produces an alluvial/trendline bundle the way it would
 * for expenses.
 *
 * Conceptual mapping (sale field → receipt column):
 *   sale.id                 → Receipt ID
 *   sale.documentTitle      → Merchant (semantically "Customer" here)
 *   sale.saleDate           → Receipt Date
 *   sale.createdAt          → Uploaded At
 *   sale.category           → Category
 *   sale.tags               → Tags
 *   sale.totalRevenue       → Receipt Total
 *   sale.currency           → Currency
 *   saleLineItem.description, unitsSold, sellPrice, total,
 *     unitSize, unitType, primaryCategory, secondaryCategory
 *                           → matching Line Item columns
 *
 * The UI labels revenue charts as "Revenue" / "Customer" rather than
 * "Expense" / "Merchant" — the column reuse here is purely so the
 * existing analyser pipeline can stay generic.
 */

import { RECEIPT_CSV_HEADERS } from '$lib/server/receipt-csv';

/** Re-exported for consumers that want to know the column list. */
export const SALE_CSV_HEADERS = RECEIPT_CSV_HEADERS;

/** @param {unknown} val */
function cell(val) {
	const str = String(val ?? '');
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** @param {unknown[]} row */
const csvRow = (row) => row.map(cell).join(',');

/**
 * Build the CSV string for a set of sales + their line items.
 *
 * @param {Array<any>} sales
 * @param {Array<any>} lineItems  any subset; grouped by saleId here
 * @returns {{ csv: string; rowCount: number }}
 */
export function buildSaleExportCsv(sales, lineItems) {
	/** @type {Map<string, Array<any>>} */
	const itemsBySale = new Map();
	for (const li of lineItems) {
		const group = itemsBySale.get(li.saleId) ?? [];
		group.push(li);
		itemsBySale.set(li.saleId, group);
	}

	const rows = [csvRow(SALE_CSV_HEADERS)];

	for (const s of sales) {
		const items = (itemsBySale.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
		const tags = (() => { try { return JSON.parse(s.tags ?? '[]').join('; '); } catch { return ''; } })();
		const saleDate   = s.saleDate  ? new Date(s.saleDate).toISOString().slice(0, 10) : '';
		const uploadedAt = s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '';

		if (items.length === 0) {
			rows.push(csvRow([
				s.id,
				s.documentTitle ?? '',
				saleDate,
				uploadedAt,
				s.category ?? '',
				tags,
				s.totalRevenue ?? '',
				s.currency ?? '',
				'', '', '', '', '', '', '', ''
			]));
		} else {
			for (const li of items) {
				rows.push(csvRow([
					s.id,
					s.documentTitle ?? '',
					saleDate,
					uploadedAt,
					s.category ?? '',
					tags,
					s.totalRevenue ?? '',
					s.currency ?? '',
					li.description ?? '',
					li.unitsSold ?? '',
					li.sellPrice ?? '',
					li.total ?? '',
					li.unitSize ?? '',
					li.unitType ?? '',
					li.primaryCategory ?? '',
					li.secondaryCategory ?? ''
				]));
			}
		}
	}

	return { csv: rows.join('\n'), rowCount: rows.length - 1 };
}
