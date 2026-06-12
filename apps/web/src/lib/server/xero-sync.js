/**
 * Xero → FuzzyFinance sync worker.
 *
 * Pulls Invoices (ACCREC = revenue, ACCPAY = expense / bill) from each
 * Xero tenant the user has authorised and upserts them into the existing
 * `sale` / `receipt` tables. Idempotency is keyed on
 * `(userId, externalSource, externalAccountId=Xero InvoiceID GUID)` — a
 * second run for the same horizon updates the same rows in place.
 *
 * Scope of v1 (deliberately small + tight):
 *   - Invoices only (no BankTransactions, no CreditNotes).
 *   - **Approved-only filter at the source**: the Xero query carries
 *     `Statuses=AUTHORISED,PAID`. Draft + Submitted + Voided + Deleted
 *     never even cross the wire — we don't want analysis polluted by
 *     drafts and we don't want to waste rate-limit budget on them.
 *   - AccountCode lands in primaryCategory as a string. A proper
 *     chart-of-accounts → category map is Phase 1.5.
 *   - TrackingCategories land in secondaryCategory (first tracking
 *     category only, by name).
 *
 * Conformance with the Xero OpenAPI spec (xero_accounting.yaml,
 * operationId `getInvoices`):
 *   - `where=Type=="ACCREC"` / `Type=="ACCPAY"` — the canonical Type
 *     filter (Xero exposes no top-level Type query param).
 *   - `Statuses=AUTHORISED,PAID` — recommended over `where` for status
 *     unions per the spec's own note.
 *   - `page` + `pageSize=100` — explicit, default per spec is 100.
 *   - `If-Modified-Since` — ISO-8601 date-time matching the spec example.
 *   - `order=UpdatedDateUTC ASC` — stable pagination when new invoices
 *     are inserted during the sync window.
 *
 * Rate limits (per Xero): 60 req/min/tenant, 5000 req/day/tenant. We
 * page Invoices 100 at a time, stop when `pagination.pageCount` is hit.
 * Even a worst case (200 pages × 2 types × N tenants) stays inside the
 * bucket because Cloudflare Workers serialise the awaits.
 */

import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';
import { suggestCategoriesForLines } from '$lib/server/vectorize';
import { classifyLineItemsViaGemini } from '$lib/server/gemini-classify';
import { classifyPendingForUser } from '$lib/server/post-sync-classify';

const XERO_API = 'https://api.xero.com/api.xro/2.0';

/**
 * UTC midnight on the first day of the *active* Australian financial
 * year. If we're past 1 July of the current calendar year, the FY
 * started this July; otherwise it started last July.
 *
 * Hardcoded to AU/NZ for now — both share Jul 1 FY-start. Add a
 * per-workspace fyStartMonth setting when expanding into UK (Apr 6)
 * or US (Oct 1) markets.
 *
 * @param {Date} [now]
 * @returns {Date}
 */
function _activeFyStartUTC(now = new Date()) {
	const m = now.getUTCMonth(); // 0 = Jan … 11 = Dec
	const y = now.getUTCFullYear();
	const fyStartYear = m >= 6 ? y : y - 1; // 6 = July
	return new Date(Date.UTC(fyStartYear, 6, 1));
}

/**
 * Top-level sync entry. Loads the user's Xero integration + tenant list,
 * iterates them, runs both ACCREC and ACCPAY pulls per tenant. Returns a
 * summary so the caller (manual button or future cron) can surface it.
 *
 * @param {string} userId
 * @param {App.Platform['env']} [env]   Optional Workers env — when present,
 *   the sync will run the kNN suggestor on newly-inserted standard lines
 *   that arrive without categories from Xero. Skipped when env is absent.
 * @returns {Promise<{ tenants: number, invoicesCreated: number, invoicesUpdated: number, skipped: number, errors: string[] }>}
 */
