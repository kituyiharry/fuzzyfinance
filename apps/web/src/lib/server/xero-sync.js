/**
 * Xero → FuzzyFinance sync worker.
 *
 * Pulls Invoices (ACCREC = revenue, ACCPAY = expense / bill) from each Xero
 * tenant the user has authorised and upserts them into the existing
 * `sale` / `receipt` tables. Idempotency is keyed on
 * `(userId, externalSource, externalAccountId=Xero InvoiceID GUID)` — a
 * second run for the same horizon updates the same rows in place.
 *
 * Scope of v1 (deliberately small):
 *   - Invoices only (no BankTransactions, no CreditNotes).
 *   - Status mapping: AUTHORISED / PAID / SUBMITTED → 'complete';
 *     DRAFT → 'staged'; VOIDED / DELETED are skipped.
 *   - AccountCode lands in primaryCategory as a string. A proper
 *     chart-of-accounts → category map is Phase 1.5.
 *   - TrackingCategories land in secondaryCategory (first tracking
 *     category only, by name).
 *
 * Rate limits (per Xero): 60 req/min/tenant, 5000 req/day/tenant. We
 * page through Invoices 100 at a time and stop early when a page returns
 * fewer than 100 rows — at most ~50 requests per tenant for a yearly
 * delta-sync, well inside the bucket.
 */

import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { getValidAccessToken } from '$lib/server/token-refresh';

const XERO_API = 'https://api.xero.com/api.xro/2.0';

/**
 * Top-level sync entry. Loads the user's Xero integration + tenant list,
 * iterates them, runs both ACCREC and ACCPAY pulls per tenant. Returns a
 * summary so the caller (manual button or future cron) can surface it.
 *
 * @param {string} userId
 * @returns {Promise<{ tenants: number, invoicesCreated: number, invoicesUpdated: number, skipped: number, errors: string[] }>}
 */
