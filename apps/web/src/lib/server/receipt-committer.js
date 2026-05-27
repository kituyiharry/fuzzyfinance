import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';

/**
 * Returns true if an error from a cloud API call indicates the access token
 * was rejected (401 / UNAUTHENTICATED) rather than a logic or network error.
 * @param {unknown} err
 */
function _isCloudAuthError(err) {
	const msg = String(err);
	return (
		msg.includes('401') ||
		msg.includes('UNAUTHENTICATED') ||
		msg.includes('InvalidAuthenticationToken') ||
		msg.includes('Unauthorized')
	);
}
import { ensureReceiptFolder as driveFolder, ensureMonthFolder as driveMonthFolder, uploadFileToDrive } from '$lib/server/google-drive';
import { ensureLedgerSheet, ensureMonthTab, appendReceiptRow } from '$lib/server/google-sheets';
import {
	ensureReceiptFolder as oneDriveFolder,
	ensureMonthFolder as oneDriveMonthFolder,
	uploadFileToOneDrive,
	ensureLedgerWorkbook,
	ensureMonthWorksheet,
	appendReceiptRowExcel
} from '$lib/server/onedrive';

/**
 * Performs cloud sync for a staged receipt, deletes R2, marks status complete.
 * Loads the receipt fresh from DB so any user edits made between staging and
 * committing are reflected in the Drive filename and spreadsheet row.
 *
 * @param {App.Platform['env']} env
 * @param {string} receiptId
 */