export async function syncUserXero(userId, env) {
	const [integration] = await db.select()
		.from(schema.integration)
		.where(and(
			eq(schema.integration.userId,   userId),
			eq(schema.integration.provider, 'xero')
		));

	if (!integration) {
		throw new Error('No Xero integration for this user');
	}

	const metadata = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
	/** @type {Array<{ tenantId: string, tenantName: string, workspaceId?: string | null }>} */
	const tenants = metadata.xeroTenants ?? [];

	// User's default workspace — fallback for any tenant without an
	// explicit mapping. Looked up once and reused across tenants.
	const [defaultWs] = await db.select()
		.from(schema.workspace)
		.where(and(eq(schema.workspace.userId, userId), eq(schema.workspace.isDefault, true)));
	const defaultWorkspaceId = defaultWs?.id ?? null;

	const summary = { tenants: tenants.length, invoicesCreated: 0, invoicesUpdated: 0, skipped: 0, errors: /** @type {string[]} */ ([]) };

	// Two sync modes:
	//
	//   First sync (no lastSyncedAt) — filter by *issue* Date in the where
	//   clause; do NOT send If-Modified-Since. Xero's UpdatedDateUTC is a
	//   row-touched marker which on demo data and on long-untouched orgs
	//   can be years behind the issue date. Filtering by Date guarantees we
	//   pick up everything dated this FY regardless of when it last got
	//   poked. Hardcoded to AU/NZ FY (Jul 1 → Jun 30) — add a per-workspace
	//   fyStartMonth when expanding to UK (Apr 6) / US (Oct 1).
	//
	//   Delta sync (has lastSyncedAt) — filter by If-Modified-Since.
	//   Catches back-dated edits to old invoices that wouldn't surface in
	//   a Date-based query (someone could touch a 2020 invoice today).
	//
	// Format is ISO-8601 to match the Xero spec's `ifModifiedSince` example.
	const isFirstSync = !metadata.lastSyncedAt;
	const sinceISO    = isFirstSync ? null : new Date(metadata.lastSyncedAt).toISOString();
	const fyStart     = isFirstSync ? _activeFyStartUTC() : null;

	const accessToken = await getValidAccessToken(userId, 'xero');
	if (!accessToken) {
		throw new Error('AUTH_REQUIRED: Xero access token unavailable — reconnect.');
	}

	for (const tenant of tenants) {
		try {
			// Per-tenant workspace mapping. Stored in
			// `metadata.xeroTenants[i].workspaceId` and editable from the
			// Integrations page. Tenants without an explicit mapping fall
			// back to the user's default workspace.
			const workspaceId = tenant.workspaceId ?? defaultWorkspaceId;
			const accrec = await syncTenant(userId, accessToken, tenant, 'ACCREC', { sinceISO, fyStart, env, workspaceId });
			summary.invoicesCreated += accrec.created;
			summary.invoicesUpdated += accrec.updated;
			summary.skipped         += accrec.skipped;
			const accpay = await syncTenant(userId, accessToken, tenant, 'ACCPAY', { sinceISO, fyStart, env, workspaceId });
			summary.invoicesCreated += accpay.created;
			summary.invoicesUpdated += accpay.updated;
			summary.skipped         += accpay.skipped;
		} catch (/** @type {any} */ err) {
			summary.errors.push(`${tenant.tenantName ?? tenant.tenantId}: ${err?.message ?? err}`);
		}
	}

	// Stamp the integration only if at least one tenant succeeded — partial
	// success still advances; total failure leaves `lastSyncedAt` alone so the
	// next attempt re-tries the same window.
	if (summary.errors.length < tenants.length) {
		const next = { ...metadata, lastSyncedAt: new Date().toISOString(), lastSummary: { ...summary, errors: undefined } };
		await db.update(schema.integration)
			.set({ metadataJson: JSON.stringify(next) })
			.where(eq(schema.integration.id, integration.id));
	}

	// Single post-sync classification pass — deduplicated across the entire
	// fetched set so we don't blow the Cloudflare Workers subrequest budget
	// (1000 per invocation). Failure here doesn't unwind the sync; the rows
	// are already on disk and a manual classify-pending POST can catch up.
	if (env?.AI && env?.VECTORIZE) {
		try {
			const classifySummary = await classifyPendingForUser(userId, env);
			// @ts-ignore — surfaced for the integration card's lastSummary panel.
			summary.classified = classifySummary;
		} catch (/** @type {any} */ err) {
			console.warn('[xero-sync] post-sync classification skipped:', err?.message ?? err);
		}
	}

	return summary;
}

