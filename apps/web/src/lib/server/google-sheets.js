const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API  = 'https://www.googleapis.com/drive/v3';

const HEADERS = [
	'Receipt ID', 'Merchant', 'Date', 'Total', 'Subtotal',
	'Tax', 'Tip', 'Currency', 'Payment Method', 'Category', 'Notes', 'Tags',
	'Drive File ID', 'Drive Link', 'Uploaded At'
];

/**
 * Finds or creates the year-specific FuzzyFinance Ledger spreadsheet inside the given Drive folder.
 * e.g. "FuzzyFinance Ledger 2026"
 *
 * @param {string} accessToken
 * @param {string} folderId — Drive folder to place the sheet in
 * @param {number} year
 * @returns {Promise<string>} spreadsheet ID
 */
export async function ensureLedgerSheet(accessToken, folderId, year) {
	const name = `FuzzyFinance Ledger ${year}`;

	// Search for existing spreadsheet in the folder
	const q = encodeURIComponent(
		`name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
	);
	const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Sheets search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	// Create new spreadsheet (no initial tabs — month tabs added on demand)
	const createRes = await fetch(SHEETS_API, {
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
	const moveRes = await fetch(
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
	const metaRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!metaRes.ok) throw new Error(`Spreadsheet metadata fetch failed: ${await metaRes.text()}`);

	const meta = await metaRes.json();
	const existingTitles = (meta.sheets ?? []).map(/** @param {any} s */ s => s.properties?.title);

	if (existingTitles.includes(monthName)) return; // tab already exists

	// Add the new sheet tab
	const batchRes = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
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
	const headerRes = await fetch(
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

	const res = await fetch(
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