export async function commitReceipt(env, receiptId) {
	/** @param {Partial<typeof schema.receipt.$inferInsert>} data */
	const patch = (data) =>
		db.update(schema.receipt).set(data).where(eq(schema.receipt.id, receiptId));

	// ── Load receipt ───────────────────────────────────────────────────────
	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(eq(schema.receipt.id, receiptId));

	if (!receipt) {
		console.error(`[receipt-committer] Receipt ${receiptId} not found`);
		return;
	}

	// ── Resolve workspace for folder naming ───────────────────────────────
	const [receiptWs] = receipt.workspaceId
		? await db.select({ id: schema.workspace.id, isDefault: schema.workspace.isDefault, driveSlug: schema.workspace.driveSlug })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, receipt.workspaceId))
		: [null];
	const isPersonalWs = !receiptWs || receiptWs.isDefault;
	const receiptFolderName = isPersonalWs
		? 'FuzzyFinance Receipts'
		: `FuzzyFinance Receipts for ${receiptWs.driveSlug}`;
	const wid = receipt.workspaceId ?? '';
	/** @param {number} y */
	const ledgerSheetName    = (y) => isPersonalWs ? `FuzzyFinance Ledger ${y}` : `FuzzyFinance Ledger for ${receiptWs?.driveSlug} ${y}`;
	/** @param {number} y */
	const ledgerWorkbookName = (y) => `${ledgerSheetName(y)}.xlsx`;

	// ── Fetch file bytes from R2 ───────────────────────────────────────────
	let fileBytes;
	try {
		const obj = await env.fuzzyfinance_receipts.get(receipt.r2Key ?? '');
		if (!obj) throw new Error(`R2 object not found: ${receipt.r2Key}`);
		fileBytes = await obj.arrayBuffer();
	} catch (err) {
		console.error('[receipt-committer] R2 fetch failed:', err);
		await patch({ status: 'failed', errorMessage: String(err) });
		return;
	}

	// ── Resolve file date, year, and month name ────────────────────────────
	const fileDate = receipt.receiptDate ? new Date(receipt.receiptDate) : new Date();
	const year = fileDate.getFullYear();
	const month = fileDate.getMonth() + 1;
	const monthName = fileDate.toLocaleString('en-US', { month: 'long' }); // e.g. 'April'

	// ── Cloud sync ─────────────────────────────────────────────────────────
	const integrations = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, receipt.userId));

	let driveFileId = null;
	let syncError   = null;

	for (const integration of integrations) {
		const provider = /** @type {'google' | 'microsoft'} */ (integration.provider);

		let accessToken;
		try {
			accessToken = await getValidAccessToken(receipt.userId, provider);
		} catch (err) {
			console.warn(`[receipt-committer] Could not get token for ${provider}:`, err);
			syncError = String(err);
			continue;
		}
		if (!accessToken) continue;

		/** @type {{ folderId?: string; workspaceFolders?: Record<string, { folderId?: string }> }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
		const wsCache = isPersonalWs ? meta : (meta.workspaceFolders?.[wid] ?? {});

		if (provider === 'google') {
			// Attempt sync; on a 401 from the cloud API, force-refresh the token and retry once.
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					if (attempt === 1) {
						const fresh = await getValidAccessToken(receipt.userId, provider, { forceRefresh: true });
						if (!fresh) break;
						accessToken = fresh;
					}
					const tok = /** @type {string} */ (accessToken);

					const rootFolderId = wsCache.folderId ?? await driveFolder(tok, receiptFolderName);
					const uploadFolderId = await driveMonthFolder(tok, rootFolderId, year, month);

					if (receipt.driveFileId && receipt.driveProvider === 'google') {
						driveFileId = receipt.driveFileId;
					} else {
						const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
						const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
						const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
						driveFileId = await uploadFileToDrive(
							tok, uploadFolderId, fileName,
							receipt.rawMimeType ?? 'application/octet-stream', fileBytes
						);
						await patch({ driveFileId, driveProvider: 'google' });
					}

					if (!receipt.sheetId || receipt.sheetProvider !== 'google') {
						const ledgerFileId = await ensureLedgerSheet(tok, rootFolderId, year, ledgerSheetName(year));
						await ensureMonthTab(tok, ledgerFileId, monthName);
						await patch({ sheetId: ledgerFileId, sheetProvider: 'google' });

						const [receiptWithDriveId] = await db
							.select()
							.from(schema.receipt)
							.where(eq(schema.receipt.id, receiptId));
						await appendReceiptRow(tok, ledgerFileId, monthName, receiptWithDriveId);
					}

					if (!wsCache.folderId) {
						const newMeta = isPersonalWs
							? { ...meta, folderId: rootFolderId }
							: { ...meta, workspaceFolders: { ...meta.workspaceFolders, [wid]: { ...wsCache, folderId: rootFolderId } } };
						await db.update(schema.integration)
							.set({ metadataJson: JSON.stringify(newMeta) })
							.where(eq(schema.integration.id, integration.id));
					}
					break; // success
				} catch (err) {
					if (attempt === 0 && _isCloudAuthError(err)) {
						console.warn('[receipt-committer] Google 401 on attempt 0 — retrying with force-refresh');
						continue;
					}
					console.error('[receipt-committer] Google sync failed:', err);
					syncError = String(err);
					break;
				}
			}
		}

		if (provider === 'microsoft') {
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					if (attempt === 1) {
						const fresh = await getValidAccessToken(receipt.userId, provider, { forceRefresh: true });
						if (!fresh) break;
						accessToken = fresh;
					}
					const tok = /** @type {string} */ (accessToken);

					const rootFolderId = wsCache.folderId ?? await oneDriveFolder(tok, receiptFolderName);
					const uploadFolderId = await oneDriveMonthFolder(tok, rootFolderId, year, month);

					if (receipt.driveFileId && receipt.driveProvider === 'microsoft') {
						driveFileId = receipt.driveFileId;
					} else {
						const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
						const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
						const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
						driveFileId = await uploadFileToOneDrive(
							tok, uploadFolderId, fileName,
							receipt.rawMimeType ?? 'application/octet-stream', fileBytes
						);
						await patch({ driveFileId, driveProvider: 'microsoft' });
					}

					if (!receipt.sheetId || receipt.sheetProvider !== 'microsoft') {
						const workbookId = await ensureLedgerWorkbook(tok, rootFolderId, year, ledgerWorkbookName(year));
						await ensureMonthWorksheet(tok, workbookId, monthName);
						await patch({ sheetId: workbookId, sheetProvider: 'microsoft' });

						const [receiptWithDriveId] = await db
							.select()
							.from(schema.receipt)
							.where(eq(schema.receipt.id, receiptId));
						await appendReceiptRowExcel(tok, workbookId, monthName, receiptWithDriveId);
					}

					if (!wsCache.folderId) {
						const newMeta = isPersonalWs
							? { ...meta, folderId: rootFolderId }
							: { ...meta, workspaceFolders: { ...meta.workspaceFolders, [wid]: { ...wsCache, folderId: rootFolderId } } };
						await db.update(schema.integration)
							.set({ metadataJson: JSON.stringify(newMeta) })
							.where(eq(schema.integration.id, integration.id));
					}
					break; // success
				} catch (err) {
					if (attempt === 0 && _isCloudAuthError(err)) {
						console.warn('[receipt-committer] Microsoft 401 on attempt 0 — retrying with force-refresh');
						continue;
					}
					console.error('[receipt-committer] Microsoft sync failed:', err);
					syncError = String(err);
					break;
				}
			}
		}
	}

	// ── Set R2 expiry (7 days from now) — cron deletes it later ──────────────
	const r2ExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	// ── Final status ───────────────────────────────────────────────────────
	const hasSync = integrations.length > 0;
	const finalStatus = hasSync && syncError && !driveFileId ? 'complete_no_sync' : 'complete';

	await patch({
		status: finalStatus,
		r2ExpiresAt,
		...(syncError && !driveFileId ? { errorMessage: syncError } : {})
	});
}
