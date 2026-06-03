/**
 * Receipt export CSV format — single source of truth for the layout that
 * downstream consumers (the hedaz Rust analyser, the Download endpoint,
 * the live-analysis route) all read.
 */

export const RECEIPT_CSV_HEADERS = [
	'Receipt ID', 'Merchant', 'Receipt Date', 'Uploaded At', 'Category', 'Tags',
	'Receipt Total', 'Currency', 'Line Item Description', 'Qty', 'Unit Price', 'Line Item Total',
	'Unit Size', 'Unit Type', 'Primary Category', 'Secondary Category',
];

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
 * Build the CSV string for a set of receipts + their line items, matching
 * the existing export format expected by the hedaz parser.
 *
 * @param {Array<any>} receipts
 * @param {Array<any>} lineItems  (any subset; will be grouped by receiptId here)
 * @returns {{ csv: string; rowCount: number }}
 */
export function buildReceiptExportCsv(receipts, lineItems) {
	/** @type {Map<string, Array<any>>} */
	const itemsByReceipt = new Map();
	for (const li of lineItems) {
		const group = itemsByReceipt.get(li.receiptId) ?? [];
		group.push(li);
		itemsByReceipt.set(li.receiptId, group);
	}

	const rows = [csvRow(RECEIPT_CSV_HEADERS)];

	for (const r of receipts) {
		const items = (itemsByReceipt.get(r.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
		const tags = (() => { try { return JSON.parse(r.tags ?? '[]').join('; '); } catch { return ''; } })();
		const receiptDate = r.receiptDate ? new Date(r.receiptDate).toISOString().slice(0, 10) : '';
		const uploadedAt  = r.createdAt   ? new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '';

		if (items.length === 0) {
			rows.push(csvRow([
				r.id,
				r.merchantName ?? '',
				receiptDate,
				uploadedAt,
				r.category ?? '',
				tags,
				r.total ?? '',
				r.currency ?? '',
				'', '', '', '', '', '', '', ''
			]));
		} else {
			for (const li of items) {
				rows.push(csvRow([
					r.id,
					r.merchantName ?? '',
					receiptDate,
					uploadedAt,
					r.category ?? '',
					tags,
					r.total ?? '',
					r.currency ?? '',
					li.description ?? '',
					li.qty ?? '',
					li.unitPrice ?? '',
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
