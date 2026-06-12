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
	/** @type {Array<{ tenantId: string, tenantName: string }>} */
	const tenants = metadata.xeroTenants ?? [];

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
			const accrec = await syncTenant(userId, accessToken, tenant, 'ACCREC', { sinceISO, fyStart, env });
			summary.invoicesCreated += accrec.created;
			summary.invoicesUpdated += accrec.updated;
			summary.skipped         += accrec.skipped;
			const accpay = await syncTenant(userId, accessToken, tenant, 'ACCPAY', { sinceISO, fyStart, env });
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
 * @param {{ sinceISO: string | null, fyStart: Date | null, env?: App.Platform['env'] }} opts
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
export async function syncTenant(userId, accessToken, tenant, invoiceType, opts) {
	const { sinceISO, fyStart, env } = opts;
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
			const outcome = await _upsertInvoice(userId, externalSource, inv, env);
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
 * @param {App.Platform['env']} [env]
 * @returns {Promise<'created' | 'updated' | 'skipped'>}
 */
async function _upsertInvoice(userId, externalSource, inv, env) {
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
		return _upsertSale(userId, invoiceId, status, inv, env);
	}
	return _upsertReceipt(userId, invoiceId, status, inv, env);
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @param {App.Platform['env']} [env]
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertSale(userId, invoiceId, status, inv, env) {
	const externalSource = 'xero-invoice-accrec';

	const documentTitle = inv?.Contact?.Name ?? inv?.InvoiceNumber ?? null;
	const saleDate      = _parseXeroDate(inv?.Date);
	const totalRevenue  = _resolveTotal(inv);
	const currency      = inv?.CurrencyCode ?? null;

	const existing = await _findExistingSale(userId, externalSource, invoiceId);

	if (existing) {
		await db.update(schema.sale)
			.set({ status, documentTitle, saleDate, totalRevenue, currency })
			.where(eq(schema.sale.id, existing.id));
		// Replace line items wholesale — simpler than diffing, fine at our scale.
		await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, existing.id));
		await _insertSaleLineItems(existing.id, inv?.LineItems ?? [], inv?.TotalTax, {
			env, userId, workspaceId: existing.workspaceId, merchant: documentTitle
		});
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.sale).values({
		id, userId, workspaceId: null, status,
		documentTitle, saleDate, totalRevenue, currency,
		externalSource, externalAccountId: invoiceId
	});
	await _insertSaleLineItems(id, inv?.LineItems ?? [], inv?.TotalTax, {
		env, userId, workspaceId: null, merchant: documentTitle
	});
	return 'created';
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @param {App.Platform['env']} [env]
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertReceipt(userId, invoiceId, status, inv, env) {
	const externalSource = 'xero-invoice-accpay';

	const merchantName  = inv?.Contact?.Name ?? null;
	const receiptDate   = _parseXeroDate(inv?.Date);
	const total         = _resolveTotal(inv);
	const subtotal      = _resolveSubtotal(inv);
	const tax           = _resolveTax(inv);
	const currency      = inv?.CurrencyCode ?? null;
	const invoiceNumber = inv?.InvoiceNumber ?? null;

	const existing = await _findExistingReceipt(userId, externalSource, invoiceId);

	if (existing) {
		await db.update(schema.receipt)
			.set({ status, merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber })
			.where(eq(schema.receipt.id, existing.id));
		await db.delete(schema.receiptLineItem).where(eq(schema.receiptLineItem.receiptId, existing.id));
		await _insertReceiptLineItems(existing.id, inv?.LineItems ?? [], inv?.TotalTax, {
			env, userId, workspaceId: existing.workspaceId, merchant: merchantName
		});
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.receipt).values({
		id, userId, workspaceId: null, status,
		merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber,
		externalSource, externalAccountId: invoiceId
	});
	await _insertReceiptLineItems(id, inv?.LineItems ?? [], inv?.TotalTax, {
		env, userId, workspaceId: null, merchant: merchantName
	});
	return 'created';
}

/**
 * @param {string} saleId
 * @param {Array<any>} lineItems
 * @param {number | string | null | undefined} totalTax   Xero invoice TotalTax — emits a synthesised tax line when > 0
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null }} ctx
 */
