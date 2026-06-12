/**
 * Post-sync classifier — dedupe-driven, runs after `syncUserXero` has
 * inserted all rows.
 *
 * Why this exists: doing classification inline inside the per-invoice
 * insert path blew the Cloudflare Workers subrequest budget (1000 per
 * invocation on Paid). Each line did a Vectorize query, so 100 invoices
 * × 5 lines hit the cap before classification could finish.
 *
 * This pass:
 *   1. Loads every uncategorised standard line item for the user
 *      (receipt + sale).
 *   2. Groups by `workspaceId` and then by `description`, deduping
 *      identical descriptions across all invoices.
 *   3. Calls the embedding kNN once per unique description per
 *      workspace (`suggestCategoriesForLines` batches the embed +
 *      queries internally).
 *   4. For descriptions the kNN didn't classify confidently, falls
 *      through to Gemini in a single batched call per workspace.
 *   5. Applies the resulting (primary, secondary) tuple to ALL rows
 *      sharing that description in that workspace, stamping
 *      `aiSuggested = true`.
 *   6. For every parent receipt/sale touched, re-derives the header
 *      category from the now-categorised line items (mode of
 *      `primaryCategory` across `kind='standard'`).
 *
 * The dedupe step is what keeps subrequest count bounded: 50 invoices
 * with the same "Software subscription" line collapse into 1 query, not
 * 50.
 */

import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, isNull, or, inArray } from 'drizzle-orm';
import { suggestCategoriesForLines } from '$lib/server/vectorize';
import { classifyLineItemsViaGemini } from '$lib/server/gemini-classify';

/**
 * Cap unique descriptions per run so we leave headroom in the 1000
 * Cloudflare subrequest budget for D1 writes + Xero pagination on the
 * same invocation. If the user has more than this, the next sync (or
 * a manual classify-pending POST) picks up the rest.
 */
const MAX_UNIQUE_PER_RUN = 500;

/**
 * @typedef {{
 *   uniqueDescriptions: number,
 *   linesUpdated:       number,
 *   headersUpdated:     number,
 *   skipped:            number
 * }} ClassifySummary
 */

/**
 * Run the deduplicated classification pass for the user. Silently no-ops
 * when AI/Vectorize bindings aren't available.
 *
 * Observability: every log line carries a `runId` correlation tag and
 * the active `phase` so `wrangler tail` can be filtered to a single
 * run end-to-end. Callers can also pass `onProgress` to receive
 * structured phase updates — the AutoFix endpoint uses this to write
 * progress into `workspace.autofix_state` so the UI shows where the
 * run is at.
 *
 * @param {string} userId
 * @param {App.Platform['env'] | undefined} env
 * @param {{
 *   workspaceId?: string,
 *   stampAutofix?: boolean,
 *   runId?:       string,
 *   onProgress?:  (snapshot: ProgressSnapshot) => Promise<void> | void
 * }} [opts]
 *   - `workspaceId` — scope the pass to a single workspace (autofix flow).
 *     Omit for user-wide runs (post-sync flow).
 *   - `stampAutofix` — when true, every line item we update also gets an
 *     `autofixedAt: <ISO>` field written into the parent's denormalised
 *     `lineItemsJson` cache. Used by the AutoFix button so the UI / sync
 *     downstreams can tell which rows were touched by an explicit run.
 *   - `runId` — correlation tag attached to every log line; defaults to
 *     a fresh UUID.
 *   - `onProgress` — optional callback invoked between phases.
 * @returns {Promise<ClassifySummary>}
 */
