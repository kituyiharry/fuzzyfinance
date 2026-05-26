import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';
import { extractSaleData } from '$lib/server/sales-gemini';
import { indexSale } from '$lib/server/vectorize';
import { logger } from '$lib/server/logger';
import { batchInsert } from '$lib/server/db/batch-insert';
import { getGeminiAccessToken } from '$lib/server/token-refresh';
import { normalizeUnitType } from '$lib/server/unit-normalizer';

const LOG = '[sales-processor]';

/**
 * Background processor for a sale document.
 * Runs after upload via ctx.waitUntil().
 *
 * @param {App.Platform['env']} env
 * @param {string} saleId
 */
export async function processSale(env, saleId) {
	/** @param {Partial<typeof schema.sale.$inferInsert>} data */
	const patch = (data) => db.update(schema.sale).set(data).where(eq(schema.sale.id, saleId));

	// ── Step 1: Load sale from DB ──────────────────────────────────────────
	const [sale] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
	if (!sale) {
		logger.error(LOG, 'sale not found', { saleId });
		return;
	}

	logger.info(LOG, 'start', { saleId });
	await patch({ status: 'processing' });

	// ── Step 2: Fetch file bytes from R2 ───────────────────────────────────
	let fileBytes;
	try {
		const obj = await env.fuzzyfinance_receipts.get(sale.r2Key ?? '');
		if (!obj) throw new Error(`R2 object not found -> Key: ${sale.r2Key}`);
		fileBytes = await obj.arrayBuffer();
		logger.info(LOG, 'r2_fetched', { saleId, bytes: fileBytes.byteLength });
	} catch (err) {
		logger.error(LOG, 'r2_fetch_failed', { saleId, r2Key: sale.r2Key, err: String(err) });
		await patch({ status: 'failed', errorMessage: String(err) });
		return;
	}

	// ── Step 3: AI extraction ──────────────────────────────────────────────
	const geminiToken = await getGeminiAccessToken(sale.userId ?? '');
	if (geminiToken) logger.info(LOG, 'using_oauth_token', { saleId });

	let extraction;
	try {
		extraction = await extractSaleData(fileBytes, sale.rawMimeType ?? 'image/jpeg', geminiToken);
		logger.info(LOG, 'extracted', { saleId, documentTitle: extraction.documentTitle, totalRevenue: extraction.totalRevenue, itemCount: extraction.lineItems?.length ?? 0 });
	} catch (/** @type {any} */ err) {
		logger.error(LOG, 'extraction_failed', { saleId, code: err?.code, err: String(err) });
		if (err?.code === 'RATE_LIMITED') {
			await patch({ status: 'failed', errorMessage: 'Gemini API rate limit reached. Please re-upload this document in a few minutes.' });
		} else if (err?.code === 'NOT_RELEVANT') {
			await patch({ status: 'failed', errorMessage: `NOT_RELEVANT: ${err.message}` });
		} else if (err?.code === 'TIMED_OUT') {
			await patch({ status: 'failed', errorMessage: 'Extraction timed out. Please re-upload this document.' });
		} else {
			await patch({ status: 'failed', errorMessage: `Extraction failed: ${err}` });
		}
		return;
	}

	// ── Step 4: Persist extracted data ────────────────────────────────────
	const saleDate = extraction.date ? new Date(extraction.date) : null;
	const lineItemsJson = JSON.stringify(extraction.lineItems ?? []);

	const aiExtractedJson = JSON.stringify({
		documentTitle: (extraction.documentTitle || '').trim() || null,
		date:          extraction.date,
		totalRevenue:  (extraction.totalRevenue || '').trim() || null,
		totalCost:     (extraction.totalCost || '').trim() || null,
		totalMargin:   (extraction.totalMargin || '').trim() || null,
		currency:      (extraction.currency || '').trim() || null,
		category:      (extraction.category || '').trim() || null,
		notes:         (extraction.notes || '').trim() || null,
		tags:          extraction.tags ?? [],
		lineItems:     extraction.lineItems ?? [],
	});

	logger.info(LOG, 'persisting_data', { saleId });
	try {
		await patch({
			documentTitle: (extraction.documentTitle || '').trim() || null,
			saleDate:      saleDate ?? null,
			totalRevenue:  (extraction.totalRevenue || '').trim() || null,
			totalCost:     (extraction.totalCost || '').trim() || null,
			totalMargin:   (extraction.totalMargin || '').trim() || null,
			currency:      (extraction.currency || '').trim() || null,
			category:      (extraction.category || '').trim() || null,
			notes:         (extraction.notes || '').trim() || null,
			tags:          JSON.stringify(extraction.tags ?? []),
			lineItemsJson,
			aiExtractedJson,
		});
	} catch (err) {
		logger.error(LOG, 'db_patch_failed', { saleId, err: String(err) });
		await patch({ status: 'failed', errorMessage: `DB update failed: ${err}` });
		return;
	}

	// ── Step 5: Persist line items ────────────────────────────────────────
	try {
		await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, saleId));

		if (extraction.lineItems?.length) {
			const items = extraction.lineItems.map((li, i) => ({
				id:                crypto.randomUUID(),
				saleId,
				description:       (li.description || '').trim() || null,
				type:              li.type || null,
				unitsSold:         (li.unitsSold || '').trim() || null,
				buyPrice:          (li.buyPrice || '').trim() || null,
				sellPrice:         (li.sellPrice || '').trim() || null,
				margin:            (li.margin || '').trim() || null,
				total:             (li.total || '').trim() || null,
				totalCost:         (li.totalCost || '').trim() || null,
				unitSize:          (li.unitSize || '').trim() || null,
				unitType:          normalizeUnitType(li.unitType) || null,
				primaryCategory:   li.primaryCategory   || null,
				secondaryCategory: li.secondaryCategory || null,
				sortOrder:         i,
			}));
			logger.info(LOG, 'inserting_line_items', { saleId, count: items.length });
			await batchInsert(db, schema.saleLineItem, items);
			logger.info(LOG, 'line_items_inserted', { saleId });
		}
	} catch (err) {
		logger.error(LOG, 'line_items_insert_failed', { saleId, err: String(err) });
		// Non-fatal — continue to vectorize
	}

	// ── Step 6: Vectorize ─────────────────────────────────────────────────
	const [freshSale] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId));
	let vectorId = null;
	try {
		vectorId = await indexSale(env, freshSale);
		logger.info(LOG, 'vectorized', { saleId, vectorId });
	} catch (err) {
		logger.warn(LOG, 'vectorize_failed_non_fatal', { saleId, err: String(err) });
	}

	// ── Step 7: Mark staged ───────────────────────────────────────────────
	await patch({ status: 'staged', vectorId });
	logger.info(LOG, 'staged', { saleId });
}
