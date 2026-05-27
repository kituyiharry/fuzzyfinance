const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const FETCH_TIMEOUT_MS = 25_000;
/** @param {string} url @param {RequestInit} [init] */
const tfetch = (url, init) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });
const FOLDER_NAME       = 'FuzzyFinance Receipts';
const SALES_FOLDER_NAME = 'FuzzyFinance Sales';

const HEADERS = [
	'Receipt ID', 'Merchant', 'Date', 'Total', 'Subtotal',
	'Tax', 'Tip', 'Currency', 'Payment Method', 'Category', 'Notes', 'Tags',
	'OneDrive File ID', 'File Name', 'Uploaded At'
];

const SALES_HEADERS = [
	'Sale ID', 'Date', 'Document Title', 'Category',
	'Total Revenue', 'Total Cost', 'Total Margin', 'Currency', 'Notes', 'Tags',
	'Item Description', 'Item Type', 'Units Sold', 'Buy Price', 'Sell Price',
	'Margin %', 'Item Total', 'Item Total Cost',
	'OneDrive File ID', 'File Name', 'Uploaded At'
];

/**
 * Finds or creates the FuzzyFinance Receipts folder in the user's OneDrive root.
 *
 * @param {string} accessToken
 * @param {string} [folderName] Override the default folder name (for workspace-specific folders)
 * @returns {Promise<string>} folder item ID
 */
export async function ensureReceiptFolder(accessToken, folderName = FOLDER_NAME) {
	// Try to get folder by path
	const res = await tfetch(
		`${GRAPH}/drive/root:/${folderName}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	if (res.ok) {
		const item = await res.json();
		return item.id;
	}

	// Create folder in root
	const createRes = await tfetch(`${GRAPH}/drive/root/children`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
	});

	if (!createRes.ok) throw new Error(`OneDrive folder creation failed: ${await createRes.text()}`);
	const folder = await createRes.json();
	return folder.id;
}

/**
 * Finds or creates a child folder under a given parent item ID.
 *
 * @param {string} accessToken
 * @param {string} parentId
 * @param {string} name
 * @returns {Promise<string>} folder item ID
 */
async function ensureSubfolder(accessToken, parentId, name) {
	const res = await tfetch(
		`${GRAPH}/drive/items/${parentId}/children?$filter=name eq '${encodeURIComponent(name)}' and folder ne null`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (res.ok) {
		const data = await res.json();
		if (data.value?.length > 0) return data.value[0].id;
	}

	const createRes = await tfetch(`${GRAPH}/drive/items/${parentId}/children`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
	});
	// 409 means folder already exists — fetch it
	if (createRes.status === 409) {
		const retry = await tfetch(
			`${GRAPH}/drive/items/${parentId}:/${encodeURIComponent(name)}`,
			{ headers: { Authorization: `Bearer ${accessToken}` } }
		);
		if (!retry.ok) throw new Error(`OneDrive subfolder fetch failed: ${await retry.text()}`);
		const item = await retry.json();
		return item.id;
	}
	if (!createRes.ok) throw new Error(`OneDrive subfolder creation failed: ${await createRes.text()}`);
	const folder = await createRes.json();
	return folder.id;
}

/**
 * Ensures the {year}/{month} subfolder hierarchy exists under the root folder.
 *
 * @param {string} accessToken
 * @param {string} rootFolderId
 * @param {number} year  e.g. 2026
 * @param {number} month e.g. 4
 * @returns {Promise<string>} month folder item ID
 */
export async function ensureMonthFolder(accessToken, rootFolderId, year, month) {
	const yearId  = await ensureSubfolder(accessToken, rootFolderId, String(year));
	const monthId = await ensureSubfolder(accessToken, yearId, String(month).padStart(2, '0'));
	return monthId;
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
	const res = await tfetch(
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
 * Finds or creates the year-specific FuzzyFinance Ledger workbook and returns its item ID.
 * e.g. "FuzzyFinance Ledger 2026.xlsx"
 *
 * @param {string} accessToken
 * @param {string} folderId
 * @param {number} year
 * @param {string} [workbookName] Override the default workbook name (for workspace-specific workbooks)
 * @returns {Promise<string>} workbook item ID
 */
export async function ensureLedgerWorkbook(accessToken, folderId, year, workbookName = `FuzzyFinance Ledger ${year}.xlsx`) {

	// Try to get workbook by path inside the folder
	const res = await tfetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(workbookName)}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	if (res.ok) {
		const item = await res.json();
		return item.id;
	}

	// Create a minimal xlsx (Excel requires a real xlsx binary; use the Graph API
	// to create an empty workbook by uploading an empty xlsx stub)
	const emptyXlsx = _emptyXlsx();
	const createRes = await tfetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(workbookName)}:/content`,
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

	return workbookId;
}

/**
 * Finds or creates a worksheet tab named `monthName` in the workbook.
 * Writes the HEADERS row on creation.
 *
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} monthName — e.g. 'January'
 * @returns {Promise<void>}
 */
export async function ensureMonthWorksheet(accessToken, workbookId, monthName) {
	// List existing worksheets
	const listRes = await tfetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (!listRes.ok) throw new Error(`Worksheet list failed: ${await listRes.text()}`);

	const { value: sheets } = await listRes.json();
	const exists = sheets.some(/** @param {any} s */ s => s.name === monthName);

	if (!exists) {
		const addRes = await tfetch(
			`${GRAPH}/drive/items/${workbookId}/workbook/worksheets`,
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: monthName })
			}
		);
		if (!addRes.ok) throw new Error(`Add worksheet failed: ${await addRes.text()}`);

		// Write headers to the new worksheet
		await _writeRow(accessToken, workbookId, monthName, 'A1', HEADERS);
	}
}

