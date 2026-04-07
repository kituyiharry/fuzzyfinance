import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { extractReceiptData } from '$lib/server/gemini';
import { getValidAccessToken } from '$lib/server/token-refresh';
import { ensureReceiptFolder as driveFolder, uploadFileToDrive } from '$lib/server/google-drive';
import { ensureLedgerSheet, appendReceiptRow } from '$lib/server/google-sheets';
import { ensureReceiptFolder as oneDriveFolder, uploadFileToOneDrive, ensureLedgerWorkbook, appendReceiptRowExcel } from '$lib/server/onedrive';
import { indexReceipt } from '$lib/server/vectorize';

/**
 * Full receipt processing pipeline. Called via ctx.waitUntil() so it runs
 * as a background task after the HTTP response is sent.
 *
 * Steps:
 *  1. Fetch file bytes from R2
 *  2. Gemini AI extraction
 *  3. Persist extracted data + line items to DB
 *  4. Vectorize indexing
 *  5. Cloud storage + spreadsheet sync (Google or Microsoft)
 *  6. Delete R2 object
 *  7. Mark receipt complete
 *
 * @param {App.Platform['env']} env
 * @param {string} receiptId
 */
export async function processReceipt(env, receiptId) {
	/** @param {Partial<typeof schema.receipt.$inferInsert>} patch */
	const patch = (data) =>
		db.update(schema.receipt).set(data).where(eq(schema.receipt.id, receiptId));

	// ── Step 0: load receipt row ────────────────────────────────────────
	const [receipt] = await db
		.select()
		.from(schema.receipt)
		.where(eq(schema.receipt.id, receiptId));

	if (!receipt) {
		console.error(`[receipt-processor] Receipt ${receiptId} not found`);
		return;
	}

	await patch({ status: 'processing' });

	// ── Step 1: fetch file from R2 ──────────────────────────────────────
	let fileBytes;
	try {
		const obj = await env.RECEIPT_BUCKET.get(receipt.r2Key ?? '');
		if (!obj) throw new Error('R2 object not found');
		fileBytes = await obj.arrayBuffer();
	} catch (err) {
		console.error('[receipt-processor] R2 fetch failed:', err);
		await patch({ status: 'failed', errorMessage: String(err) });
		return;
	}

	// ── Step 2: AI extraction ──────────────────────────────────────────
	let extraction;
	try {
		extraction = await extractReceiptData(fileBytes, receipt.rawMimeType ?? 'image/jpeg');
	} catch (err) {
		console.error('[receipt-processor] Gemini extraction failed:', err);
		await patch({ status: 'failed', errorMessage: `Extraction failed: ${err}` });
		return;
	}

	// ── Step 3: persist extracted data ─────────────────────────────────
	const receiptDate = extraction.date ? new Date(extraction.date) : null;
	const lineItemsJson = JSON.stringify(extraction.lineItems ?? []);

	await patch({
		status:        'processing',
		merchantName:  extraction.merchant   || null,
		receiptDate:   receiptDate && !isNaN(receiptDate.getTime()) ? receiptDate : null,
		total:         extraction.total       || null,
		subtotal:      extraction.subtotal    || null,
		tax:           extraction.tax         || null,
		tip:           extraction.tip         || null,
		currency:      extraction.currency    || null,
		paymentMethod: extraction.paymentMethod || null,
		category:      extraction.category    || null,
		notes:         extraction.notes       || null,
		lineItemsJson
	});

	// Persist normalised line items
	if (extraction.lineItems?.length) {
		const items = extraction.lineItems.map((li, i) => ({
			id:          crypto.randomUUID(),
			receiptId,
			description: li.description || null,
			qty:         li.qty         || null,
			unitPrice:   li.unitPrice   || null,
			total:       li.total       || null,
			sortOrder:   i
		}));
		await db.insert(schema.receiptLineItem).values(items);
	}

	// ── Step 4: vectorize ──────────────────────────────────────────────
	const [freshReceipt] = await db
		.select()
		.from(schema.receipt)
		.where(eq(schema.receipt.id, receiptId));

	let vectorId = null;
	try {
		vectorId = await indexReceipt(env, freshReceipt);
	} catch (err) {
		// Non-fatal — search just won't include this receipt
		console.warn('[receipt-processor] Vectorize failed (non-fatal):', err);
	}

	if (vectorId) await patch({ vectorId });

	// ── Step 5: cloud sync ─────────────────────────────────────────────
	// Find connected integrations for this user
	const integrations = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, receipt.userId));

	let driveFileId   = null;
	let driveProvider = null;
	let sheetId       = null;
	let sheetProvider = null;
	let syncError     = null;

	for (const integration of integrations) {
		const provider = /** @type {'google' | 'microsoft'} */ (integration.provider);

		let accessToken;
		try {
			accessToken = await getValidAccessToken(receipt.userId, provider);
		} catch (err) {
			console.warn(`[receipt-processor] Could not get token for ${provider}:`, err);
			continue;
		}
		if (!accessToken) continue;

		/** @type {{ folderId?: string; ledgerFileId?: string }} */
		const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};

		if (provider === 'google') {
			try {
				// Ensure folder
				const folderId = meta.folderId ?? await driveFolder(accessToken);

				// Upload file
				const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
				const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
				const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
				driveFileId = await uploadFileToDrive(accessToken, folderId, fileName, receipt.rawMimeType ?? 'application/octet-stream', fileBytes);
				driveProvider = 'google';

				// Ensure ledger sheet
				const ledgerFileId = meta.ledgerFileId ?? await ensureLedgerSheet(accessToken, folderId);
				sheetId       = ledgerFileId;
				sheetProvider = 'google';

				// Update receipt with driveFileId before appending row (sheet row includes it)
				await patch({ driveFileId, driveProvider: 'google', sheetId, sheetProvider: 'google' });

				const [receiptWithDriveId] = await db
					.select()
					.from(schema.receipt)
					.where(eq(schema.receipt.id, receiptId));
				await appendReceiptRow(accessToken, ledgerFileId, receiptWithDriveId);

				// Cache folder + ledger IDs on the integration row
				if (!meta.folderId || !meta.ledgerFileId) {
					await db.update(schema.integration)
						.set({ metadataJson: JSON.stringify({ folderId, ledgerFileId }) })
						.where(eq(schema.integration.id, integration.id));
				}
			} catch (err) {
				console.error('[receipt-processor] Google sync failed:', err);
				syncError = String(err);
			}
		}

		if (provider === 'microsoft') {
			try {
				const folderId = meta.folderId ?? await oneDriveFolder(accessToken);
				const ext = (receipt.rawMimeType ?? '').split('/')[1] ?? 'bin';
				const safeMerchant = (receipt.merchantName ?? 'receipt').replace(/[^a-z0-9]/gi, '_');
				const fileName = `${safeMerchant}_${receiptId.slice(0, 8)}.${ext}`;
				driveFileId = await uploadFileToOneDrive(accessToken, folderId, fileName, receipt.rawMimeType ?? 'application/octet-stream', fileBytes);
				driveProvider = 'microsoft';

				const workbookId = meta.ledgerFileId ?? await ensureLedgerWorkbook(accessToken, folderId);
				sheetId       = workbookId;
				sheetProvider = 'microsoft';

				await patch({ driveFileId, driveProvider: 'microsoft', sheetId, sheetProvider: 'microsoft' });

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
				console.error('[receipt-processor] Microsoft sync failed:', err);
				syncError = String(err);
			}
		}
	}

	// ── Step 6: delete R2 object ───────────────────────────────────────
	try {
		await env.RECEIPT_BUCKET.delete(receipt.r2Key ?? '');
	} catch (err) {
		console.warn('[receipt-processor] R2 delete failed (non-fatal):', err);
	}

	// ── Step 7: final status ───────────────────────────────────────────
	const hasSync = integrations.length > 0;
	const finalStatus = hasSync && syncError && !driveFileId ? 'complete_no_sync' : 'complete';

	await patch({
		status: finalStatus,
		...(syncError && !driveFileId ? { errorMessage: syncError } : {})
	});
}
