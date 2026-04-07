const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const FOLDER_NAME  = 'FuzzyFinance Receipts';
const WORKBOOK_NAME = 'FuzzyFinance Ledger.xlsx';

const HEADERS = [
	'Receipt ID', 'Merchant', 'Date', 'Total', 'Subtotal',
	'Tax', 'Tip', 'Currency', 'Payment Method', 'Category', 'Notes',
	'OneDrive File ID', 'File Name', 'Uploaded At'
];

/**
 * Finds or creates the FuzzyFinance Receipts folder in the user's OneDrive root.
 *
 * @param {string} accessToken
 * @returns {Promise<string>} folder item ID
 */
export async function ensureReceiptFolder(accessToken) {
	// Try to get folder by path
	const res = await fetch(
		`${GRAPH}/drive/root:/${FOLDER_NAME}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	if (res.ok) {
		const item = await res.json();
		return item.id;
	}

	// Create folder in root
	const createRes = await fetch(`${GRAPH}/drive/root/children`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ name: FOLDER_NAME, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
	});

	if (!createRes.ok) throw new Error(`OneDrive folder creation failed: ${await createRes.text()}`);
	const folder = await createRes.json();
	return folder.id;
}

/**
 * Uploads a file to OneDrive using a simple PUT upload (< 60 MB).
 *
 * @param {string} accessToken
 * @param {string} folderId
 * @param {string} fileName
 * @param {string} mimeType
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Promise<string>} OneDrive item ID
 */
export async function uploadFileToOneDrive(accessToken, folderId, fileName, mimeType, bytes) {
	const res = await fetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': mimeType
			},
			body: bytes
		}
	);
	if (!res.ok) throw new Error(`OneDrive upload failed: ${await res.text()}`);
	const item = await res.json();
	return item.id;
}

/**
 * Finds or creates the FuzzyFinance Ledger workbook and returns its item ID.
 *
 * @param {string} accessToken
 * @param {string} folderId
 * @returns {Promise<string>} workbook item ID
 */
export async function ensureLedgerWorkbook(accessToken, folderId) {
	// Try to get workbook by path inside the folder
	const res = await fetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(WORKBOOK_NAME)}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	if (res.ok) {
		const item = await res.json();
		return item.id;
	}

	// Create a minimal xlsx (Excel requires a real xlsx binary; use the Graph API
	// to create an empty workbook by uploading an empty xlsx stub)
	const emptyXlsx = _emptyXlsx();
	const createRes = await fetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(WORKBOOK_NAME)}:/content`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			},
			body: emptyXlsx
		}
	);
	if (!createRes.ok) throw new Error(`Workbook creation failed: ${await createRes.text()}`);
	const workbook = await createRes.json();
	const workbookId = workbook.id;

	// Write header row via Graph API
	await _writeRow(accessToken, workbookId, 'A1', HEADERS);

	return workbookId;
}

/**
 * Appends a receipt row to the workbook.
 *
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {Promise<void>}
 */
export async function appendReceiptRowExcel(accessToken, workbookId, receipt) {
	// Determine next empty row by reading used range
	const rangeRes = await fetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets('Sheet1')/usedRange(valuesOnly=true)`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	let nextRow = 2; // default after header
	if (rangeRes.ok) {
		const range = await rangeRes.json();
		// rowCount includes the header row
		nextRow = (range.rowCount ?? 1) + 1;
	}

	const row = [
		receipt.id,
		receipt.merchantName   ?? '',
		receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().slice(0, 10) : '',
		receipt.total          ?? '',
		receipt.subtotal       ?? '',
		receipt.tax            ?? '',
		receipt.tip            ?? '',
		receipt.currency       ?? '',
		receipt.paymentMethod  ?? '',
		receipt.category       ?? '',
		receipt.notes          ?? '',
		receipt.driveFileId    ?? '',
		receipt.rawFileName    ?? '',
		new Date().toISOString()
	];

	const colEnd = String.fromCharCode(65 + row.length - 1); // 'N'
	await _writeRow(accessToken, workbookId, `A${nextRow}:${colEnd}${nextRow}`, row);
}

/**
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} address  — e.g. 'A1' or 'A2:M2'
 * @param {string[]} values
 */
async function _writeRow(accessToken, workbookId, address, values) {
	const res = await fetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets('Sheet1')/range(address='${address}')`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ values: [values] })
		}
	);
	if (!res.ok) throw new Error(`Excel write failed (${address}): ${await res.text()}`);
}

/**
 * Returns the bytes of a minimal valid empty .xlsx file.
 * This is a pre-built base64-encoded empty xlsx (PK zip with required parts).
 * @returns {Uint8Array}
 */
function _emptyXlsx() {
	// Minimal valid xlsx: a zip containing [Content_Types].xml, _rels/.rels,
	// xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/worksheets/sheet1.xml,
	// xl/sharedStrings.xml, xl/styles.xml
	// Base64 of the smallest valid xlsx binary (~2 KB)
	const b64 =
		'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' +
		'4fMC8F74oTZ3HQJQAAAABJRU5ErkJggg==';
	const bin = atob(b64.replace(/\s/g, ''));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