export async function classifyPendingForUser(userId, env, opts = {}) {
	const runId = opts.runId ?? (crypto.randomUUID?.() ?? `run-${Date.now()}`);
	const t0 = Date.now();
	const baseCtx = { runId, userId, workspaceId: opts.workspaceId ?? null };
	const log = _makeLogger(baseCtx);
	/** @param {ProgressSnapshot} s */
	const reportProgress = async (s) => {
		if (!opts.onProgress) return;
		try { await opts.onProgress(s); } catch (/** @type {any} */ err) {
			log.warn({ phase: 'progress-callback', error: err?.message ?? String(err) });
		}
	};

	/** @type {ClassifySummary} */
	const summary = { uniqueDescriptions: 0, linesUpdated: 0, headersUpdated: 0, skipped: 0 };
	if (!env?.AI || !env?.VECTORIZE) {
		log.warn({ phase: 'guard', reason: 'AI or VECTORIZE binding missing — pass aborted' });
		return summary;
	}
	log.info({ phase: 'start', stampAutofix: opts.stampAutofix === true });
	await reportProgress({ phase: 'loading', updatedAt: new Date().toISOString() });

	const receiptWsFilter = opts.workspaceId ? [eq(schema.receipt.workspaceId, opts.workspaceId)] : [];
	const saleWsFilter    = opts.workspaceId ? [eq(schema.sale.workspaceId,    opts.workspaceId)] : [];

	const receiptLines = await db.select({
		id:               schema.receiptLineItem.id,
		description:      schema.receiptLineItem.description,
		receiptId:        schema.receiptLineItem.receiptId,
		workspaceId:      schema.receipt.workspaceId,
		merchant:         schema.receipt.merchantName
	})
		.from(schema.receiptLineItem)
		.innerJoin(schema.receipt, eq(schema.receipt.id, schema.receiptLineItem.receiptId))
		.where(and(
			eq(schema.receipt.userId, userId),
			eq(schema.receiptLineItem.kind, 'standard'),
			or(
				isNull(schema.receiptLineItem.primaryCategory),
				isNull(schema.receiptLineItem.secondaryCategory)
			),
			...receiptWsFilter
		));

	const saleLines = await db.select({
		id:               schema.saleLineItem.id,
		description:      schema.saleLineItem.description,
		saleId:           schema.saleLineItem.saleId,
		workspaceId:      schema.sale.workspaceId,
		merchant:         schema.sale.documentTitle
	})
		.from(schema.saleLineItem)
		.innerJoin(schema.sale, eq(schema.sale.id, schema.saleLineItem.saleId))
		.where(and(
			eq(schema.sale.userId, userId),
			eq(schema.saleLineItem.kind, 'standard'),
			or(
				isNull(schema.saleLineItem.primaryCategory),
				isNull(schema.saleLineItem.secondaryCategory)
			),
			...saleWsFilter
		));

	log.info({
		phase:         'loaded',
		receiptLines:  receiptLines.length,
		saleLines:     saleLines.length,
		elapsedMs:     Date.now() - t0
	});
	if (receiptLines.length === 0 && saleLines.length === 0) {
		log.info({ phase: 'done', reason: 'no pending lines', elapsedMs: Date.now() - t0, summary });
		return summary;
	}

	// Bucket by workspaceId.
	/** @type {Map<string | null, { receipts: typeof receiptLines, sales: typeof saleLines }>} */
	const byWs = new Map();
	for (const r of receiptLines) {
		const wsId = r.workspaceId ?? null;
		let bucket = byWs.get(wsId);
		if (!bucket) { bucket = { receipts: [], sales: [] }; byWs.set(wsId, bucket); }
		bucket.receipts.push(r);
	}
	for (const s of saleLines) {
		const wsId = s.workspaceId ?? null;
		let bucket = byWs.get(wsId);
		if (!bucket) { bucket = { receipts: [], sales: [] }; byWs.set(wsId, bucket); }
		bucket.sales.push(s);
	}

	/** Track parent IDs whose lines just got categorised so we re-derive headers. */
	const dirtyReceiptIds = new Set();
	const dirtySaleIds = new Set();

	/** Track the SPECIFIC line-item IDs we updated, for the autofixedAt stamp. */
	/** @type {Set<string>} */ const touchedReceiptLineIds = new Set();
	/** @type {Set<string>} */ const touchedSaleLineIds = new Set();

	let budget = MAX_UNIQUE_PER_RUN;
	let workspaceIndex = 0;
	const workspaceCount = byWs.size;

	for (const [workspaceId, group] of byWs) {
		workspaceIndex++;
		if (budget <= 0) {
			log.warn({ phase: 'budget-exhausted', workspaceId, workspaceIndex, workspaceCount, remainingBudget: budget });
			break;
		}

		// Dedupe by description. Empty / null descriptions don't carry signal.
		/** @type {Map<string, { receiptIds: string[], saleIds: string[] }>} */
		const byDesc = new Map();
		for (const r of group.receipts) {
			const desc = (r.description ?? '').trim();
			if (!desc) { summary.skipped++; continue; }
			let bucket = byDesc.get(desc);
			if (!bucket) { bucket = { receiptIds: [], saleIds: [] }; byDesc.set(desc, bucket); }
			bucket.receiptIds.push(r.id);
		}
		for (const s of group.sales) {
			const desc = (s.description ?? '').trim();
			if (!desc) { summary.skipped++; continue; }
			let bucket = byDesc.get(desc);
			if (!bucket) { bucket = { receiptIds: [], saleIds: [] }; byDesc.set(desc, bucket); }
			bucket.saleIds.push(s.id);
		}
		if (byDesc.size === 0) {
			log.info({ phase: 'workspace-empty', workspaceId, workspaceIndex, workspaceCount });
			continue;
		}

		// Trim to remaining budget.
		const unique = [...byDesc.keys()].slice(0, budget);
		budget -= unique.length;
		summary.uniqueDescriptions += unique.length;
		log.info({
			phase:          'workspace-start',
			workspaceId,
			workspaceIndex,
			workspaceCount,
			uniqueDescriptions: unique.length,
			remainingBudget: budget
		});
		await reportProgress({
			phase: 'embeddings',
			workspaceIndex, workspaceCount, uniqueDescriptions: unique.length,
			linesUpdated: summary.linesUpdated,
			updatedAt: new Date().toISOString()
		});

		// Hop 1: embeddings.
		const embStart = Date.now();
		/** @type {Array<{ primary: string, secondary: string } | null>} */
		let embSuggestions = unique.map(() => null);
		try {
			const results = await suggestCategoriesForLines(env, {
				userId,
				workspaceId,
				merchant: null
			}, unique.map((d) => ({ description: d })));
			embSuggestions = results.map((r) => r ? { primary: r.primary, secondary: r.secondary } : null);
			const hits = embSuggestions.filter(Boolean).length;
			log.info({ phase: 'embeddings-done', workspaceId, hits, queried: unique.length, elapsedMs: Date.now() - embStart });
		} catch (/** @type {any} */ err) {
			log.warn({ phase: 'embeddings-failed', workspaceId, error: err?.message ?? String(err), elapsedMs: Date.now() - embStart });
		}

		// Hop 2: Gemini for descriptions the kNN couldn't classify.
		const pendingIndexes = embSuggestions
			.map((s, i) => (s ? -1 : i))
			.filter((i) => i >= 0);
		if (pendingIndexes.length > 0) {
			const geminiStart = Date.now();
			log.info({ phase: 'gemini-start', workspaceId, items: pendingIndexes.length });
			await reportProgress({
				phase: 'gemini',
				workspaceIndex, workspaceCount,
				uniqueDescriptions: unique.length,
				geminiPending: pendingIndexes.length,
				linesUpdated: summary.linesUpdated,
				updatedAt: new Date().toISOString()
			});
			try {
				const items = pendingIndexes.map((i) => ({ description: unique[i] }));
				const gemini = await classifyLineItemsViaGemini({
					userId,
					workspaceId,
					items
				});
				let hits = 0;
				for (let k = 0; k < pendingIndexes.length; k++) {
					const s = gemini[k];
					if (s) { embSuggestions[pendingIndexes[k]] = s; hits++; }
				}
				log.info({ phase: 'gemini-done', workspaceId, hits, items: pendingIndexes.length, elapsedMs: Date.now() - geminiStart });
			} catch (/** @type {any} */ err) {
				log.warn({ phase: 'gemini-failed', workspaceId, error: err?.message ?? String(err), elapsedMs: Date.now() - geminiStart });
			}
		} else {
			log.info({ phase: 'gemini-skipped', workspaceId, reason: 'embeddings covered everything' });
		}

		// Apply: one UPDATE per unique description, against all matching rows.
		const applyStart = Date.now();
		await reportProgress({
			phase: 'applying',
			workspaceIndex, workspaceCount,
			uniqueDescriptions: unique.length,
			linesUpdated: summary.linesUpdated,
			updatedAt: new Date().toISOString()
		});
		for (let i = 0; i < unique.length; i++) {
			const s = embSuggestions[i];
			if (!s) continue;
			const ids = byDesc.get(unique[i]);
			if (!ids) continue;
			if (ids.receiptIds.length > 0) {
				await db.update(schema.receiptLineItem)
					.set({ primaryCategory: s.primary, secondaryCategory: s.secondary, aiSuggested: true })
					.where(inArray(schema.receiptLineItem.id, ids.receiptIds));
				summary.linesUpdated += ids.receiptIds.length;
				for (const lineId of ids.receiptIds) touchedReceiptLineIds.add(lineId);
				for (const r of group.receipts) {
					if (ids.receiptIds.includes(r.id)) dirtyReceiptIds.add(r.receiptId);
				}
			}
			if (ids.saleIds.length > 0) {
				await db.update(schema.saleLineItem)
					.set({ primaryCategory: s.primary, secondaryCategory: s.secondary, aiSuggested: true })
					.where(inArray(schema.saleLineItem.id, ids.saleIds));
				summary.linesUpdated += ids.saleIds.length;
				for (const lineId of ids.saleIds) touchedSaleLineIds.add(lineId);
				for (const s2 of group.sales) {
					if (ids.saleIds.includes(s2.id)) dirtySaleIds.add(s2.saleId);
				}
			}
		}
		log.info({
			phase:          'workspace-applied',
			workspaceId,
			workspaceIndex,
			workspaceCount,
			linesUpdated:   summary.linesUpdated,
			elapsedMs:      Date.now() - applyStart
		});
	}

	// Re-derive document-level category for every touched parent whose
	// header is still null. Mode of primaryCategory across standard rows.
	const headerStart = Date.now();
	await reportProgress({
		phase: 'deriving-headers',
		dirtyReceipts: dirtyReceiptIds.size,
		dirtySales:    dirtySaleIds.size,
		linesUpdated:  summary.linesUpdated,
		updatedAt:     new Date().toISOString()
	});
	for (const receiptId of dirtyReceiptIds) {
		const updated = await _redriveHeaderCategoryForReceipt(receiptId);
		if (updated) summary.headersUpdated++;
	}
	for (const saleId of dirtySaleIds) {
		const updated = await _redriveHeaderCategoryForSale(saleId);
		if (updated) summary.headersUpdated++;
	}
	log.info({
		phase:          'headers-done',
		headersUpdated: summary.headersUpdated,
		dirtyReceipts:  dirtyReceiptIds.size,
		dirtySales:     dirtySaleIds.size,
		elapsedMs:      Date.now() - headerStart
	});

	// AutoFix stamp: refresh each touched parent's `lineItemsJson` cache
	// with an `autofixedAt` field on every row we updated. Lets the UI +
	// downstream sync see which lines this AutoFix run actually changed.
	if (opts.stampAutofix && (touchedReceiptLineIds.size > 0 || touchedSaleLineIds.size > 0)) {
		const stampStart = Date.now();
		await reportProgress({
			phase: 'stamping',
			dirtyReceipts: dirtyReceiptIds.size,
			dirtySales:    dirtySaleIds.size,
			linesUpdated:  summary.linesUpdated,
			updatedAt:     new Date().toISOString()
		});
		const stamp = new Date().toISOString();
		for (const receiptId of dirtyReceiptIds) {
			await _stampReceiptLineItemsJson(/** @type {string} */ (receiptId), touchedReceiptLineIds, stamp);
		}
		for (const saleId of dirtySaleIds) {
			await _stampSaleLineItemsJson(/** @type {string} */ (saleId), touchedSaleLineIds, stamp);
		}
		log.info({ phase: 'stamp-done', elapsedMs: Date.now() - stampStart });
	}

	log.info({ phase: 'done', summary, elapsedMs: Date.now() - t0 });
	return summary;
}