/**
 * Pull and upsert one (tenant, invoice-type) slice. Returns counts.
 *
 * Exactly one of `sinceISO` and `fyStart` must be set:
 *   - `fyStart`: a Date. First-time backfill — filter by *issue* Date in
 *     the `where` clause and omit `If-Modified-Since`.
 *   - `sinceISO`: an ISO-8601 string. Delta sync — send as
 *     `If-Modified-Since` header. Catches back-dated row touches.
 *
 * @param {string} userId
 * @param {string} accessToken
 * @param {{ tenantId: string, tenantName?: string }} tenant
 * @param {'ACCREC' | 'ACCPAY'} invoiceType
 * @param {{ sinceISO: string | null, fyStart: Date | null, env?: App.Platform['env'], workspaceId?: string | null }} opts
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
export async function syncTenant(userId, accessToken, tenant, invoiceType, opts) {
	const { sinceISO, fyStart, env, workspaceId = null } = opts;
	const externalSource = invoiceType === 'ACCREC' ? 'xero-invoice-accrec' : 'xero-invoice-accpay';
	const result = { created: 0, updated: 0, skipped: 0 };

	// Build the where clause once. On first sync this pins Date≥FY-start —
	// the issue-date filter that survives stale UpdatedDateUTC on demo data
	// and on long-untouched orgs.
	let whereClause = `Type=="${invoiceType}"`;
	if (fyStart) {
		const y = fyStart.getUTCFullYear();
		const m = fyStart.getUTCMonth() + 1; // Xero expects 1-12
		const d = fyStart.getUTCDate();
		whereClause += ` AND Date>=DateTime(${y},${m},${d})`;
	}

	for (let page = 1; page < 500; page++) { // hard ceiling, see header comment
		const url = new URL(`${XERO_API}/Invoices`);
		// Canonical filters per the OpenAPI spec — see file header.
		url.searchParams.set('where',    whereClause);
		url.searchParams.set('Statuses', 'AUTHORISED,PAID');
		url.searchParams.set('page',     String(page));
		url.searchParams.set('pageSize', '100');
		url.searchParams.set('order',    'UpdatedDateUTC ASC');

		/** @type {Record<string, string>} */
		const headers = {
			Authorization:    `Bearer ${accessToken}`,
			'xero-tenant-id': tenant.tenantId,
			Accept:           'application/json'
		};
		if (sinceISO) headers['If-Modified-Since'] = sinceISO;

		const res = await fetch(url, { headers });

		if (res.status === 304) break; // no changes since sinceISO
		if (!res.ok) {
			throw new Error(`Xero ${invoiceType} pull failed (${res.status}): ${await res.text()}`);
		}

		const body = await res.json();
		/** @type {Array<any>} */
		const invoices = body?.Invoices ?? [];
		if (invoices.length === 0) break;

		for (const inv of invoices) {
			const outcome = await _upsertInvoice(userId, externalSource, inv, env, workspaceId);
			if      (outcome === 'created') result.created++;
			else if (outcome === 'updated') result.updated++;
			else                            result.skipped++;
		}

		// Prefer the server-supplied pageCount when present; fall back to a
		// short-page heuristic if Xero ever omits the pagination block.
		const pageCount = body?.pagination?.pageCount;
		if (typeof pageCount === 'number' && page >= pageCount) break;
		if (pageCount == null && invoices.length < 100) break;
	}

	return result;
}

/**
 * Idempotent upsert of a single Xero Invoice into `sale` (ACCREC) or
 * `receipt` (ACCPAY) + the matching line-item table. Returns the outcome
 * so the caller can keep a tally.
 *
 * @param {string} userId
 * @param {'xero-invoice-accrec' | 'xero-invoice-accpay'} externalSource
 * @param {any} inv
 * @param {App.Platform['env']} [_env]   Reserved — classification is deferred to the post-loop pass.
 * @param {string | null} [workspaceId]
 * @returns {Promise<'created' | 'updated' | 'skipped'>}
 */
