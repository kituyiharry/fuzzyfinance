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
	const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
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
	const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
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
	const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
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
	const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
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