/**
 * @typedef {{
 *   phase:               'loading' | 'embeddings' | 'gemini' | 'applying' | 'deriving-headers' | 'stamping',
 *   workspaceIndex?:     number,
 *   workspaceCount?:     number,
 *   uniqueDescriptions?: number,
 *   geminiPending?:      number,
 *   dirtyReceipts?:      number,
 *   dirtySales?:         number,
 *   linesUpdated?:       number,
 *   updatedAt:           string
 * }} ProgressSnapshot
 */

/**
 * Tiny structured logger that prefixes every emitted line with a JSON
 * blob carrying the correlation context (runId / userId / workspaceId).
 * `wrangler tail` can grep by `runId=…` to follow a single AutoFix run
 * end-to-end across all phases.
 *
 * @param {{ runId: string, userId: string, workspaceId: string | null }} baseCtx
 */
function _makeLogger(baseCtx) {
	/** @param {Record<string, unknown>} fields */
	const fmt = (fields) => `[post-sync-classify] ${JSON.stringify({ ...baseCtx, ...fields })}`;
	return {
		/** @param {Record<string, unknown>} fields */
		info: (fields) => { console.log(fmt(fields)); },
		/** @param {Record<string, unknown>} fields */
		warn: (fields) => { console.warn(fmt(fields)); },
		/** @param {Record<string, unknown>} fields */
		error: (fields) => { console.error(fmt(fields)); }
	};
}

