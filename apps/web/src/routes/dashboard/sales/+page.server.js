import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, sql, desc, asc, like, gte, lte, or, inArray } from 'drizzle-orm';
import { searchSales } from '$lib/server/vectorize';

const PAGE_SIZE = 10;

const STATUSES = ['pending', 'processing', 'staged', 'complete', 'complete_no_sync', 'failed'];

const SORT_MAP = {
	date_desc:      desc(schema.sale.saleDate),
	date_asc:       asc(schema.sale.saleDate),
	revenue_desc:   desc(schema.sale.totalRevenue),
	revenue_asc:    asc(schema.sale.totalRevenue),
	title_asc:      asc(schema.sale.documentTitle),
	uploaded_desc:  desc(schema.sale.createdAt),
	uploaded_asc:   asc(schema.sale.createdAt)
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	if (!locals.user) redirect(302, '/');

	const uid = locals.user.id;

	const q        = url.searchParams.get('q')?.trim()  || '';
	const status   = url.searchParams.get('status')     || '';
	const category   = url.searchParams.get('category')   || '';
	const receivable = url.searchParams.get('receivable') || ''; // 'open' | 'closed' | 'any' | ''
	const sort     = url.searchParams.get('sort')        || 'uploaded_desc';
	const dateFrom = url.searchParams.get('dateFrom')   || '';
	const dateTo   = url.searchParams.get('dateTo')     || '';
	const page     = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const offset   = (page - 1) * PAGE_SIZE;

	const conditions = [
		eq(schema.sale.userId, uid),
		...(locals.workspaceId ? [eq(schema.sale.workspaceId, locals.workspaceId)] : []),
	];

	if (q) {
		let vectorIds = /** @type {string[]} */ ([]);
		try {
			if (platform?.env?.AI && platform?.env?.VECTORIZE) {
				const matches = await searchSales(platform.env, uid, q, 50);
				vectorIds = matches.map(m => m.id);
			}
		} catch { /* non-fatal — fall back to LIKE */ }

		const likeCondition = or(
			like(schema.sale.documentTitle,  `%${q}%`),
			like(schema.sale.category,       `%${q}%`),
			like(schema.sale.notes,          `%${q}%`),
			like(schema.sale.lineItemsJson,  `%${q}%`)
		);

		const textSearch = vectorIds.length > 0
			? or(inArray(schema.sale.id, vectorIds), likeCondition)
			: likeCondition;

		if (textSearch) conditions.push(textSearch);
	}
	if (status   && STATUSES.includes(status))   conditions.push(eq(schema.sale.status, status));
	if (category) conditions.push(eq(schema.sale.category, category));
	if (receivable === 'open')   conditions.push(sql`EXISTS (SELECT 1 FROM receivable WHERE receivable.sale_id = ${schema.sale.id} AND receivable.status = 'open' AND receivable.user_id = ${uid})`);
	if (receivable === 'closed') conditions.push(sql`EXISTS (SELECT 1 FROM receivable WHERE receivable.sale_id = ${schema.sale.id} AND receivable.status = 'closed' AND receivable.user_id = ${uid})`);
	if (receivable === 'any')    conditions.push(sql`EXISTS (SELECT 1 FROM receivable WHERE receivable.sale_id = ${schema.sale.id} AND receivable.user_id = ${uid})`);
	if (dateFrom) conditions.push(gte(schema.sale.saleDate, new Date(dateFrom)));
	if (dateTo)   conditions.push(lte(schema.sale.saleDate, new Date(dateTo + 'T23:59:59')));

	const where = /** @type {import('drizzle-orm').SQL} */ (and(...conditions));
	const orderBy = (/** @type {Record<string, import('drizzle-orm').SQL>} */ (SORT_MAP))[sort] ?? desc(schema.sale.createdAt);

	const [sales, totalResult] = await Promise.all([
		db.select().from(schema.sale)
			.where(where)
			.orderBy(orderBy)
			.limit(PAGE_SIZE)
			.offset(offset),

		db.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.sale)
			.where(where)
	]);

	const total = Number(totalResult[0]?.count ?? 0);

	const [catRows] = await Promise.all([
		db.selectDistinct({ category: schema.sale.category })
			.from(schema.sale)
			.where(and(eq(schema.sale.userId, uid), sql`${schema.sale.category} IS NOT NULL`))
	]);

	const categories = catRows.map(r => r.category).filter(Boolean).sort();

	return {
		sales,
		page,
		total,
		pageSize: PAGE_SIZE,
		categories,
		filters: { q, status, category, sort, dateFrom, dateTo, receivable }
	};
}