async function _insertSaleLineItems(saleId, lineItems, totalTax, ctx) {
	/** @type {Array<typeof schema.saleLineItem.$inferInsert>} */
	const rows = [];

	if (Array.isArray(lineItems)) {
		for (let idx = 0; idx < lineItems.length; idx++) {
			const li = lineItems[idx];
			const trackingName = li?.Tracking?.[0]?.Option ?? null;
			rows.push({
				id:                crypto.randomUUID(),
				saleId,
				description:       li?.Description ?? null,
				type:              null,
				unitsSold:         li?.Quantity   != null ? String(li.Quantity)   : null,
				buyPrice:          null,
				sellPrice:         li?.UnitAmount != null ? String(li.UnitAmount) : null,
				margin:            null,
				total:             li?.LineAmount != null ? String(li.LineAmount) : null,
				totalCost:         null,
				unitSize:          null,
				unitType:          null,
				primaryCategory:   li?.AccountCode ?? null,
				secondaryCategory: trackingName,
				sortOrder:         idx,
				kind:              'standard'
			});
		}
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
			primaryCategory:   null,
			secondaryCategory: null,
			sortOrder:         rows.length,
			kind:              'tax'
		});
	}

	if (rows.length > 0) await db.insert(schema.saleLineItem).values(rows);
}

/**
 * @param {string} receiptId
 * @param {Array<any>} lineItems
 * @param {number | string | null | undefined} totalTax   Xero invoice TotalTax — emits a synthesised tax line when > 0
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null }} ctx
 */
async function _insertReceiptLineItems(receiptId, lineItems, totalTax, ctx) {
	/** @type {Array<typeof schema.receiptLineItem.$inferInsert>} */
	const rows = [];

	if (Array.isArray(lineItems)) {
		for (let idx = 0; idx < lineItems.length; idx++) {
			const li = lineItems[idx];
			const trackingName = li?.Tracking?.[0]?.Option ?? null;
			rows.push({
				id:                crypto.randomUUID(),
				receiptId,
				description:       li?.Description ?? null,
				qty:               li?.Quantity   != null ? String(li.Quantity)   : null,
				unitPrice:         li?.UnitAmount != null ? String(li.UnitAmount) : null,
				total:             li?.LineAmount != null ? String(li.LineAmount) : null,
				unitSize:          li?.UnitAmount != null ? String(li.UnitAmount) : null,
				unitType:          null,
				primaryCategory:   li?.AccountCode ?? null,
				secondaryCategory: trackingName,
				sortOrder:         idx,
				kind:              'standard'
			});
		}
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
}

/**
 * Mutates `rows` in place: for each standard line that arrived without
 * BOTH primary + secondary set, run the embedding-based suggestor and
 * stamp the result + `aiSuggested = true`. Lines that already have both
 * categories (or that are kind='tax', or that the suggestor doesn't
 * confidently classify) are left untouched.
 *
 * Silently no-ops when env isn't passed (e.g. during tests or cron paths
 * that don't carry the runtime bindings yet).
 *
 * @template {{ description?: string|null, primaryCategory?: string|null, secondaryCategory?: string|null, kind?: string, aiSuggested?: boolean }} T
 * @param {Array<T>} rows
 * @param {{ env?: App.Platform['env'], userId: string, workspaceId: string|null, merchant: string|null }} ctx
 */
async function _applyCategorySuggestions(rows, ctx) {
	if (!ctx?.env) return;
	const targets = rows.filter((r) =>
		(r.kind ?? 'standard') === 'standard'
		&& (!r.primaryCategory || !r.secondaryCategory)
	);
	if (targets.length === 0) return;

	let suggestions;
	try {
		suggestions = await suggestCategoriesForLines(ctx.env, {
			userId:      ctx.userId,
			workspaceId: ctx.workspaceId,
			merchant:    ctx.merchant
		}, targets.map((r) => ({ description: r.description ?? null })));
	} catch (/** @type {any} */ err) {
		// Index empty / Vectorize hiccup — fail open, leave rows as-is.
		console.warn('[xero-sync] kNN suggestion skipped:', err?.message ?? err);
		return;
	}

	for (let i = 0; i < targets.length; i++) {
		const s = suggestions[i];
		if (!s) continue;
		const t = targets[i];
		if (!t.primaryCategory)   t.primaryCategory   = s.primary;
		if (!t.secondaryCategory) t.secondaryCategory = s.secondary;
		t.aiSuggested = true;
	}
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
