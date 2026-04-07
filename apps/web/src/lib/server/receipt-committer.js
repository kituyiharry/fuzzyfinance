import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';
import { ensureReceiptFolder as driveFolder, uploadFileToDrive } from '$lib/server/google-drive';
import { ensureLedgerSheet, appendReceiptRow } from '$lib/server/google-sheets';
import {
	ensureReceiptFolder as oneDriveFolder,
	uploadFileToOneDrive,
	ensureLedgerWorkbook,
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

		/** @type {{ folderId?: string; ledgerFileId?: string }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};

		if (provider === 'google') {
			try {
				const folderId = meta.folderId ?? await driveFolder(accessToken);

				const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
				const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
				const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
				driveFileId = await uploadFileToDrive(
					accessToken, folderId, fileName,
					receipt.rawMimeType ?? 'application/octet-stream', fileBytes
				);

				const ledgerFileId = meta.ledgerFileId ?? await ensureLedgerSheet(accessToken, folderId);

				await patch({ driveFileId, driveProvider: 'google', sheetId: ledgerFileId, sheetProvider: 'google' });

				const [receiptWithDriveId] = await db
					.select()
					.from(schema.receipt)
					.where(eq(schema.receipt.id, receiptId));
				await appendReceiptRow(accessToken, ledgerFileId, receiptWithDriveId);

				if (!meta.folderId || !meta.ledgerFileId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ folderId, ledgerFileId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[receipt-committer] Google sync failed:', err);
				syncError = String(err);
			}
		}

		if (provider === 'microsoft') {
			try {
				const folderId = meta.folderId ?? await oneDriveFolder(accessToken);
				const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
				const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
				const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
				driveFileId = await uploadFileToOneDrive(
					accessToken, folderId, fileName,
					receipt.rawMimeType ?? 'application/octet-stream', fileBytes
				);
				const workbookId = meta.ledgerFileId ?? await ensureLedgerWorkbook(accessToken, folderId);

				await patch({ driveFileId, driveProvider: 'microsoft', sheetId: workbookId, sheetProvider: 'microsoft' });

				const [receiptWithDriveId] = await db
					.select()
					.from(schema.receipt)
					.where(eq(schema.receipt.id, receiptId));
				await appendReceiptRowExcel(accessToken, workbookId, receiptWithDriveId);

				if (!meta.folderId || !meta.ledgerFileId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ folderId, ledgerFileId: workbookId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[receipt-committer] Microsoft sync failed:', err);
				syncError = String(err);
			}
		}
	}

	// ── Delete R2 object ───────────────────────────────────────────────────
	try {
		await env.fuzzyfinance_receipts.delete(receipt.r2Key ?? '');
	} catch (err) {
		console.warn('[receipt-committer] R2 delete failed (non-fatal):', err);
	}

	// ── Final status ───────────────────────────────────────────────────────
	const hasSync = integrations.length > 0;
	const finalStatus = hasSync && syncError && !driveFileId ? 'complete_no_sync' : 'complete';

	await patch({
		status: finalStatus,
		...(syncError && !driveFileId ? { errorMessage: syncError } : {})
	});
}