async function _upsertInvoice(userId, externalSource, inv, _env, workspaceId = null) {
	const invoiceId = inv.InvoiceID;
	if (!invoiceId) return 'skipped';

	// Defensive: the server-side `Statuses` filter already restricts us to
	// AUTHORISED + PAID, so DRAFT / SUBMITTED / VOIDED / DELETED should
	// never make it here. Belt-and-braces in case Xero ever bends the
	// contract — anything outside the approved set is skipped.
	if (inv.Status !== 'AUTHORISED' && inv.Status !== 'PAID') return 'skipped';

	// Always `complete` — drafts can't reach this point.
	const status = /** @type {'complete'} */ ('complete');

	if (externalSource === 'xero-invoice-accrec') {
		return _upsertSale(userId, invoiceId, status, inv, workspaceId);
	}
	return _upsertReceipt(userId, invoiceId, status, inv, workspaceId);
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @param {string | null} [workspaceId]
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertSale(userId, invoiceId, status, inv, workspaceId = null) {
	const externalSource = 'xero-invoice-accrec';

	const documentTitle = inv?.Contact?.Name ?? inv?.InvoiceNumber ?? null;
	const saleDate      = _parseXeroDate(inv?.Date);
	const totalRevenue  = _resolveTotal(inv);
	const currency      = inv?.CurrencyCode ?? null;
	const reference     = typeof inv?.Reference === 'string' ? inv.Reference : null;
	const invoiceNumber = typeof inv?.InvoiceNumber === 'string' ? inv.InvoiceNumber : null;
	// Xero authors invoices as either tax-Inclusive or tax-Exclusive (or NoTax).
	// We canonicalise on write — see `_normalizeLineAmounts`.
	const lineAmountTypes = typeof inv?.LineAmountTypes === 'string' ? inv.LineAmountTypes : null;
	// Subtotal Xero gives us, or total - tax, or the full total when there's no tax.
	const fallbackSubtotal = _resolveFallbackSubtotal(_resolveSubtotal(inv), totalRevenue, _resolveTax(inv));
	const fallbackDescription = _buildFallbackDescription(documentTitle, reference);

	const existing = await _findExistingSale(userId, externalSource, invoiceId);

	// Per-invoice path deliberately runs WITHOUT env so the inline kNN call
	// in `_applyCategorySuggestions` short-circuits. A single deduplicated
	// classification pass runs once at the end of `syncUserXero` — that's
	// how we stay inside the 1000-subrequest budget on large syncs.
	const insertCtx = {
		env:                /** @type {App.Platform['env'] | undefined} */ (undefined),
		userId,
		workspaceId,
		merchant:           documentTitle,
		fallbackDescription,
		fallbackSubtotal,
		invoiceNumber,
		lineAmountTypes
	};

	if (existing) {
		// Re-mapping a tenant to a new workspace should move existing rows.
		await db.update(schema.sale)
			.set({ status, documentTitle, saleDate, totalRevenue, currency, workspaceId })
			.where(eq(schema.sale.id, existing.id));
		// Replace line items wholesale — simpler than diffing, fine at our scale.
		await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, existing.id));
		const headerCategory = await _insertSaleLineItems(existing.id, inv?.LineItems ?? [], inv?.TotalTax, {
			...insertCtx, currentHeaderCategory: existing.category ?? null
		});
		if (headerCategory) {
			await db.update(schema.sale).set({ category: headerCategory })
				.where(eq(schema.sale.id, existing.id));
		}
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.sale).values({
		id, userId, workspaceId, status,
		documentTitle, saleDate, totalRevenue, currency,
		externalSource, externalAccountId: invoiceId
	});
	const headerCategory = await _insertSaleLineItems(id, inv?.LineItems ?? [], inv?.TotalTax, {
		...insertCtx, currentHeaderCategory: null
	});
	if (headerCategory) {
		await db.update(schema.sale).set({ category: headerCategory })
			.where(eq(schema.sale.id, id));
	}
	return 'created';
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @param {string | null} [workspaceId]
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertReceipt(userId, invoiceId, status, inv, workspaceId = null) {
	const externalSource = 'xero-invoice-accpay';

	const merchantName  = inv?.Contact?.Name ?? null;
	const receiptDate   = _parseXeroDate(inv?.Date);
	const total         = _resolveTotal(inv);
	const subtotal      = _resolveSubtotal(inv);
	const tax           = _resolveTax(inv);
	const currency      = inv?.CurrencyCode ?? null;
	const invoiceNumber = inv?.InvoiceNumber ?? null;
	const reference     = typeof inv?.Reference === 'string' ? inv.Reference : null;
	const lineAmountTypes     = typeof inv?.LineAmountTypes === 'string' ? inv.LineAmountTypes : null;
	const fallbackSubtotal    = _resolveFallbackSubtotal(subtotal, total, tax);
	const fallbackDescription = _buildFallbackDescription(merchantName, reference);

	const existing = await _findExistingReceipt(userId, externalSource, invoiceId);

	// Same as sales: defer classification to the single post-loop pass.
	const insertCtx = {
		env:                /** @type {App.Platform['env'] | undefined} */ (undefined),
		userId,
		workspaceId,
		merchant:           merchantName,
		fallbackDescription,
		fallbackSubtotal,
		invoiceNumber,
		lineAmountTypes
	};

	if (existing) {
		await db.update(schema.receipt)
			.set({ status, merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber, workspaceId })
			.where(eq(schema.receipt.id, existing.id));
		await db.delete(schema.receiptLineItem).where(eq(schema.receiptLineItem.receiptId, existing.id));
		const headerCategory = await _insertReceiptLineItems(existing.id, inv?.LineItems ?? [], inv?.TotalTax, {
			...insertCtx, currentHeaderCategory: existing.category ?? null
		});
		if (headerCategory) {
			await db.update(schema.receipt).set({ category: headerCategory })
				.where(eq(schema.receipt.id, existing.id));
		}
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.receipt).values({
		id, userId, workspaceId, status,
		merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber,
		externalSource, externalAccountId: invoiceId
	});
	const headerCategory = await _insertReceiptLineItems(id, inv?.LineItems ?? [], inv?.TotalTax, {
		...insertCtx, currentHeaderCategory: null
	});
	if (headerCategory) {
		await db.update(schema.receipt).set({ category: headerCategory })
			.where(eq(schema.receipt.id, id));
	}
	return 'created';
}

/**
 * Insert a sale's line items. All stored amounts are canonicalised to
 * **tax-exclusive** regardless of the invoice's `LineAmountTypes`, so
 * that standard rows sum to `SubTotal` and the synthesised
 * `kind='tax'` row makes the grand total balance.
 *
 * @param {string} saleId
 * @param {Array<any>} lineItems
 * @param {number | string | null | undefined} totalTax   Xero invoice TotalTax — emits a synthesised tax line when > 0
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null, currentHeaderCategory: string|null, fallbackDescription?: string|null, fallbackSubtotal?: string|null, invoiceNumber?: string|null, lineAmountTypes?: string|null }} ctx
 * @returns {Promise<string | null>}  Derived header category (only when one needed setting); `null` if header is already set or nothing to derive.
 */
