const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FETCH_TIMEOUT_MS = 25_000;
/** @param {string} url @param {RequestInit} [init] */
const tfetch = (url, init) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });
const FOLDER_NAME = 'FuzzyFinance Receipts';
const SALES_FOLDER_NAME = 'FuzzyFinance Sales';

/**
 * Finds or creates a root folder in the user's Drive.
 *
 * @param {string} accessToken
 * @param {string} [folderName]
 * @returns {Promise<string>} folder ID
 */
async function ensureRootFolder(accessToken, folderName = FOLDER_NAME) {
	const q = encodeURIComponent(
		`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
	);
	const searchRes = await tfetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Drive folder search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	const createRes = await tfetch(`${DRIVE_API}/files`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
	});
	if (!createRes.ok) throw new Error(`Drive folder creation failed: ${await createRes.text()}`);

	const folder = await createRes.json();
	return folder.id;
}

/**
 * Finds or creates the FuzzyFinance Receipts folder in the user's Drive root.
 *
 * @param {string} accessToken
 * @param {string} [folderName] Override the default folder name (for workspace-specific folders)
 * @returns {Promise<string>} folder ID
 */
export async function ensureReceiptFolder(accessToken, folderName = FOLDER_NAME) {
	return ensureRootFolder(accessToken, folderName);
}

/**
 * Finds or creates the FuzzyFinance Sales folder in the user's Drive root.
 *
 * @param {string} accessToken
 * @param {string} [folderName] Override the default folder name (for workspace-specific folders)
 * @returns {Promise<string>} folder ID
 */
export async function ensureSalesFolder(accessToken, folderName = SALES_FOLDER_NAME) {
	return ensureRootFolder(accessToken, folderName);
}

/**
 * Finds or creates a subfolder with the given name inside a parent folder.
 *
 * @param {string} accessToken
 * @param {string} parentId
 * @param {string} name
 * @returns {Promise<string>} folder ID
 */
async function ensureSubfolder(accessToken, parentId, name) {
	const q = encodeURIComponent(
		`name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
	);
	const searchRes = await tfetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!searchRes.ok) throw new Error(`Drive subfolder search failed: ${await searchRes.text()}`);

	const { files } = await searchRes.json();
	if (files?.length > 0) return files[0].id;

	const createRes = await tfetch(`${DRIVE_API}/files`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
	});
	if (!createRes.ok) throw new Error(`Drive subfolder creation failed: ${await createRes.text()}`);

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
 * @returns {Promise<string>} month folder ID
 */
export async function ensureMonthFolder(accessToken, rootFolderId, year, month) {
	const yearFolderId  = await ensureSubfolder(accessToken, rootFolderId, String(year));
	const monthFolderId = await ensureSubfolder(accessToken, yearFolderId, String(month).padStart(2, '0'));
	return monthFolderId;
}

/**
 * Uploads a file to the given Drive folder using multipart upload.
 *
 * @param {string} accessToken
 * @param {string} folderId
 * @param {string} fileName
 * @param {string} mimeType
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Promise<string>} Drive file ID
 */
export async function uploadFileToDrive(accessToken, folderId, fileName, mimeType, bytes) {
	const metadata = JSON.stringify({
		name: fileName,
		parents: [folderId]
	});

	const body = new FormData();
	body.append(
		'metadata',
		new Blob([metadata], { type: 'application/json' })
	);
	body.append(
		'file',
		new Blob([bytes], { type: mimeType }),
		fileName
	);

	const res = await tfetch(
		`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${accessToken}` },
			body
		}
	);
	if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);

	const file = await res.json();
	return file.id;
}
