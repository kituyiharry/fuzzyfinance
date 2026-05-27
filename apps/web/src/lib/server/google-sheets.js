const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const FETCH_TIMEOUT_MS = 25_000;
/** @param {string} url @param {RequestInit} [init] */
const tfetch = (url, init) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });

const HEADERS = [
	'Receipt ID', 'Merchant', 'Date', 'Total', 'Subtotal',
	'Tax', 'Tip', 'Currency', 'Payment Method', 'Category', 'Notes', 'Tags',
	'Drive File ID', 'Drive Link', 'Uploaded At'
];

const SALES_HEADERS = [
	'Sale ID', 'Date', 'Document Title', 'Category',
	'Total Revenue', 'Total Cost', 'Total Margin', 'Currency', 'Notes', 'Tags',
	'Item Description', 'Item Type', 'Units Sold', 'Buy Price', 'Sell Price',
	'Margin %', 'Item Total', 'Item Total Cost',
	'Drive File ID', 'Drive Link', 'Uploaded At'
];

/**
 * Finds or creates the year-specific FuzzyFinance Ledger spreadsheet inside the given Drive folder.
 * e.g. "FuzzyFinance Ledger 2026"
 *
 * @param {string} accessToken
 * @param {string} folderId — Drive folder to place the sheet in
 * @param {number} year
 * @param {string} [sheetName] Override the default sheet name (for workspace-specific sheets)
 * @returns {Promise<string>} spreadsheet ID
 */
export async function ensureLedgerSheet(accessToken, folderId, year, sheetName = `FuzzyFinance Ledger ${year}`) {
	const name = sheetName;

	// Search for existing spreadsheet in the folder
	const q = encodeURIComponent(
		`name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
	);
	const searchRes = await tfetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Sheets search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	// Create new spreadsheet (no initial tabs — month tabs added on demand)
	const createRes = await tfetch(SHEETS_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ properties: { title: name } })
	});
	if (!createRes.ok) throw new Error(`Spreadsheet creation failed: ${await createRes.text()}`);

	const spreadsheet = await createRes.json();
	const spreadsheetId = spreadsheet.spreadsheetId;

	// Move spreadsheet into the receipts folder
	const moveRes = await tfetch(
		`${DRIVE_API}/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`,
		{
			method: 'PATCH',
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	);
	if (!moveRes.ok) {
		console.warn('[google-sheets] Could not move sheet to folder:', await moveRes.text());
	}

	return spreadsheetId;
}

/**
 * Finds or creates a tab named `monthName` in the given spreadsheet.
 * Writes the HEADERS row on creation.
 *
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {string} monthName — e.g. 'January'
 * @returns {Promise<void>}
 */
export async function ensureMonthTab(accessToken, spreadsheetId, monthName) {
	// Fetch current sheet metadata
	const metaRes = await tfetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!metaRes.ok) throw new Error(`Spreadsheet metadata fetch failed: ${await metaRes.text()}`);

	const meta = await metaRes.json();
	const existingTitles = (meta.sheets ?? []).map(/** @param {any} s */ s => s.properties?.title);

	if (existingTitles.includes(monthName)) return; // tab already exists

	// Add the new sheet tab
	const batchRes = await tfetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			requests: [{ addSheet: { properties: { title: monthName } } }]
		})
	});
	if (!batchRes.ok) throw new Error(`Add sheet tab failed: ${await batchRes.text()}`);

	// Write header row to the new tab
	const headerRes = await tfetch(
		`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(monthName)}!A1:append?valueInputOption=RAW`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ values: [HEADERS] })
		}
	);
	if (!headerRes.ok) throw new Error(`Header write failed: ${await headerRes.text()}`);
}

// ── Sales ledger ──────────────────────────────────────────────────────────

/**
 * Finds or creates the year-specific FuzzyFinance Sales Ledger spreadsheet.
 *
 * @param {string} accessToken
 * @param {string} folderId — Drive folder (the Sales root folder)
 * @param {number} year
 * @param {string} [sheetName] Override the default sheet name (for workspace-specific sheets)
 * @returns {Promise<string>} spreadsheet ID
 */
export async function ensureSalesLedgerSheet(accessToken, folderId, year, sheetName = `FuzzyFinance Sales Ledger ${year}`) {
	const name = sheetName;

	const q = encodeURIComponent(
		`name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
	);
	const searchRes = await tfetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Sales ledger search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	const createRes = await tfetch(SHEETS_API, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ properties: { title: name } })
	});
	if (!createRes.ok) throw new Error(`Sales ledger creation failed: ${await createRes.text()}`);

	const spreadsheet = await createRes.json();
	const spreadsheetId = spreadsheet.spreadsheetId;

	const moveRes = await tfetch(
		`${DRIVE_API}/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`,
		{ method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (!moveRes.ok) console.warn('[google-sheets] Could not move sales ledger to folder:', await moveRes.text());

	return spreadsheetId;
}

/**
 * Finds or creates a month tab in the sales ledger spreadsheet.
 * Writes SALES_HEADERS on creation.
 *
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {string} monthName — e.g. 'January'
 * @returns {Promise<void>}
 */
export async function ensureSalesMonthTab(accessToken, spreadsheetId, monthName) {
	const metaRes = await tfetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!metaRes.ok) throw new Error(`Sales ledger metadata fetch failed: ${await metaRes.text()}`);

	const meta = await metaRes.json();
	const existingTitles = (meta.sheets ?? []).map(/** @param {any} s */ s => s.properties?.title);
	if (existingTitles.includes(monthName)) return;

	const batchRes = await tfetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ requests: [{ addSheet: { properties: { title: monthName } } }] })
	});
	if (!batchRes.ok) throw new Error(`Sales add sheet tab failed: ${await batchRes.text()}`);

	const headerRes = await tfetch(
		`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(monthName)}!A1:append?valueInputOption=RAW`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ values: [SALES_HEADERS] })
		}
	);
	if (!headerRes.ok) throw new Error(`Sales header write failed: ${await headerRes.text()}`);
}

