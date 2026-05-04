import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { inArray } from 'drizzle-orm';
import { searchSales } from '$lib/server/vectorize';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env?.VECTORIZE) error(503, 'Vector index unavailable');

	const body = await request.json();
	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if (!query) error(400, 'Missing query string');

	const matches = await searchSales(platform.env, locals.user.id, query);

	if (!matches.length) return json([]);

	const ids = matches.map((m) => m.id);
	const rows = await db
		.select()
		.from(schema.sale)
		.where(inArray(schema.sale.id, ids));

	const scored = rows
		.map((row) => ({
			...row,
			score: matches.find((m) => m.id === row.id)?.score ?? 0
		}))
		.sort((a, b) => b.score - a.score);

	return json(scored);
}
