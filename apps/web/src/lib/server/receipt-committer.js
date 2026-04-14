import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';
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
			continue;
		}
		if (!accessToken) continue;

		/** @type {{ folderId?: string }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};

		if (provider === 'google') {
			try {
				const rootFolderId = meta.folderId ?? await driveFolder(accessToken);
				const uploadFolderId = await driveMonthFolder(accessToken, rootFolderId, year, month);

				// Idempotent: skip Drive upload if already committed to this provider
				if (receipt.driveFileId && receipt.driveProvider === 'google') {
					driveFileId = receipt.driveFileId;
				} else {
					const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
					const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
					const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
					driveFileId = await uploadFileToDrive(
						accessToken, uploadFolderId, fileName,
						receipt.rawMimeType ?? 'application/octet-stream', fileBytes
					);
					await patch({ driveFileId, driveProvider: 'google' });
				}

				// Idempotent: skip Sheets append if already done
				if (!receipt.sheetId || receipt.sheetProvider !== 'google') {
					const ledgerFileId = await ensureLedgerSheet(accessToken, rootFolderId, year);
					await ensureMonthTab(accessToken, ledgerFileId, monthName);
					await patch({ sheetId: ledgerFileId, sheetProvider: 'google' });

					const [receiptWithDriveId] = await db
						.select()
						.from(schema.receipt)
						.where(eq(schema.receipt.id, receiptId));
					await appendReceiptRow(accessToken, ledgerFileId, monthName, receiptWithDriveId);
				}

				if (!meta.folderId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ ...meta, folderId: rootFolderId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[receipt-committer] Google sync failed:', err);
				syncError = String(err);
			}
		}

		if (provider === 'microsoft') {
			try {
				const rootFolderId = meta.folderId ?? await oneDriveFolder(accessToken);
				const uploadFolderId = await oneDriveMonthFolder(accessToken, rootFolderId, year, month);

				// Idempotent: skip OneDrive upload if already committed to this provider
				if (receipt.driveFileId && receipt.driveProvider === 'microsoft') {
					driveFileId = receipt.driveFileId;
				} else {
					const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
					const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
					const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
					driveFileId = await uploadFileToOneDrive(
						accessToken, uploadFolderId, fileName,
						receipt.rawMimeType ?? 'application/octet-stream', fileBytes
					);
					await patch({ driveFileId, driveProvider: 'microsoft' });
				}

				// Idempotent: skip Excel append if already done
				if (!receipt.sheetId || receipt.sheetProvider !== 'microsoft') {
					const workbookId = await ensureLedgerWorkbook(accessToken, rootFolderId, year);
					await ensureMonthWorksheet(accessToken, workbookId, monthName);
					await patch({ sheetId: workbookId, sheetProvider: 'microsoft' });

					const [receiptWithDriveId] = await db
						.select()
						.from(schema.receipt)
						.where(eq(schema.receipt.id, receiptId));
					await appendReceiptRowExcel(accessToken, workbookId, monthName, receiptWithDriveId);
				}

				if (!meta.folderId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ ...meta, folderId: rootFolderId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[receipt-committer] Microsoft sync failed:', err);
				syncError = String(err);
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
