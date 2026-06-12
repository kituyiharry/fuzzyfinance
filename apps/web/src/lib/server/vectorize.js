/**
 * Embeds the receipt text and upserts it into Cloudflare Vectorize.
 *
 * @param {App.Platform['env']} env
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {Promise<string>} the vector ID (same as receipt.id)
 */
export async function indexReceipt(env, receipt) {
	const text = _buildIndexText(receipt);

	// Generate embedding via Workers AI
	/** @type {{ data: number[][] }} */
	const embeddingResult = await env.AI.run('@cf/google/embeddinggemma-300m', {
		text: [text]
	});

	const vector = embeddingResult.data[0];

	await env.VECTORIZE.upsert([
		{
			id: receipt.id,
			values: vector,
			metadata: {
				userId:       receipt.userId,
				merchant:     receipt.merchantName ?? '',
				date:         receipt.receiptDate
					? new Date(receipt.receiptDate).toISOString().slice(0, 10)
					: '',
				total:        receipt.total    ?? '',
				currency:     receipt.currency ?? '',
				category:     receipt.category ?? ''
			}
		}
	]);

	return receipt.id;
}

/**
 * Semantic receipt search for a user.
 *
 * @param {App.Platform['env']} env
 * @param {string} userId
 * @param {string} query
 * @param {number} [topK=10]
 * @returns {Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>>}
 */
export async function searchReceipts(env, userId, query, topK = 10) {
	/** @type {{ data: number[][] }} */
	const embeddingResult = await env.AI.run('@cf/google/embeddinggemma-300m', {
		text: [query]
	});

	const queryVector = embeddingResult.data[0];

	const result = await env.VECTORIZE.query(queryVector, {
		topK,
		filter: { userId },
		returnMetadata: 'all'
	});

	return (result.matches ?? []).map((m) => ({
		id:       m.id,
		score:    m.score,
		metadata: /** @type {Record<string, string>} */ (m.metadata ?? {})
	}));
}

/**
 * Deletes a vector from Vectorize by receipt ID.
 *
 * @param {App.Platform['env']} env
 * @param {string} receiptId
 */
export async function deleteReceiptVector(env, receiptId) {
	await env.VECTORIZE.deleteByIds([receiptId]);
}

// ── Sales ─────────────────────────────────────────────────────────────────

/**
 * Embeds the sale text and upserts it into Cloudflare Vectorize.
 *
 * @param {App.Platform['env']} env
 * @param {import('@fuzzyfinance/db').schema.sale.$inferSelect} sale
 * @returns {Promise<string>} the vector ID (same as sale.id)
 */
export async function indexSale(env, sale) {
	const text = _buildSaleIndexText(sale);

	/** @type {{ data: number[][] }} */
	const embeddingResult = await env.AI.run('@cf/google/embeddinggemma-300m', {
		text: [text]
	});

	const vector = embeddingResult.data[0];

	await env.VECTORIZE.upsert([
		{
			id: sale.id,
			values: vector,
			metadata: {
				userId:        sale.userId,
				type:          'sale',
				documentTitle: sale.documentTitle ?? '',
				date:          sale.saleDate
					? new Date(sale.saleDate).toISOString().slice(0, 10)
					: '',
				totalRevenue:  sale.totalRevenue ?? '',
				currency:      sale.currency     ?? '',
				category:      sale.category     ?? ''
			}
		}
	]);

	return sale.id;
}

/**
 * Semantic sale search for a user.
 *
 * @param {App.Platform['env']} env
 * @param {string} userId
 * @param {string} query
 * @param {number} [topK=10]
 * @returns {Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>>}
 */
export async function searchSales(env, userId, query, topK = 10) {
	/** @type {{ data: number[][] }} */
	const embeddingResult = await env.AI.run('@cf/google/embeddinggemma-300m', {
		text: [query]
	});

	const queryVector = embeddingResult.data[0];

	const result = await env.VECTORIZE.query(queryVector, {
		topK,
		filter: { userId, type: 'sale' },
		returnMetadata: 'all'
	});

	return (result.matches ?? []).map((m) => ({
		id:       m.id,
		score:    m.score,
		metadata: /** @type {Record<string, string>} */ (m.metadata ?? {})
	}));
}

/**
 * Deletes a vector from Vectorize by sale ID.
 *
 * @param {App.Platform['env']} env
 * @param {string} saleId
 */