async function _insertSaleLineItems(saleId, lineItems, totalTax, ctx) {
	/** @type {Array<typeof schema.saleLineItem.$inferInsert>} */
	const rows = [];

	const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;

	if (hasLineItems) {
		for (let idx = 0; idx < lineItems.length; idx++) {
			const li = lineItems[idx];
			const trackingName = li?.Tracking?.[0]?.Option ?? null;
			const amounts = _normalizeLineAmounts(li, ctx.lineAmountTypes);
			// Xero's `AccountCode` is a chart-of-accounts numeric code
			// (e.g. "200", "400") — NOT a FuzzyFinance taxonomy value.
			// Leave primaryCategory null so the post-sync classifier can
			// derive a proper category from the description; the AccountCode
			// belongs in a separate audit field if we ever wire one up.
			rows.push({
				id:                crypto.randomUUID(),
				saleId,
				description:       li?.Description ?? null,
				type:              null,
				unitsSold:         li?.Quantity != null ? String(li.Quantity) : null,
				buyPrice:          null,
				sellPrice:         amounts.unitPrice,
				margin:            null,
				total:             amounts.total,
				totalCost:         null,
				unitSize:          null,
				unitType:          null,
				primaryCategory:   null,
				secondaryCategory: trackingName,
				sortOrder:         idx,
				kind:              'standard'
			});
		}
	} else if (ctx.fallbackSubtotal != null) {
		// Xero invoice without line items (just header amounts). Synthesise
		// ONE standard row from the subtotal + merchant context so the
		// post-sync classifier has something to work with and the line-items
		// sum still balances against the header total.
		rows.push({
			id:                crypto.randomUUID(),
			saleId,
			description:       ctx.fallbackDescription ?? null,
			type:              null,
			unitsSold:         null,
			buyPrice:          null,
			sellPrice:         ctx.fallbackSubtotal,
			margin:            null,
			total:             ctx.fallbackSubtotal,
			totalCost:         null,
			unitSize:          null,
			unitType:          null,
			primaryCategory:   null,
			secondaryCategory: null,
			sortOrder:         0,
			kind:              'standard'
		});
	}

	await _applyCategorySuggestions(rows, ctx);

	// Synthesise a tax line so it shows up in analysis. Amount is locked
	// (the refinement editor refuses edits on `kind='tax'` rows) but the
	// user can still pick a category for it.
	const taxNum = Number(totalTax);
	if (Number.isFinite(taxNum) && taxNum > 0) {
		rows.push({
			id:                crypto.randomUUID(),
			saleId,
			description:       'Tax',
			type:              null,
			unitsSold:         null,
			buyPrice:          null,
			sellPrice:         null,
			margin:            null,
			total:             String(taxNum),
			totalCost:         null,
			unitSize:          null,
			unitType:          null,
			primaryCategory:   'Tax',
			secondaryCategory: 'GST',
			sortOrder:         rows.length,
			kind:              'tax'
		});
	}

	if (rows.length > 0) await db.insert(schema.saleLineItem).values(rows);

	return _deriveHeaderCategory(rows, ctx.currentHeaderCategory);
}

/**
 * Insert a receipt's line items. Same tax-exclusive canonicalisation as
 * `_insertSaleLineItems` — see that function's comment for the rationale.
 *
 * @param {string} receiptId
 * @param {Array<any>} lineItems
 * @param {number | string | null | undefined} totalTax   Xero invoice TotalTax — emits a synthesised tax line when > 0
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null, currentHeaderCategory: string|null, fallbackDescription?: string|null, fallbackSubtotal?: string|null, invoiceNumber?: string|null, lineAmountTypes?: string|null }} ctx
 * @returns {Promise<string | null>}  Derived header category (only when one needed setting); `null` if header is already set or nothing to derive.
 */
