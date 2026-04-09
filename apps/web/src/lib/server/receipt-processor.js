import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, ne } from 'drizzle-orm';
import { extractReceiptData } from '$lib/server/gemini';
import { indexReceipt } from '$lib/server/vectorize';

/**
 * Full receipt processing pipeline. Called via ctx.waitUntil() so it runs
 * as a background task after the HTTP response is sent.
 *
 * Steps:
 *  1. Fetch file bytes from R2
 *  2. Gemini AI extraction
 *  3. Persist extracted data + line items to DB (saves aiExtractedJson snapshot)
 *  4. Vectorize indexing
 *  5. Set status to 'staged' — R2 kept for Drive upload at commit time
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
		const obj = await env.fuzzyfinance_receipts.get(receipt.r2Key ?? '');
		if (!obj) throw new Error(`R2 object not found -> ID: ${receipt.r2Key}`);
		fileBytes = await obj.arrayBuffer();
	} catch (err) {
		console.error(`[receipt-processor] R2 fetch failed: ID: ${receipt.r2Key}`, err);
		await patch({ status: 'failed', errorMessage: String(err) });
		return;
	}

	// ── Step 2: AI extraction ──────────────────────────────────────────
	let extraction;
	try {
		extraction = await extractReceiptData(fileBytes, receipt.rawMimeType ?? 'image/jpeg');
	} catch (/** @type {any} */ err) {
		console.error('[receipt-processor] Gemini extraction failed:', err);
		if (err?.code === 'RATE_LIMITED') {
			await patch({ status: 'failed', errorMessage: 'Gemini API rate limit reached. Please re-upload this receipt in a few minutes.' });
		} else {
			await patch({ status: 'failed', errorMessage: `Extraction failed: ${err}` });
		}
		return;
	}

	// ── Step 3: persist extracted data ─────────────────────────────────
	const receiptDate = extraction.date ? new Date(extraction.date) : null;
	const lineItemsJson = JSON.stringify(extraction.lineItems ?? []);

	const receiptNum = (extraction.receiptNumber || '').trim() || null;
	const invoiceNum = (extraction.invoiceNumber || '').trim() || null;

	// Snapshot of raw AI output — used to compute correctedFields when user edits
	const aiExtractedJson = JSON.stringify({
		merchantName:  extraction.merchant     || null,
		receiptDate:   extraction.date         || null,  // raw ISO string for diffing
		total:         extraction.total        || null,
		subtotal:      extraction.subtotal     || null,
		tax:           extraction.tax          || null,
		tip:           extraction.tip          || null,
		currency:      extraction.currency     || null,
		paymentMethod: extraction.paymentMethod || null,
		receiptNumber: receiptNum,
		invoiceNumber: invoiceNum,
		category:      extraction.category     || null,
		notes:         extraction.notes        || null,
		tags:          extraction.tags         ?? [],
		lineItems:     extraction.lineItems    ?? []
	});

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
		receiptNumber: receiptNum,
		invoiceNumber: invoiceNum,
		category:      extraction.category    || null,
		notes:         extraction.notes       || null,
		tags:          JSON.stringify(extraction.tags ?? []),
		lineItemsJson,
		aiExtractedJson
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

	// ── Step 3.5: Stage 2 — receipt identifier dedup ──────────────────
	let duplicateOf = null;

	if (receiptNum) {
		const [rMatch] = await db
			.select({ id: schema.receipt.id })
			.from(schema.receipt)
			.where(and(
				eq(schema.receipt.userId, receipt.userId),
				eq(schema.receipt.receiptNumber, receiptNum),
				ne(schema.receipt.id, receiptId)
			))
			.limit(1);
		if (rMatch) duplicateOf = rMatch.id;
	}

	if (!duplicateOf && invoiceNum) {
		const [iMatch] = await db
			.select({ id: schema.receipt.id })
			.from(schema.receipt)
			.where(and(
				eq(schema.receipt.userId, receipt.userId),
				eq(schema.receipt.invoiceNumber, invoiceNum),
				ne(schema.receipt.id, receiptId)
			))
			.limit(1);
		if (iMatch) duplicateOf = iMatch.id;
	}

	if (duplicateOf) {
		await patch({ duplicateOf });
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

	// ── Step 5: stage for user review ─────────────────────────────────────
	// R2 object intentionally kept — commitReceipt() will upload it to Drive then delete it
	await patch({ status: 'staged' });
}