export async function syncUserXero(userId) {
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

	// Delta sync: only pull rows modified since the last successful sync
	// (or, on first run, last 90 days — enough to seed the visualisations).
	const sinceISO = metadata.lastSyncedAt
		? new Date(metadata.lastSyncedAt).toUTCString()
		: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toUTCString();

	const accessToken = await getValidAccessToken(userId, 'xero');
	if (!accessToken) {
		throw new Error('AUTH_REQUIRED: Xero access token unavailable — reconnect.');
	}

	for (const tenant of tenants) {
		try {
			const accrec = await syncTenant(userId, accessToken, tenant, 'ACCREC', sinceISO);
			summary.invoicesCreated += accrec.created;
			summary.invoicesUpdated += accrec.updated;
			summary.skipped         += accrec.skipped;
			const accpay = await syncTenant(userId, accessToken, tenant, 'ACCPAY', sinceISO);
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
 * @param {string} userId
 * @param {string} accessToken
 * @param {{ tenantId: string, tenantName?: string }} tenant
 * @param {'ACCREC' | 'ACCPAY'} invoiceType
 * @param {string} sinceISO        RFC-1123 UTC string for If-Modified-Since
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
export async function syncTenant(userId, accessToken, tenant, invoiceType, sinceISO) {
	const externalSource = invoiceType === 'ACCREC' ? 'xero-invoice-accrec' : 'xero-invoice-accpay';
	const result = { created: 0, updated: 0, skipped: 0 };

	for (let page = 1; page < 200; page++) { // hard ceiling — 20k invoices/page-slice
		const url = new URL(`${XERO_API}/Invoices`);
		url.searchParams.set('Type', invoiceType);
		url.searchParams.set('page', String(page));
		url.searchParams.set('order', 'UpdatedDateUTC DESC');

		const res = await fetch(url, {
			headers: {
				Authorization:        `Bearer ${accessToken}`,
				'xero-tenant-id':     tenant.tenantId,
				Accept:               'application/json',
				'If-Modified-Since':  sinceISO
			}
		});

		if (res.status === 304) break; // no changes since sinceISO
		if (!res.ok) {
			throw new Error(`Xero ${invoiceType} pull failed (${res.status}): ${await res.text()}`);
		}

		const body = await res.json();
		/** @type {Array<any>} */
		const invoices = body?.Invoices ?? [];
		if (invoices.length === 0) break;

		for (const inv of invoices) {
			const outcome = await _upsertInvoice(userId, externalSource, inv);
			if      (outcome === 'created') result.created++;
			else if (outcome === 'updated') result.updated++;
			else                            result.skipped++;
		}

		if (invoices.length < 100) break; // last page
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
 * @returns {Promise<'created' | 'updated' | 'skipped'>}
 */
async function _upsertInvoice(userId, externalSource, inv) {
	const invoiceId = inv.InvoiceID;
	if (!invoiceId) return 'skipped';

	// Drop tombstones; we don't carry deleted/voided into our DB.
	if (inv.Status === 'VOIDED' || inv.Status === 'DELETED') return 'skipped';

	const status = (inv.Status === 'DRAFT') ? 'staged' : 'complete';

	if (externalSource === 'xero-invoice-accrec') {
		return _upsertSale(userId, invoiceId, status, inv);
	}
	return _upsertReceipt(userId, invoiceId, status, inv);
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertSale(userId, invoiceId, status, inv) {
	const externalSource = 'xero-invoice-accrec';

	const documentTitle = inv?.Contact?.Name ?? inv?.InvoiceNumber ?? null;
	const saleDate      = _parseXeroDate(inv?.Date);
	const totalRevenue  = inv?.Total != null    ? String(inv.Total)    : null;
	const currency      = inv?.CurrencyCode ?? null;

	const existing = await _findExistingSale(userId, externalSource, invoiceId);

	if (existing) {
		await db.update(schema.sale)
			.set({ status, documentTitle, saleDate, totalRevenue, currency })
			.where(eq(schema.sale.id, existing.id));
		// Replace line items wholesale — simpler than diffing, fine at our scale.
		await db.delete(schema.saleLineItem).where(eq(schema.saleLineItem.saleId, existing.id));
		await _insertSaleLineItems(existing.id, inv?.LineItems ?? []);
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.sale).values({
		id, userId, workspaceId: null, status,
		documentTitle, saleDate, totalRevenue, currency,
		externalSource, externalAccountId: invoiceId
	});
	await _insertSaleLineItems(id, inv?.LineItems ?? []);
	return 'created';
}

/**
 * @param {string} userId
 * @param {string} invoiceId
 * @param {'staged' | 'complete'} status
 * @param {any} inv
 * @returns {Promise<'created' | 'updated'>}
 */
async function _upsertReceipt(userId, invoiceId, status, inv) {
	const externalSource = 'xero-invoice-accpay';

	const merchantName  = inv?.Contact?.Name ?? null;
	const receiptDate   = _parseXeroDate(inv?.Date);
	const total         = inv?.Total    != null ? String(inv.Total)    : null;
	const subtotal      = inv?.SubTotal != null ? String(inv.SubTotal) : null;
	const tax           = inv?.TotalTax != null ? String(inv.TotalTax) : null;
	const currency      = inv?.CurrencyCode ?? null;
	const invoiceNumber = inv?.InvoiceNumber ?? null;

	const existing = await _findExistingReceipt(userId, externalSource, invoiceId);

	if (existing) {
		await db.update(schema.receipt)
			.set({ status, merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber })
			.where(eq(schema.receipt.id, existing.id));
		await db.delete(schema.receiptLineItem).where(eq(schema.receiptLineItem.receiptId, existing.id));
		await _insertReceiptLineItems(existing.id, inv?.LineItems ?? []);
		return 'updated';
	}

	const id = crypto.randomUUID();
	await db.insert(schema.receipt).values({
		id, userId, workspaceId: null, status,
		merchantName, receiptDate, total, subtotal, tax, currency, invoiceNumber,
		externalSource, externalAccountId: invoiceId
	});
	await _insertReceiptLineItems(id, inv?.LineItems ?? []);
	return 'created';
}

/**
 * @param {string} saleId
 * @param {Array<any>} lineItems
 */
async function _insertSaleLineItems(saleId, lineItems) {
	if (!Array.isArray(lineItems) || lineItems.length === 0) return;

	const rows = lineItems.map((li, idx) => {
		const trackingName = li?.Tracking?.[0]?.Option ?? null;
		return {
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
			sortOrder:         idx
		};
	});
	await db.insert(schema.saleLineItem).values(rows);
}

/**
 * @param {string} receiptId
 * @param {Array<any>} lineItems
 */
async function _insertReceiptLineItems(receiptId, lineItems) {
	if (!Array.isArray(lineItems) || lineItems.length === 0) return;

	const rows = lineItems.map((li, idx) => {
		const trackingName = li?.Tracking?.[0]?.Option ?? null;
		return {
			id:                crypto.randomUUID(),
			receiptId,
			description:       li?.Description ?? null,
			qty:               li?.Quantity   != null ? String(li.Quantity)   : null,
			unitPrice:         li?.UnitAmount != null ? String(li.UnitAmount) : null,
			total:             li?.LineAmount != null ? String(li.LineAmount) : null,
			unitSize:          null,
			unitType:          null,
			primaryCategory:   li?.AccountCode ?? null,
			secondaryCategory: trackingName,
			sortOrder:         idx
		};
	});
	await db.insert(schema.receiptLineItem).values(rows);
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