export async function deleteSaleVector(env, saleId) {
	await env.VECTORIZE.deleteByIds([saleId]);
}

/**
 * Builds a descriptive text string for embedding a sale.
 * @param {import('@fuzzyfinance/db').schema.sale.$inferSelect} sale
 * @returns {string}
 */
function _buildSaleIndexText(sale) {
	const date = sale.saleDate
		? new Date(sale.saleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: 'unknown date';

	const lineItems = sale.lineItemsJson
		? JSON.parse(sale.lineItemsJson)
			.map((/** @type {any} */ li) => li.description)
			.filter(Boolean)
			.join(', ')
		: '';

	const parts = [
		sale.documentTitle && `Document: ${sale.documentTitle}`,
		`Date: ${date}`,
		sale.totalRevenue && `Revenue: ${sale.totalRevenue} ${sale.currency ?? ''}`.trim(),
		sale.category && `Category: ${sale.category}`,
		lineItems        && `Items: ${lineItems}`,
		sale.notes       && `Notes: ${sale.notes}`
	].filter(Boolean);

	return parts.join('. ');
}

// ── Receipts ──────────────────────────────────────────────────────────────

// ── Line items (category kNN) ────────────────────────────────────────────
//
// Every confirmed (user-set) standard line item is embedded with metadata
// `{ userId, workspaceId, kind:'line-item', primary, secondary, merchant,
// parentKind }`. On Xero sync we embed each fresh standard line and pull
// the nearest labelled neighbours; if the weighted vote crosses a
// confidence floor we fill primary + secondary and stamp aiSuggested=true.
// User-confirmed labels are the only training signal — AI-suggested rows
// don't loop back into the index.

const EMBED_MODEL = '@cf/google/embeddinggemma-300m';
const LINE_ID_PREFIX = 'li-';
const SUGGEST_SCORE_FLOOR = 0.55;   // cosine similarity gate on the top neighbour
const SUGGEST_SHARE_FLOOR = 0.45;   // winning category must hold >= this share of weighted vote

/**
 * @param {{ merchant?: string|null, description?: string|null }} input
 * @returns {string}
 */
function _buildLineText(input) {
	const m = (input.merchant ?? '').trim();
	const d = (input.description ?? '').trim();
	if (m && d) return `${m} — ${d}`;
	return d || m || 'unknown';
}

/**
 * @param {App.Platform['env']} env
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function _embedBatch(env, texts) {
	if (texts.length === 0) return [];
	/** @type {{ data: number[][] }} */
	const result = await env.AI.run(EMBED_MODEL, { text: texts });
	return result.data;
}

/**
 * Index a batch of confirmed line items. Skips lines that don't have BOTH
 * primary + secondary categories — the index only stores labelled data.
 *
 * @param {App.Platform['env']} env
 * @param {{ userId: string, workspaceId: string|null, parentKind: 'receipt'|'sale', merchant: string|null|undefined }} ctx
 * @param {Array<{ id: string, description: string|null, primaryCategory: string|null, secondaryCategory: string|null, kind?: string|null }>} lines
 * @returns {Promise<{ indexed: number, skipped: number }>}
 */
export async function indexLineItems(env, ctx, lines) {
	if (!env?.AI || !env?.VECTORIZE) return { indexed: 0, skipped: lines.length };

	const labelled = lines.filter((li) =>
		(li.kind ?? 'standard') === 'standard'
		&& !!li.primaryCategory
		&& !!li.secondaryCategory
	);
	if (labelled.length === 0) return { indexed: 0, skipped: lines.length };

	const texts = labelled.map((li) => _buildLineText({ merchant: ctx.merchant, description: li.description }));
	const vectors = await _embedBatch(env, texts);

	await env.VECTORIZE.upsert(labelled.map((li, i) => ({
		id:     LINE_ID_PREFIX + li.id,
		values: vectors[i],
		metadata: {
			userId:      ctx.userId,
			workspaceId: ctx.workspaceId ?? '',
			kind:        'line-item',
			parentKind:  ctx.parentKind,
			primary:     li.primaryCategory ?? '',
			secondary:   li.secondaryCategory ?? '',
			merchant:    ctx.merchant ?? ''
		}
	})));

	return { indexed: labelled.length, skipped: lines.length - labelled.length };
}