async function _insertReceiptLineItems(receiptId, lineItems, totalTax, ctx) {
	/** @type {Array<typeof schema.receiptLineItem.$inferInsert>} */
	const rows = [];

	const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;

	if (hasLineItems) {
		for (let idx = 0; idx < lineItems.length; idx++) {
			const li = lineItems[idx];
			const trackingName = li?.Tracking?.[0]?.Option ?? null;
			const amounts = _normalizeLineAmounts(li, ctx.lineAmountTypes);
			// See _insertSaleLineItems — AccountCode is Xero's COA number,
			// not our taxonomy. Leave primary null for the classifier.
			rows.push({
				id:                crypto.randomUUID(),
				receiptId,
				description:       li?.Description ?? null,
				qty:               li?.Quantity != null ? String(li.Quantity) : null,
				unitPrice:         amounts.unitPrice,
				total:             amounts.total,
				unitSize:          amounts.unitPrice,
				unitType:          null,
				primaryCategory:   null,
				secondaryCategory: trackingName,
				sortOrder:         idx,
				kind:              'standard'
			});
		}
	} else if (ctx.fallbackSubtotal != null) {
		// Header-only Xero invoice — synthesise a single standard row from
		// the subtotal so total balances and the classifier has signal.
		rows.push({
			id:                crypto.randomUUID(),
			receiptId,
			description:       ctx.fallbackDescription ?? null,
			qty:               '1',
			unitPrice:         ctx.fallbackSubtotal,
			total:             ctx.fallbackSubtotal,
			unitSize:          null,
			unitType:          null,
			primaryCategory:   null,
			secondaryCategory: null,
			sortOrder:         0,
			kind:              'standard'
		});
	}

	await _applyCategorySuggestions(rows, ctx);

	const taxNum = Number(totalTax);
	if (Number.isFinite(taxNum) && taxNum > 0) {
		rows.push({
			id:                crypto.randomUUID(),
			receiptId,
			description:       'Tax',
			qty:               null,
			unitPrice:         null,
			total:             String(taxNum),
			unitSize:          null,
			unitType:          null,
			primaryCategory:   'Tax',
			secondaryCategory: 'GST',
			sortOrder:         rows.length,
			kind:              'tax'
		});
	}

	if (rows.length > 0) await db.insert(schema.receiptLineItem).values(rows);

	return _deriveHeaderCategory(rows, ctx.currentHeaderCategory);
}

/**
 * Two-hop classification waterfall, mutating `rows` in place:
 *
 *   1. Embeddings (kNN over the workspace's confirmed labels). Cheap +
 *      personalised — fills whatever it can with high confidence.
 *   2. Gemini (LLM call against the full taxonomy). Picks up the long
 *      tail the kNN can't confidently bucket. Either OAuth via the
 *      user's Google integration with the
 *      `generative-language.retriever` scope, or a workspace API key.
 *
 * Any line filled by either hop is stamped `aiSuggested = true` so the
 * refinement editor can badge it and the user can confirm/edit. Tax
 * lines + already-categorised rows are left alone.
 *
 * Silently no-ops when `env` is absent (test paths). Each hop fails open
 * independently — Vectorize misses or Gemini quota errors don't abort
 * the sync.
 *
 * @template {{ description?: string|null, primaryCategory?: string|null, secondaryCategory?: string|null, kind?: string, aiSuggested?: boolean }} T
 * @param {Array<T>} rows
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null }} ctx
 */
async function _applyCategorySuggestions(rows, ctx) {
	if (!ctx?.env) return;
	let targets = rows.filter((r) =>
		(r.kind ?? 'standard') === 'standard'
		&& (!r.primaryCategory || !r.secondaryCategory)
	);
	if (targets.length === 0) return;

	// Hop 1 — embeddings.
	try {
		const suggestions = await suggestCategoriesForLines(ctx.env, {
			userId:      ctx.userId,
			workspaceId: ctx.workspaceId,
			merchant:    ctx.merchant
		}, targets.map((r) => ({ description: r.description ?? null })));
		for (let i = 0; i < targets.length; i++) {
			const s = suggestions[i];
			if (!s) continue;
			const t = targets[i];
			if (!t.primaryCategory)   t.primaryCategory   = s.primary;
			if (!t.secondaryCategory) t.secondaryCategory = s.secondary;
			t.aiSuggested = true;
		}
	} catch (/** @type {any} */ err) {
		console.warn('[xero-sync] kNN suggestion skipped:', err?.message ?? err);
	}

	// Re-filter — only lines the embeddings hop couldn't classify get
	// sent to Gemini.
	const remaining = rows.filter((r) =>
		(r.kind ?? 'standard') === 'standard'
		&& (!r.primaryCategory || !r.secondaryCategory)
	);
	if (remaining.length === 0) return;

	// Hop 2 — Gemini.
	try {
		const geminiSuggestions = await classifyLineItemsViaGemini({
			userId:      ctx.userId,
			workspaceId: ctx.workspaceId,
			items:       remaining.map((r) => ({ description: r.description ?? null }))
		});
		for (let i = 0; i < remaining.length; i++) {
			const s = geminiSuggestions[i];
			if (!s) continue;
			const t = remaining[i];
			if (!t.primaryCategory)   t.primaryCategory   = s.primary;
			if (!t.secondaryCategory) t.secondaryCategory = s.secondary;
			t.aiSuggested = true;
		}
	} catch (/** @type {any} */ err) {
		console.warn('[xero-sync] Gemini classification skipped:', err?.message ?? err);
	}
}