/**
 * Appends one row per line item (or a summary row if no line items) to the sales ledger.
 *
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {string} monthName — e.g. 'January'
 * @param {import('@fuzzyfinance/db').schema.sale.$inferSelect} sale
 * @returns {Promise<void>}
 */
export async function appendSaleRow(accessToken, spreadsheetId, monthName, sale) {
	const tags = (() => { try { return JSON.parse(sale.tags ?? '[]'); } catch { return []; } })();
	const lineItems = (() => { try { return JSON.parse(sale.lineItemsJson ?? '[]'); } catch { return []; } })();
	const dateStr = sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : '';
	const driveLink = sale.driveFileId ? `https://drive.google.com/file/d/${sale.driveFileId}/view` : '';
	const uploadedAt = new Date().toISOString();

	/** @param {any} li */
	const buildRow = (li) => [
		sale.id,
		dateStr,
		sale.documentTitle  ?? '',
		sale.category       ?? '',
		sale.totalRevenue   ?? '',
		sale.totalCost      ?? '',
		sale.totalMargin    ?? '',
		sale.currency       ?? '',
		sale.notes          ?? '',
		tags.join(', '),
		li?.description  ?? '',
		li?.type         ?? '',
		li?.unitsSold    ?? '',
		li?.buyPrice     ?? '',
		li?.sellPrice    ?? '',
		li?.margin       ?? '',
		li?.total        ?? '',
		li?.totalCost    ?? '',
		sale.driveFileId ?? '',
		driveLink,
		uploadedAt
	];

	const rows = lineItems.length > 0
		? lineItems.map(buildRow)
		: [buildRow(null)];

	const res = await tfetch(
		`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(monthName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ values: rows })
		}
	);
	if (!res.ok) throw new Error(`Sales Sheets append failed: ${await res.text()}`);
}

// ── Receipts ──────────────────────────────────────────────────────────────

/**
 * Appends a receipt row to the named month tab in the ledger spreadsheet.
 *
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {string} monthName — e.g. 'January'
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {Promise<void>}
 */
export async function appendReceiptRow(accessToken, spreadsheetId, monthName, receipt) {
	const tags = (() => { try { return JSON.parse(receipt.tags ?? '[]'); } catch { return []; } })();

	const row = [
		receipt.id,
		receipt.merchantName ?? '',
		receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().slice(0, 10) : '',
		receipt.total      ?? '',
		receipt.subtotal   ?? '',
		receipt.tax        ?? '',
		receipt.tip        ?? '',
		receipt.currency   ?? '',
		receipt.paymentMethod ?? '',
		receipt.category   ?? '',
		receipt.notes      ?? '',
		tags.join(', '),
		receipt.driveFileId ?? '',
		receipt.driveFileId ? `https://drive.google.com/file/d/${receipt.driveFileId}/view` : '',
		new Date().toISOString()
	];

	const res = await tfetch(
		`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(monthName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ values: [row] })
		}
	);
	if (!res.ok) throw new Error(`Sheets append failed: ${await res.text()}`);
}
