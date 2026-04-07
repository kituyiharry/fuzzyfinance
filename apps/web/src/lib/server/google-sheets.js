const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const LEDGER_NAME = 'FuzzyFinance Ledger';

const HEADERS = [
	'Receipt ID', 'Merchant', 'Date', 'Total', 'Subtotal',
	'Tax', 'Tip', 'Currency', 'Payment Method', 'Category', 'Notes',
	'Drive File ID', 'Drive Link', 'Uploaded At'
];

/**
 * Finds or creates the FuzzyFinance Ledger spreadsheet inside the given Drive folder.
 *
 * @param {string} accessToken
 * @param {string} folderId — Drive folder to place the sheet in
 * @returns {Promise<string>} spreadsheet ID
 */
export async function ensureLedgerSheet(accessToken, folderId) {
	// Search for existing spreadsheet in the folder
	const q = encodeURIComponent(
		`name='${LEDGER_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
	);
	const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Sheets search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	// Create spreadsheet with header row
	const createRes = await fetch(SHEETS_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			properties: { title: LEDGER_NAME },
			sheets: [{ properties: { title: 'Receipts' } }]
		})
	});
	if (!createRes.ok) throw new Error(`Spreadsheet creation failed: ${await createRes.text()}`);

	const spreadsheet = await createRes.json();
	const spreadsheetId = spreadsheet.spreadsheetId;

	// Write header row
	await fetch(
		`${SHEETS_API}/${spreadsheetId}/values/Receipts!A1:append?valueInputOption=RAW`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ values: [HEADERS] })
		}
	);

	// Move spreadsheet into the receipts folder
	const moveRes = await fetch(
		`${DRIVE_API}/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`,
		{
			method: 'PATCH',
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	);
	if (!moveRes.ok) {
		// Non-fatal — sheet still works, just not in the folder
		console.warn('[google-sheets] Could not move sheet to folder:', await moveRes.text());
	}

	return spreadsheetId;
}

/**
 * Appends a receipt row to the ledger spreadsheet.
 *
 * @param {string} accessToken
 * @param {string} spreadsheetId
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {Promise<void>}
 */
export async function appendReceiptRow(accessToken, spreadsheetId, receipt) {
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
		receipt.driveFileId ?? '',
		receipt.driveFileId ? `https://drive.google.com/file/d/${receipt.driveFileId}/view` : '',
		new Date().toISOString()
	];

	const res = await fetch(
		`${SHEETS_API}/${spreadsheetId}/values/Receipts!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