/**
 * Derive the document-level category from the rolled-up primary
 * categories on the line items. Returns the value the caller should
 * write to `receipt.category` / `sale.category`, or `null` when no
 * write is needed (header was already set, or no signal to derive
 * from).
 *
 * Mode of primary categories across `kind='standard'` lines wins.
 * Empty + tax rows are excluded.
 *
 * @param {Array<{ primaryCategory?: string|null, kind?: string }>} rows
 * @param {string | null} currentHeaderCategory
 * @returns {string | null}
 */
function _deriveHeaderCategory(rows, currentHeaderCategory) {
	if (currentHeaderCategory) return null;
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const r of rows) {
		if ((r.kind ?? 'standard') !== 'standard') continue;
		const p = r.primaryCategory;
		if (!p) continue;
		counts.set(p, (counts.get(p) ?? 0) + 1);
	}
	if (counts.size === 0) return null;
	let winner = '';
	let best = 0;
	for (const [p, n] of counts) {
		if (n > best) { best = n; winner = p; }
	}
	return winner || null;
}

/**
 * @param {string} userId
 * @param {string} externalSource
 * @param {string} externalAccountId
 */
async function _findExistingSale(userId, externalSource, externalAccountId) {
	const [row] = await db.select()
		.from(schema.sale)
		.where(and(
			eq(schema.sale.userId, userId),
			eq(schema.sale.externalSource, externalSource),
			eq(schema.sale.externalAccountId, externalAccountId)
		));
	return row ?? null;
}

/**
 * @param {string} userId
 * @param {string} externalSource
 * @param {string} externalAccountId
 */
async function _findExistingReceipt(userId, externalSource, externalAccountId) {
	const [row] = await db.select()
		.from(schema.receipt)
		.where(and(
			eq(schema.receipt.userId, userId),
			eq(schema.receipt.externalSource, externalSource),
			eq(schema.receipt.externalAccountId, externalAccountId)
		));
	return row ?? null;
}

/**
 * Sum of `LineAmount` across a Xero invoice's line items.
 *
 * @param {any} inv
 * @returns {number}
 */
function _lineAmountSum(inv) {
	if (!Array.isArray(inv?.LineItems)) return 0;
	let s = 0;
	for (const li of inv.LineItems) {
		const n = Number(li?.LineAmount);
		if (Number.isFinite(n)) s += n;
	}
	return s;
}

/**
 * Resolve the invoice's total. Xero's bulk `/Invoices` endpoint *should*
 * include `Total` for every AUTHORISED/PAID row, but in practice some
 * sandbox / tenant configurations land rows where only the ID + line
 * items come through. When `Total` is missing we derive it from the
 * line items, honouring `LineAmountTypes`:
 *   - 'Inclusive' → line-amount sum already includes tax.
 *   - 'Exclusive' or 'NoTax' → line-amount sum is pre-tax; add TotalTax.
 *   - missing → assume Exclusive (the Xero default).
 *
 * Returned as a string for direct insertion into the receipt's TEXT
 * column. `null` when nothing computable.
 *
 * @param {any} inv
 * @returns {string | null}
 */
function _resolveTotal(inv) {
	if (inv?.Total != null) return String(inv.Total);
	const lineSum = _lineAmountSum(inv);
	if (lineSum === 0) return null;
	const taxNum = Number(inv?.TotalTax);
	const tax    = Number.isFinite(taxNum) ? taxNum : 0;
	if (inv?.LineAmountTypes === 'Inclusive') return String(lineSum);
	return String(lineSum + tax);
}

/**
 * Resolve the invoice's subtotal. Falls back to the line-amount sum
 * minus any included tax (when LineAmountTypes='Inclusive'), or just
 * the line-amount sum (Exclusive / NoTax / unspecified).
 *
 * @param {any} inv
 * @returns {string | null}
 */
function _resolveSubtotal(inv) {
	if (inv?.SubTotal != null) return String(inv.SubTotal);
	const lineSum = _lineAmountSum(inv);
	if (lineSum === 0) return null;
	if (inv?.LineAmountTypes === 'Inclusive') {
		const taxNum = Number(inv?.TotalTax);
		const tax    = Number.isFinite(taxNum) ? taxNum : 0;
		return String(lineSum - tax);
	}
	return String(lineSum);
}

