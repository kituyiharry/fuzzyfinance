import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [exported] = await db.select()
		.from(schema.receiptExport)
		.where(and(
			eq(schema.receiptExport.id, params.id),
			eq(schema.receiptExport.userId, locals.user.id)
		));

	if (!exported) error(404, 'Export not found');

	return new Response(exported.csvData, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${exported.fileName}"`,
			'Cache-Control': 'no-store'
		}
	});
}
