import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';

/**
 * Stream the AlluvialData JSON from R2 for a given visualization row.
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env?.fuzzyfinance_exports) error(500, 'R2 binding missing');

	const [viz] = await db.select()
		.from(schema.receiptExportVisualization)
		.where(and(
			eq(schema.receiptExportVisualization.id, params.id),
			eq(schema.receiptExportVisualization.userId, locals.user.id)
		));
	if (!viz) error(404, 'Visualization not found');

	const object = await platform.env.fuzzyfinance_exports.get(viz.r2Key);
	if (!object) error(404, 'Visualization JSON missing from R2');

	return new Response(object.body, {
		headers: {
			'Content-Type':  'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}
