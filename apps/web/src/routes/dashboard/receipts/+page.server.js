import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, sql, desc, asc, like, gte, lte, or, inArray } from 'drizzle-orm';
import { searchReceipts } from '$lib/server/vectorize';

const PAGE_SIZE = 10;

const STATUSES = ['pending', 'processing', 'staged', 'complete', 'complete_no_sync', 'failed'];

const SORT_MAP = {
	date_desc:     desc(schema.receipt.receiptDate),
	date_asc:      asc(schema.receipt.receiptDate),
	amount_desc:   desc(schema.receipt.total),
	amount_asc:    asc(schema.receipt.total),
	merchant_asc:  asc(schema.receipt.merchantName),
	uploaded_desc: desc(schema.receipt.createdAt),
	uploaded_asc:  asc(schema.receipt.createdAt)
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	if (!locals.user) redirect(302, '/');

	const uid = locals.user.id;

	// ── Parse filter params ─────────────────────────────────────────────────
	const q        = url.searchParams.get('q')?.trim()       || '';
	const status   = url.searchParams.get('status')         || '';
	const category = url.searchParams.get('category')       || '';
	const tag      = url.searchParams.get('tag')            || '';
	const payable  = url.searchParams.get('payable')        || ''; // 'open' | 'closed' | 'any' | ''
	const sort     = url.searchParams.get('sort')           || 'uploaded_desc';
	const dateFrom = url.searchParams.get('dateFrom')       || '';
	const dateTo   = url.searchParams.get('dateTo')         || '';
	const page     = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const offset   = (page - 1) * PAGE_SIZE;

	// ── Build WHERE conditions ───────────────────────────────────────────────
	const conditions = [
		eq(schema.receipt.userId, uid),
		...(locals.workspaceId ? [eq(schema.receipt.workspaceId, locals.workspaceId)] : []),
	];

	if (q) {
		let vectorIds = /** @type {string[]} */ ([]);
		try {
			if (platform?.env?.AI && platform?.env?.VECTORIZE) {
				const matches = await searchReceipts(platform.env, uid, q, 50);
				vectorIds = matches.map(m => m.id);
			}
		} catch { /* non-fatal — fall back to LIKE */ }

		const likeCondition = or(
			like(schema.receipt.merchantName,  `%${q}%`),
			like(schema.receipt.category,      `%${q}%`),
			like(schema.receipt.notes,         `%${q}%`),
			like(schema.receipt.lineItemsJson, `%${q}%`)
		);

		const textSearch = vectorIds.length > 0
			? or(inArray(schema.receipt.id, vectorIds), likeCondition)
			: likeCondition;

		if (textSearch) conditions.push(textSearch);
	}
	if (status   && STATUSES.includes(status))   conditions.push(eq(schema.receipt.status, status));
	if (category) conditions.push(eq(schema.receipt.category, category));
	if (tag)      conditions.push(sql`${schema.receipt.tags} LIKE ${'%"' + tag + '"%'}`);
	if (payable === 'open')   conditions.push(sql`EXISTS (SELECT 1 FROM payable WHERE payable.receipt_id = ${schema.receipt.id} AND payable.status = 'open' AND payable.user_id = ${uid})`);
	if (payable === 'closed') conditions.push(sql`EXISTS (SELECT 1 FROM payable WHERE payable.receipt_id = ${schema.receipt.id} AND payable.status = 'closed' AND payable.user_id = ${uid})`);
	if (payable === 'any')    conditions.push(sql`EXISTS (SELECT 1 FROM payable WHERE payable.receipt_id = ${schema.receipt.id} AND payable.user_id = ${uid})`);
	if (dateFrom) conditions.push(gte(schema.receipt.receiptDate, new Date(dateFrom)));
	if (dateTo)   conditions.push(lte(schema.receipt.receiptDate, new Date(dateTo + 'T23:59:59')));

	// conditions always has at least the userId predicate, so and() will not return undefined
	const where = /** @type {import('drizzle-orm').SQL} */ (and(...conditions));
	const orderBy = (/** @type {Record<string, import('drizzle-orm').SQL>} */ (SORT_MAP))[sort] ?? desc(schema.receipt.createdAt);

	// ── Main queries ─────────────────────────────────────────────────────────
	const [receipts, totalResult] = await Promise.all([
		db.select().from(schema.receipt)
			.where(where)
			.orderBy(orderBy)
			.limit(PAGE_SIZE)
			.offset(offset),

		db.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.receipt)
			.where(where)
	]);

	const total = Number(totalResult[0]?.count ?? 0);

	// ── Filter options ───────────────────────────────────────────────────────
	const [catRows, tagRows] = await Promise.all([
		db.selectDistinct({ category: schema.receipt.category })
			.from(schema.receipt)
			.where(and(eq(schema.receipt.userId, uid), sql`${schema.receipt.category} IS NOT NULL`)),

		db.select({ tags: schema.receipt.tags })
			.from(schema.receipt)
			.where(and(eq(schema.receipt.userId, uid), sql`${schema.receipt.tags} IS NOT NULL`))
	]);

	const categories = catRows.map(r => r.category).filter(Boolean).sort();

	/** @type {string[]} */
	const allTags = [...new Set(
		tagRows.flatMap(r => {
			try { return JSON.parse(r.tags ?? '[]'); } catch { return []; }
		})
	)].sort();

	return {
		receipts,
		page,
		total,
		pageSize: PAGE_SIZE,
		categories,
		allTags,
		filters: { q, status, category, tag, sort, dateFrom, dateTo, payable }
	};
}