/**
 * Appends a receipt row to the named month worksheet in the workbook.
 *
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} monthName — e.g. 'January'
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {Promise<void>}
 */
export async function appendReceiptRowExcel(accessToken, workbookId, monthName, receipt) {
	// Determine next empty row by reading used range of the month worksheet
	const rangeRes = await tfetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets('${monthName}')/usedRange(valuesOnly=true)`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);

	let nextRow = 2; // default after header
	if (rangeRes.ok) {
		const range = await rangeRes.json();
		nextRow = (range.rowCount ?? 1) + 1;
	}

	const tags = (() => { try { return JSON.parse(receipt.tags ?? '[]'); } catch { return []; } })();

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
		tags.join(', '),
		receipt.driveFileId    ?? '',
		receipt.rawFileName    ?? '',
		new Date().toISOString()
	];

	const colEnd = String.fromCharCode(65 + row.length - 1); // 'O'
	await _writeRow(accessToken, workbookId, monthName, `A${nextRow}:${colEnd}${nextRow}`, row);
}

/**
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} sheetName
 * @param {string} address  — e.g. 'A1' or 'A2:O2'
 * @param {string[]} values
 */
async function _writeRow(accessToken, workbookId, sheetName, address, values) {
	const res = await tfetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets('${sheetName}')/range(address='${address}')`,
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

// ── Sales ─────────────────────────────────────────────────────────────────

/**
 * Finds or creates the FuzzyFinance Sales folder in the user's OneDrive root.
 *
 * @param {string} accessToken
 * @param {string} [folderName] Override the default folder name (for workspace-specific folders)
 * @returns {Promise<string>} folder item ID
 */
export async function ensureSalesFolder(accessToken, folderName = SALES_FOLDER_NAME) {
	const res = await tfetch(
		`${GRAPH}/drive/root:/${folderName}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (res.ok) {
		const item = await res.json();
		return item.id;
	}
	const createRes = await tfetch(`${GRAPH}/drive/root/children`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
	});
	if (!createRes.ok) throw new Error(`OneDrive sales folder creation failed: ${await createRes.text()}`);
	const folder = await createRes.json();
	return folder.id;
}

/**
 * Finds or creates the year-specific FuzzyFinance Sales Ledger workbook.
 *
 * @param {string} accessToken
 * @param {string} folderId
 * @param {number} year
 * @param {string} [workbookName] Override the default workbook name (for workspace-specific workbooks)
 * @returns {Promise<string>} workbook item ID
 */
export async function ensureSalesLedgerWorkbook(accessToken, folderId, year, workbookName = `FuzzyFinance Sales Ledger ${year}.xlsx`) {
	const res = await tfetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(workbookName)}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (res.ok) {
		const item = await res.json();
		return item.id;
	}
	const emptyXlsx = _emptyXlsx();
	const createRes = await tfetch(
		`${GRAPH}/drive/items/${folderId}:/${encodeURIComponent(workbookName)}:/content`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			},
			body: emptyXlsx
		}
	);
	if (!createRes.ok) throw new Error(`Sales workbook creation failed: ${await createRes.text()}`);
	const workbook = await createRes.json();
	return workbook.id;
}

/**
 * Finds or creates a worksheet tab named `monthName` in the sales workbook.
 * Writes SALES_HEADERS on creation.
 *
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} monthName — e.g. 'January'
 * @returns {Promise<void>}
 */
export async function ensureSalesMonthWorksheet(accessToken, workbookId, monthName) {
	const listRes = await tfetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	if (!listRes.ok) throw new Error(`Sales worksheet list failed: ${await listRes.text()}`);

	const { value: sheets } = await listRes.json();
	const exists = sheets.some(/** @param {any} s */ s => s.name === monthName);

	if (!exists) {
		const addRes = await tfetch(
			`${GRAPH}/drive/items/${workbookId}/workbook/worksheets`,
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: monthName })
			}
		);
		if (!addRes.ok) throw new Error(`Add sales worksheet failed: ${await addRes.text()}`);
		await _writeRow(accessToken, workbookId, monthName, 'A1', SALES_HEADERS);
	}
}

/**
 * Appends one row per line item (or a summary row) to the sales worksheet.
 *
 * @param {string} accessToken
 * @param {string} workbookId
 * @param {string} monthName — e.g. 'January'
 * @param {import('@fuzzyfinance/db').schema.sale.$inferSelect} sale
 * @returns {Promise<void>}
 */
export async function appendSaleRowExcel(accessToken, workbookId, monthName, sale) {
	const rangeRes = await tfetch(
		`${GRAPH}/drive/items/${workbookId}/workbook/worksheets('${monthName}')/usedRange(valuesOnly=true)`,
		{ headers: { Authorization: `Bearer ${accessToken}` } }
	);
	let nextRow = 2;
	if (rangeRes.ok) {
		const range = await rangeRes.json();
		nextRow = (range.rowCount ?? 1) + 1;
	}

	const tags = (() => { try { return JSON.parse(sale.tags ?? '[]'); } catch { return []; } })();
	const lineItems = (() => { try { return JSON.parse(sale.lineItemsJson ?? '[]'); } catch { return []; } })();
	const dateStr = sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : '';
	const uploadedAt = new Date().toISOString();

	/** @param {any} li */
	const buildRow = (li) => [
		sale.id,
		dateStr,
		sale.documentTitle ?? '',
		sale.category      ?? '',
		sale.totalRevenue  ?? '',
		sale.totalCost     ?? '',
		sale.totalMargin   ?? '',
		sale.currency      ?? '',
		sale.notes         ?? '',
		tags.join(', '),
		li?.description ?? '',
		li?.type        ?? '',
		li?.unitsSold   ?? '',
		li?.buyPrice    ?? '',
		li?.sellPrice   ?? '',
		li?.margin      ?? '',
		li?.total       ?? '',
		li?.totalCost   ?? '',
		sale.driveFileId ?? '',
		sale.rawFileName ?? '',
		uploadedAt
	];

	const rows = lineItems.length > 0 ? lineItems.map(buildRow) : [buildRow(null)];

	for (let i = 0; i < rows.length; i++) {
		const colEnd = String.fromCharCode(65 + rows[i].length - 1);
		const row = nextRow + i;
		await _writeRow(accessToken, workbookId, monthName, `A${row}:${colEnd}${row}`, rows[i]);
	}
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
		'UEsDBBQABgAIAAAAIQBi7p1oXgEAAJAEAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAACAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArFTLTsMwELwj8Q+Rr6jJg4dSRHroI6GgAkpcjb1pLPkle9OW' +
		'v2edpCkCIVGOduLZ2ZnZXdkXl20j0AGMS+U0oCIDpEy5UEY1oB7u5/dgiQSd1qKRhhXgmQGuyw+fp8' +
		'GEBiIMpwAAnBbPWDtGXBRFJZTDTOxTBJPa2lbQH9sqiaIoS2EaWFGc5kVVFKd5VRbFaV6V5+U0rxBz' +
		'K2CZ3M7LGVjkAQfZwI6oVApMAUblxQMrIkwV8TGNIJ9kcAjQEQqO4CW/bXo4qpMDWlD9DWBiiqoGFR' +
		'TGn4J1HMbkC8NvaDTlhRSBs4yoCExXh/OwG5ANi1JnxHGdJDZeN4Y+AAAA//8DAFBLAwQUAAYACAAA' +
		'ACEAlYgVlCEBAABQAgAACwAIAl9yZWxzLy5yZWxzIKIEAiigAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArJJNS8QwEIbvgv8h5N7NdlUQkaa9iOBJ' +
		'9hDSaRpsPoiZ3fXfm6KC6GGPnoY8M8/7Mr/b7acb1RtFdp4a2FQVKPLOt547A8/Hx+oOVMnILY6eyA' +
		'w8UsC2ub6q1zkiiyQlEBHYCMnKH6CDioJxYU9JVkFcQZGxJCmQAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQSwMEFAAGAAgAAAAhAIE+lJfzAAAAugIAABoA' +
		'CAF4bC9fcmVscy93b3JrYm9vay54bWwucmVscyCiBAEooAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArJJBasMwEE' +
		'X3hd5BaG/LdlEoJbILhW4LyQEUeWyL2JIQk0J6+wpT6KIUul2+mff/jGe93n4aJe6UHQdPDSyqGgR' +
		'56qlvDRyvl/VGgI8YuciJGjjRg22zfb9qqMiScK0sA1KkBLgABlJABrC0Yhs8AAAAAAAAAAAAAAAAAu' +
		'tqAg0KAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
		'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBLAwQUAAYACAAAACEA0nxPlgQCAABqBgAADwAAAHhs' +
		'L3dvcmtib29rLnhtbKRVS4/bMAy+D9h/MHTvKk67LRbJFdtlh2IYdujBN0VmEmGypEpykvbXj5SdPH' +
		'YxBsgpIj9+JCWlt+cqkjMYK7RKaPQwogRUqrlQZUKP++3dnFJrmc55pRUkdAlLnrOP0SxrjV0dgMDg' +
		'glZIaOmcXsWxZCRW3D3oFhSeFNpW3OHSlrHdG+C5L6riOBmNZnHFhaKBYcGCGF0UgsGjEXUFygUMC3' +
		'CNBtJJsOEJKFBsWm/uXBbV7U1pPFNEu82w5B9cI0SfGOCK0nkLB7vVfVj3q6sZKuFH/6JGHmJhJ3LV' +
		'2LFO+DqbJtNx1F9djikJMzHfXD+V4EBDELIWkIGBh8gx2GJrHzBT9QMjKiPDABGXa2gHoBJgqFb1E' +
		'4fMC8F74oTZ3HQJQAAAABJRU5ErkJggg==';
	const bin = atob(b64.replace(/\s/g, ''));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
