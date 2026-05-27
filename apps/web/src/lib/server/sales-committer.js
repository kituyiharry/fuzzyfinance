import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';

/** @param {unknown} err */
function _isCloudAuthError(err) {
	const msg = String(err);
	return (
		msg.includes('401') ||
		msg.includes('UNAUTHENTICATED') ||
		msg.includes('InvalidAuthenticationToken') ||
		msg.includes('Unauthorized')
	);
}
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

	// ── Resolve workspace for folder naming ───────────────────────────────
	const [saleWs] = sale.workspaceId
		? await db.select({ id: schema.workspace.id, isDefault: schema.workspace.isDefault, driveSlug: schema.workspace.driveSlug })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, sale.workspaceId))
		: [null];
	const isPersonalWs = !saleWs || saleWs.isDefault;
	const salesFolderName = isPersonalWs
		? 'FuzzyFinance Sales'
		: `FuzzyFinance Sales for ${saleWs.driveSlug}`;
	const wid = sale.workspaceId ?? '';
	/** @param {number} y */
	const salesLedgerSheetName    = (y) => isPersonalWs ? `FuzzyFinance Sales Ledger ${y}` : `FuzzyFinance Sales Ledger for ${saleWs?.driveSlug} ${y}`;
	/** @param {number} y */
	const salesLedgerWorkbookName = (y) => `${salesLedgerSheetName(y)}.xlsx`;

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
			syncError = String(err);
			continue;
		}
		if (!accessToken) continue;

		/** @type {{ salesFolderId?: string; workspaceFolders?: Record<string, { salesFolderId?: string }> }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
		const wsCache = isPersonalWs ? meta : (meta.workspaceFolders?.[wid] ?? {});

		if (provider === 'google') {
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					if (attempt === 1) {
						const fresh = await getValidAccessToken(sale.userId, provider, { forceRefresh: true });
						if (!fresh) break;
						accessToken = fresh;
					}
					const tok = /** @type {string} */ (accessToken);

					const salesRootId = wsCache.salesFolderId ?? await driveSalesFolder(tok, salesFolderName);
					const uploadFolderId = await driveMonthFolder(tok, salesRootId, year, month);

					if (sale.driveFileId && sale.driveProvider === 'google') {
						driveFileId = sale.driveFileId;
					} else {
						const ext = (sale.rawMimeType ?? '').split('/')[1] ?? 'bin';
						const safeTitle = (sale.documentTitle ?? 'sale').replace(/[^a-z0-9]/gi, '_');
						const fileName = `${safeTitle}_${saleId.slice(0, 8)}.${ext}`;
						driveFileId = await uploadFileToDrive(
							tok, uploadFolderId, fileName,
							sale.rawMimeType ?? 'application/octet-stream', fileBytes
						);
						await patch({ driveFileId, driveProvider: 'google' });
					}

					if (!sale.sheetId || sale.sheetProvider !== 'google') {
						const ledgerFileId = await ensureSalesLedgerSheet(tok, salesRootId, year, salesLedgerSheetName(year));
						await ensureSalesMonthTab(tok, ledgerFileId, monthName);
						await patch({ sheetId: ledgerFileId, sheetProvider: 'google' });

						const [saleWithDriveId] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
						await appendSaleRow(tok, ledgerFileId, monthName, saleWithDriveId);
					}

					if (!wsCache.salesFolderId) {
						const newMeta = isPersonalWs
							? { ...meta, salesFolderId: salesRootId }
							: { ...meta, workspaceFolders: { ...meta.workspaceFolders, [wid]: { ...wsCache, salesFolderId: salesRootId } } };
						await db.update(schema.integration)
							.set({ metadataJson: JSON.stringify(newMeta) })
							.where(eq(schema.integration.id, integration.id));
					}
					break; // success
				} catch (err) {
					if (attempt === 0 && _isCloudAuthError(err)) {
						console.warn('[sales-committer] Google 401 on attempt 0 — retrying with force-refresh');
						continue;
					}
					console.error('[sales-committer] Google sync failed:', err);
					syncError = String(err);
					break;
				}
			}
		}

		if (provider === 'microsoft') {
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					if (attempt === 1) {
						const fresh = await getValidAccessToken(sale.userId, provider, { forceRefresh: true });
						if (!fresh) break;
						accessToken = fresh;
					}
					const tok = /** @type {string} */ (accessToken);

					const salesRootId = wsCache.salesFolderId ?? await oneDriveSalesFolder(tok, salesFolderName);
					const uploadFolderId = await oneDriveMonthFolder(tok, salesRootId, year, month);

					if (sale.driveFileId && sale.driveProvider === 'microsoft') {
						driveFileId = sale.driveFileId;
					} else {
						const ext = (sale.rawMimeType ?? '').split('/')[1] ?? 'bin';
						const safeTitle = (sale.documentTitle ?? 'sale').replace(/[^a-z0-9]/gi, '_');
						const fileName = `${safeTitle}_${saleId.slice(0, 8)}.${ext}`;
						driveFileId = await uploadFileToOneDrive(
							tok, uploadFolderId, fileName,
							sale.rawMimeType ?? 'application/octet-stream', fileBytes
						);
						await patch({ driveFileId, driveProvider: 'microsoft' });
					}

					if (!sale.sheetId || sale.sheetProvider !== 'microsoft') {
						const workbookId = await ensureSalesLedgerWorkbook(tok, salesRootId, year, salesLedgerWorkbookName(year));
						await ensureSalesMonthWorksheet(tok, workbookId, monthName);
						await patch({ sheetId: workbookId, sheetProvider: 'microsoft' });

						const [saleWithDriveId] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
						await appendSaleRowExcel(tok, workbookId, monthName, saleWithDriveId);
					}

					if (!wsCache.salesFolderId) {
						const newMeta = isPersonalWs
							? { ...meta, salesFolderId: salesRootId }
							: { ...meta, workspaceFolders: { ...meta.workspaceFolders, [wid]: { ...wsCache, salesFolderId: salesRootId } } };
						await db.update(schema.integration)
							.set({ metadataJson: JSON.stringify(newMeta) })
							.where(eq(schema.integration.id, integration.id));
					}
					break; // success
				} catch (err) {
					if (attempt === 0 && _isCloudAuthError(err)) {
						console.warn('[sales-committer] Microsoft 401 on attempt 0 — retrying with force-refresh');
						continue;
					}
					console.error('[sales-committer] Microsoft sync failed:', err);
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