/**
 * Refresh a receipt's `lineItemsJson` cache so the touched lines carry an
 * `autofixedAt` field. Re-reads the lines from the source-of-truth table
 * (so categories the post-sync pass just wrote are visible) and writes
 * back the serialised array.
 *
 * @param {string} receiptId
 * @param {Set<string>} touchedLineIds
 * @param {string} stamp ISO timestamp
 */
async function _stampReceiptLineItemsJson(receiptId, touchedLineIds, stamp) {
	const lines = await db.select()
		.from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receiptId));

	const serialised = lines.map((r) => {
		/** @type {Record<string, unknown>} */
		const entry = {
			id:                r.id,
			description:       r.description,
			qty:               r.qty,
			unitPrice:         r.unitPrice,
			total:             r.total,
			primaryCategory:   r.primaryCategory,
			secondaryCategory: r.secondaryCategory,
			kind:              r.kind
		};
		if (touchedLineIds.has(r.id)) entry.autofixedAt = stamp;
		return entry;
	});

	await db.update(schema.receipt)
		.set({ lineItemsJson: JSON.stringify(serialised) })
		.where(eq(schema.receipt.id, receiptId));
}

/**
 * Sale-side mirror of `_stampReceiptLineItemsJson`.
 *
 * @param {string} saleId
 * @param {Set<string>} touchedLineIds
 * @param {string} stamp ISO timestamp
 */