/**
 * Canonicalise a Xero line item's amounts to **tax-exclusive**.
 *
 * Xero stores invoices with a `LineAmountTypes` flag controlling how
 * line-level amounts relate to tax:
 *   - `'Exclusive'` — line amounts are pre-tax; tax is added on top.
 *   - `'Inclusive'` — line amounts already include tax; `TaxAmount` per
 *     line records the included portion.
 *   - `'NoTax'`    — no tax applies; amounts are effectively pre-tax.
 *
 * We canonicalise everything to tax-exclusive at write time so the
 * standard-line totals sum to `SubTotal`, and the synthesised
 * `kind='tax'` row makes the grand total balance:
 *   `sum(standard lines) + tax line = Total`.
 *
 * For `Inclusive`: subtract `li.TaxAmount` from `li.LineAmount` to get
 * the pre-tax line total, then back out the per-unit price too so
 * `qty × unitPrice ≈ total` stays internally consistent.
 *
 * @param {any} li
 * @param {string | null | undefined} lineAmountTypes
 * @returns {{ total: string | null, unitPrice: string | null }}
 */
function _normalizeLineAmounts(li, lineAmountTypes) {
	const lineAmount = Number(li?.LineAmount);
	const qty        = Number(li?.Quantity);
	const lineTax    = Number(li?.TaxAmount) || 0;
	const unitAmt    = Number(li?.UnitAmount);

	if (!Number.isFinite(lineAmount)) {
		return {
			total:     li?.LineAmount != null ? String(li.LineAmount) : null,
			unitPrice: li?.UnitAmount != null ? String(li.UnitAmount) : null
		};
	}

	const preTaxTotal = lineAmountTypes === 'Inclusive'
		? lineAmount - lineTax
		: lineAmount;

	const totalStr = String(+preTaxTotal.toFixed(2));

	// Derive the pre-tax unit price from the normalised line total when we
	// have a positive quantity; otherwise fall back to Xero's UnitAmount
	// (which may be inclusive — best we can do without per-unit context).
	let unitStr;
	if (Number.isFinite(qty) && qty > 0) {
		unitStr = String(+(preTaxTotal / qty).toFixed(4));
	} else if (Number.isFinite(unitAmt)) {
		unitStr = lineAmountTypes === 'Inclusive'
			? String(+(unitAmt - lineTax).toFixed(4))
			: String(unitAmt);
	} else {
		unitStr = null;
	}

	return { total: totalStr, unitPrice: unitStr };
}

/**
 * Pre-tax amount for the synthetic standard line we insert when Xero
 * doesn't ship any `LineItems[]`. Priority: explicit subtotal > total
 * minus tax > total. Returned as a decimal string for direct insertion
 * into the row's `total` column. Null only when nothing computable.
 *
 * @param {string | null | undefined} subtotal
 * @param {string | null | undefined} total
 * @param {string | null | undefined} tax
 * @returns {string | null}
 */
function _resolveFallbackSubtotal(subtotal, total, tax) {
	if (subtotal != null && subtotal !== '') return subtotal;
	const totalNum = Number(total);
	if (!Number.isFinite(totalNum)) return null;
	const taxNum = Number(tax);
	if (Number.isFinite(taxNum) && taxNum > 0) {
		return String(+(totalNum - taxNum).toFixed(2));
	}
	return String(totalNum);
}

/**
 * Build the description for the synthetic standard line. Joins whatever
 * descriptive bits we have from the Xero header — typically the contact
 * name plus `Reference` — so the post-sync classifier has more signal
 * than just a merchant name. Falls back to a literal "Document" when
 * nothing else is available, so the row can still be classified.
 *
 * @param {...(string | null | undefined)} parts
 * @returns {string}
 */
function _buildFallbackDescription(...parts) {
	const cleaned = parts
		.map((p) => (p == null ? '' : String(p).trim()))
		.filter((s) => s.length > 0);
	return cleaned.length > 0 ? cleaned.join(' — ') : 'Document';
}

/**
 * Resolve the invoice's tax. Falls back to summing each line's
 * `TaxAmount` when `TotalTax` is missing.
 *
 * @param {any} inv
 * @returns {string | null}
 */
function _resolveTax(inv) {
	if (inv?.TotalTax != null) return String(inv.TotalTax);
	if (!Array.isArray(inv?.LineItems)) return null;
	let s = 0;
	let any = false;
	for (const li of inv.LineItems) {
		const n = Number(li?.TaxAmount);
		if (Number.isFinite(n)) { s += n; any = true; }
	}
	return any ? String(s) : null;
}

/**
 * Xero serialises dates as either:
 *   "/Date(1700000000000+0000)/"      (legacy .NET)
 *   "2026-06-09T00:00:00"             (ISO, newer endpoints)
 *
 * Return a JS Date or null. We trust Xero on validity; surfacing a parse
 * error here aborts the whole sync, which is worse than null on one row.
 *
 * @param {string | null | undefined} raw
 * @returns {Date | null}
 */
function _parseXeroDate(raw) {
	if (!raw) return null;
	if (typeof raw !== 'string') return null;

	const m = raw.match(/\/Date\((-?\d+)/);
	if (m) {
		const n = Number(m[1]);
		return Number.isFinite(n) ? new Date(n) : null;
	}
	const d = new Date(raw);
	return isNaN(d.getTime()) ? null : d;
}
