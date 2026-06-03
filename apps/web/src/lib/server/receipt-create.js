import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { batchInsert } from '$lib/server/db/batch-insert';
import { normalizeUnitType } from '$lib/server/unit-normalizer';
import { indexReceipt } from '$lib/server/vectorize';
import { logger } from '$lib/server/logger';

const LOG = '[receipt-create]';

/**
 * @typedef {{
 *   description?: string;
 *   qty?: string;
 *   unitPrice?: string;
 *   total?: string;
 *   unitSize?: string;
 *   unitType?: string;
 *   primaryCategory?: string;
 *   secondaryCategory?: string;
 * }} LineItemPayload
 *
 * @typedef {{
 *   merchant?:       string;
 *   receiptDate?:    string;  // YYYY-MM-DD
 *   total?:          string;
 *   subtotal?:       string;
 *   tax?:            string;
 *   tip?:            string;
 *   currency?:       string;
 *   paymentMethod?:  string;
 *   receiptNumber?:  string;
 *   invoiceNumber?:  string;
 *   category?:       string;
 *   notes?:          string;
 *   tags?:           string[];
 *   lineItems?:      LineItemPayload[];
 * }} ReceiptPayload
 */

/**
 * Persist an already-transcribed receipt directly and index it for vector search.
 *
 * Used by the external v1 API (where the GPT does the transcription itself) and
 * shareable with any future "manual entry" flow. Skips the upload-pipeline
 * specifics: no R2 object, no Gemini extraction, no duplicate-detection, no
 * authenticity assessment, no `aiExtractedJson` snapshot. Goes straight from
 * `pending` to `complete` because there is no review step required.
 *
 * @param {App.Platform | undefined} platform
 * @param {{ userId: string; workspaceId: string | null; source?: string }} ownership
 * @param {ReceiptPayload} payload
 * @returns {Promise<{ id: string; vectorId: string | null }>}
 */
export async function createReceiptFromTranscription(platform, ownership, payload) {
	const receiptId = crypto.randomUUID();
	const parsedDate = payload.receiptDate ? new Date(payload.receiptDate) : null;
	const receiptDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

	const tags        = Array.isArray(payload.tags) ? payload.tags : [];
	const lineItems   = Array.isArray(payload.lineItems) ? payload.lineItems : [];
	const receiptNum  = (payload.receiptNumber || '').trim() || null;
	const invoiceNum  = (payload.invoiceNumber || '').trim() || null;

	logger.info(LOG, 'inserting_receipt', { receiptId, userId: ownership.userId, source: ownership.source });

	await db.insert(schema.receipt).values({
		id:            receiptId,
		userId:        ownership.userId,
		workspaceId:   ownership.workspaceId,
		status:        'complete',
		merchantName:  payload.merchant      || null,
		receiptDate,
		total:         payload.total         || null,
		subtotal:      payload.subtotal      || null,
		tax:           payload.tax           || null,
		tip:           payload.tip           || null,
		currency:      payload.currency      || null,
		paymentMethod: payload.paymentMethod || null,
		receiptNumber: receiptNum,
		invoiceNumber: invoiceNum,
		category:      payload.category      || null,
		notes:         payload.notes         || null,
		tags:          JSON.stringify(tags),
		lineItemsJson: JSON.stringify(lineItems),
	});

	if (lineItems.length > 0) {
		const items = lineItems.map((li, i) => ({
			id:                crypto.randomUUID(),
			receiptId,
			description:       li.description       || null,
			qty:               li.qty               || null,
			unitPrice:         li.unitPrice         || null,
			total:             li.total             || null,
			unitSize:          li.unitSize          || null,
			unitType:          normalizeUnitType(li.unitType) || null,
			primaryCategory:   li.primaryCategory   || null,
			secondaryCategory: li.secondaryCategory || null,
			sortOrder:         i,
		}));
		await batchInsert(db, schema.receiptLineItem, items);
		logger.info(LOG, 'line_items_inserted', { receiptId, count: items.length });
	}

	// Index in Vectorize. Non-fatal if it fails — the row is still queryable
	// via the structured columns; semantic search just won't surface it.
	let vectorId = null;
	if (platform?.env?.VECTORIZE) {
		try {
			const [freshReceipt] = await db
				.select()
				.from(schema.receipt)
				.where(eq(schema.receipt.id, receiptId));
			vectorId = await indexReceipt(platform.env, freshReceipt);
			if (vectorId) {
				await db.update(schema.receipt)
					.set({ vectorId })
					.where(eq(schema.receipt.id, receiptId));
			}
		} catch (err) {
			logger.warn(LOG, 'vectorize_failed_non_fatal', { receiptId, err: String(err) });
		}
	}

	return { id: receiptId, vectorId };
}