async function _stampSaleLineItemsJson(saleId, touchedLineIds, stamp) {
	const lines = await db.select()
		.from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, saleId));

	const serialised = lines.map((r) => {
		/** @type {Record<string, unknown>} */
		const entry = {
			id:                r.id,
			description:       r.description,
			unitsSold:         r.unitsSold,
			sellPrice:         r.sellPrice,
			total:             r.total,
			primaryCategory:   r.primaryCategory,
			secondaryCategory: r.secondaryCategory,
			kind:              r.kind
		};
		if (touchedLineIds.has(r.id)) entry.autofixedAt = stamp;
		return entry;
	});

	await db.update(schema.sale)
		.set({ lineItemsJson: JSON.stringify(serialised) })
		.where(eq(schema.sale.id, saleId));
}

/**
 * @param {string} receiptId
 * @returns {Promise<boolean>} whether a header update occurred
 */
async function _redriveHeaderCategoryForReceipt(receiptId) {
	const [receipt] = await db.select({ id: schema.receipt.id, category: schema.receipt.category })
		.from(schema.receipt)
		.where(eq(schema.receipt.id, receiptId));
	if (!receipt || receipt.category) return false;

	const lines = await db.select({
		primaryCategory: schema.receiptLineItem.primaryCategory,
		kind: schema.receiptLineItem.kind
	})
		.from(schema.receiptLineItem)
		.where(eq(schema.receiptLineItem.receiptId, receiptId));

	const mode = _modePrimary(lines);
	if (!mode) return false;

	await db.update(schema.receipt).set({ category: mode })
		.where(eq(schema.receipt.id, receiptId));
	return true;
}

/**
 * @param {string} saleId
 * @returns {Promise<boolean>} whether a header update occurred
 */
async function _redriveHeaderCategoryForSale(saleId) {
	const [sale] = await db.select({ id: schema.sale.id, category: schema.sale.category })
		.from(schema.sale)
		.where(eq(schema.sale.id, saleId));
	if (!sale || sale.category) return false;

	const lines = await db.select({
		primaryCategory: schema.saleLineItem.primaryCategory,
		kind: schema.saleLineItem.kind
	})
		.from(schema.saleLineItem)
		.where(eq(schema.saleLineItem.saleId, saleId));

	const mode = _modePrimary(lines);
	if (!mode) return false;

	await db.update(schema.sale).set({ category: mode })
		.where(eq(schema.sale.id, saleId));
	return true;
}

/**
 * @param {Array<{ primaryCategory: string | null, kind: string }>} lines
 * @returns {string | null}
 */
function _modePrimary(lines) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const li of lines) {
		if (li.kind !== 'standard') continue;
		const p = li.primaryCategory;
		if (!p) continue;
		counts.set(p, (counts.get(p) ?? 0) + 1);
	}
	if (counts.size === 0) return null;
	let winner = '';
	let best = 0;
	for (const [p, n] of counts) if (n > best) { best = n; winner = p; }
	return winner || null;
}