/**
 * Query the index for category suggestions for a batch of (uncategorised)
 * line items. Returns one entry per input, in input order — null when no
 * confident suggestion was found.
 *
 * @param {App.Platform['env']} env
 * @param {{ userId: string, workspaceId: string|null, merchant: string|null|undefined }} ctx
 * @param {Array<{ description: string|null }>} lines
 * @param {number} [topK=8]
 * @returns {Promise<Array<{ primary: string, secondary: string, score: number } | null>>}
 */
export async function suggestCategoriesForLines(env, ctx, lines, topK = 8) {
	if (!env?.AI || !env?.VECTORIZE || lines.length === 0) {
		return lines.map(() => null);
	}

	const texts = lines.map((li) => _buildLineText({ merchant: ctx.merchant, description: li.description }));
	const vectors = await _embedBatch(env, texts);

	/** @type {Record<string, string>} */
	const baseFilter = { userId: ctx.userId, kind: 'line-item' };
	// Workspace scope is optional: legacy rows pre-workspace have ''.
	if (ctx.workspaceId) baseFilter.workspaceId = ctx.workspaceId;

	const out = await Promise.all(vectors.map(async (v) => {
		const result = await env.VECTORIZE.query(v, {
			topK,
			filter: baseFilter,
			returnMetadata: 'all'
		});
		return _aggregateSuggestion(result.matches ?? []);
	}));

	return out;
}

/**
 * Weighted-vote aggregation. Each neighbour contributes its similarity
 * score to its (primary, secondary) tuple — the highest-score tuple wins.
 * Returns null unless top score ≥ SCORE_FLOOR AND its share of the total
 * weighted vote is ≥ SHARE_FLOOR.
 *
 * @param {Array<{ score: number, metadata?: Record<string, any> | null }>} matches
 * @returns {{ primary: string, secondary: string, score: number } | null}
 */
function _aggregateSuggestion(matches) {
	if (matches.length === 0) return null;

	/** @type {Map<string, { primary: string, secondary: string, weight: number, bestScore: number }>} */
	const buckets = new Map();
	let totalWeight = 0;

	for (const m of matches) {
		const md = m.metadata ?? {};
		const primary   = String(md.primary ?? '').trim();
		const secondary = String(md.secondary ?? '').trim();
		if (!primary || !secondary) continue;
		if (typeof m.score !== 'number' || m.score <= 0) continue;
		const key = `${primary} ${secondary}`;
		const cur = buckets.get(key);
		if (cur) {
			cur.weight    += m.score;
			cur.bestScore  = Math.max(cur.bestScore, m.score);
		} else {
			buckets.set(key, { primary, secondary, weight: m.score, bestScore: m.score });
		}
		totalWeight += m.score;
	}

	if (totalWeight === 0) return null;

	let winner = /** @type {{ primary: string, secondary: string, weight: number, bestScore: number } | null} */ (null);
	for (const b of buckets.values()) {
		if (!winner || b.weight > winner.weight) winner = b;
	}
	if (!winner) return null;
	if (winner.bestScore < SUGGEST_SCORE_FLOOR) return null;
	if (winner.weight / totalWeight < SUGGEST_SHARE_FLOOR) return null;

	return { primary: winner.primary, secondary: winner.secondary, score: winner.bestScore };
}

/**
 * @param {App.Platform['env']} env
 * @param {string[]} lineItemIds
 */
export async function deleteLineItemVectors(env, lineItemIds) {
	if (!env?.VECTORIZE || lineItemIds.length === 0) return;
	await env.VECTORIZE.deleteByIds(lineItemIds.map((id) => LINE_ID_PREFIX + id));
}

/**
 * Builds a descriptive text string for embedding.
 * @param {import('@fuzzyfinance/db').schema.receipt.$inferSelect} receipt
 * @returns {string}
 */
function _buildIndexText(receipt) {
	const date = receipt.receiptDate
		? new Date(receipt.receiptDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: 'unknown date';

	const lineItems = receipt.lineItemsJson
		? JSON.parse(receipt.lineItemsJson)
			.map((/** @type {any} */ li) => li.description)
			.filter(Boolean)
			.join(', ')
		: '';

	const parts = [
		receipt.merchantName && `Merchant: ${receipt.merchantName}`,
		`Date: ${date}`,
		receipt.total    && `Total: ${receipt.total} ${receipt.currency ?? ''}`.trim(),
		receipt.category && `Category: ${receipt.category}`,
		lineItems        && `Items: ${lineItems}`,
		receipt.notes    && `Notes: ${receipt.notes}`
	].filter(Boolean);

	return parts.join('. ');
}
