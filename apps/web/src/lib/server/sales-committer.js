import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';
import { ensureSalesFolder as driveSalesFolder, ensureMonthFolder as driveMonthFolder, uploadFileToDrive } from '$lib/server/google-drive';
import { ensureSalesLedgerSheet, ensureSalesMonthTab, appendSaleRow } from '$lib/server/google-sheets';
import {
	ensureSalesFolder as oneDriveSalesFolder,
	ensureMonthFolder as oneDriveMonthFolder,
	uploadFileToOneDrive,
	ensureSalesLedgerWorkbook,
	ensureSalesMonthWorksheet,
	appendSaleRowExcel
} from '$lib/server/onedrive';

/**
 * Performs cloud sync for a staged sale, deletes R2, marks status complete.
 *
 * @param {App.Platform['env']} env
 * @param {string} saleId
 */
export async function commitSale(env, saleId) {
	/** @param {Partial<typeof schema.sale.$inferInsert>} data */
	const patch = (data) => db.update(schema.sale).set(data).where(eq(schema.sale.id, saleId));

	// ── Load sale ──────────────────────────────────────────────────────────
	const [sale] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
	if (!sale) {
		console.error(`[sales-committer] Sale ${saleId} not found`);
		return;
	}

	// ── Fetch file bytes from R2 ───────────────────────────────────────────
	let fileBytes;
	try {
		const obj = await env.fuzzyfinance_receipts.get(sale.r2Key ?? '');
		if (!obj) throw new Error(`R2 object not found: ${sale.r2Key}`);
		fileBytes = await obj.arrayBuffer();
	} catch (err) {
		console.error('[sales-committer] R2 fetch failed:', err);
		await patch({ status: 'failed', errorMessage: String(err) });
		return;
	}

	// ── Resolve year and month ─────────────────────────────────────────────
	const fileDate = sale.saleDate ? new Date(sale.saleDate) : new Date();
	const year      = fileDate.getFullYear();
	const month     = fileDate.getMonth() + 1;
	const monthName = fileDate.toLocaleString('en-US', { month: 'long' });

	// ── Cloud sync ─────────────────────────────────────────────────────────
	const integrations = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, sale.userId));

	let driveFileId = null;
	let syncError   = null;

	for (const integration of integrations) {
		const provider = /** @type {'google' | 'microsoft'} */ (integration.provider);

		let accessToken;
		try {
			accessToken = await getValidAccessToken(sale.userId, provider);
		} catch (err) {
			console.warn(`[sales-committer] Could not get token for ${provider}:`, err);
			continue;
		}
		if (!accessToken) continue;

		/** @type {{ folderId?: string; salesFolderId?: string }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};

		if (provider === 'google') {
			try {
				const salesRootId = meta.salesFolderId ?? await driveSalesFolder(accessToken);
				const uploadFolderId = await driveMonthFolder(accessToken, salesRootId, year, month);

				// Idempotent: skip Drive upload if already committed to this provider
				if (sale.driveFileId && sale.driveProvider === 'google') {
					driveFileId = sale.driveFileId;
				} else {
					const ext = (sale.rawMimeType ?? '').split('/')[1] ?? 'bin';
					const safeTitle = (sale.documentTitle ?? 'sale').replace(/[^a-z0-9]/gi, '_');
					const fileName = `${safeTitle}_${saleId.slice(0, 8)}.${ext}`;
					driveFileId = await uploadFileToDrive(
						accessToken, uploadFolderId, fileName,
						sale.rawMimeType ?? 'application/octet-stream', fileBytes
					);
					await patch({ driveFileId, driveProvider: 'google' });
				}

				// Idempotent: skip Sheets append if already done
				if (!sale.sheetId || sale.sheetProvider !== 'google') {
					const ledgerFileId = await ensureSalesLedgerSheet(accessToken, salesRootId, year);
					await ensureSalesMonthTab(accessToken, ledgerFileId, monthName);
					await patch({ sheetId: ledgerFileId, sheetProvider: 'google' });

					const [saleWithDriveId] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
					await appendSaleRow(accessToken, ledgerFileId, monthName, saleWithDriveId);
				}

				if (!meta.salesFolderId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ ...meta, salesFolderId: salesRootId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[sales-committer] Google sync failed:', err);
				syncError = String(err);
			}
		}

		if (provider === 'microsoft') {
			try {
				const salesRootId = meta.salesFolderId ?? await oneDriveSalesFolder(accessToken);
				const uploadFolderId = await oneDriveMonthFolder(accessToken, salesRootId, year, month);

				// Idempotent: skip OneDrive upload if already committed to this provider
				if (sale.driveFileId && sale.driveProvider === 'microsoft') {
					driveFileId = sale.driveFileId;
				} else {
					const ext = (sale.rawMimeType ?? '').split('/')[1] ?? 'bin';
					const safeTitle = (sale.documentTitle ?? 'sale').replace(/[^a-z0-9]/gi, '_');
					const fileName = `${safeTitle}_${saleId.slice(0, 8)}.${ext}`;
					driveFileId = await uploadFileToOneDrive(
						accessToken, uploadFolderId, fileName,
						sale.rawMimeType ?? 'application/octet-stream', fileBytes
					);
					await patch({ driveFileId, driveProvider: 'microsoft' });
				}

				// Idempotent: skip Excel append if already done
				if (!sale.sheetId || sale.sheetProvider !== 'microsoft') {
					const workbookId = await ensureSalesLedgerWorkbook(accessToken, salesRootId, year);
					await ensureSalesMonthWorksheet(accessToken, workbookId, monthName);
					await patch({ sheetId: workbookId, sheetProvider: 'microsoft' });

					const [saleWithDriveId] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
					await appendSaleRowExcel(accessToken, workbookId, monthName, saleWithDriveId);
				}

				if (!meta.salesFolderId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ ...meta, salesFolderId: salesRootId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[sales-committer] Microsoft sync failed:', err);
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
