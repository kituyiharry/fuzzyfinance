import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, sql, desc, asc, like, gte, lte, or } from 'drizzle-orm';

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
export async function load({ locals, url }) {
	if (!locals.user) redirect(302, '/');

	const uid = locals.user.id;

	const q        = url.searchParams.get('q')?.trim()  || '';
	const status   = url.searchParams.get('status')     || '';
	const category = url.searchParams.get('category')   || '';
	const sort     = url.searchParams.get('sort')        || 'uploaded_desc';
	const dateFrom = url.searchParams.get('dateFrom')   || '';
	const dateTo   = url.searchParams.get('dateTo')     || '';
	const page     = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const offset   = (page - 1) * PAGE_SIZE;

	const conditions = [eq(schema.sale.userId, uid)];

	if (q) {
		const textSearch = or(
			like(schema.sale.documentTitle, `%${q}%`),
			like(schema.sale.category,      `%${q}%`),
			like(schema.sale.notes,         `%${q}%`)
		);
		if (textSearch) conditions.push(textSearch);
	}
	if (status   && STATUSES.includes(status))   conditions.push(eq(schema.sale.status, status));
	if (category) conditions.push(eq(schema.sale.category, category));
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
		filters: { q, status, category, sort, dateFrom, dateTo }
	};
}
