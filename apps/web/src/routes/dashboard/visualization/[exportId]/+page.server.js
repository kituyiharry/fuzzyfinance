import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { getOrCreateVisualization } from '$lib/server/visualization';

/**
 * Load (or lazily generate) the visualization JSON for a receipt export
 * and pass it to the page for rendering.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params, locals, platform }) {
	if (!locals.user) redirect(302, '/');
	if (!platform?.env?.fuzzyfinance_exports) error(500, 'R2 binding missing');

	const exportId = params.exportId;

	// Verify ownership + grab metadata for the header
	const [exportMeta] = await db.select({
		id:           schema.receiptExport.id,
		fileName:     schema.receiptExport.fileName,
		receiptCount: schema.receiptExport.receiptCount,
		rowCount:     schema.receiptExport.rowCount,
		createdAt:    schema.receiptExport.createdAt,
	})
	.from(schema.receiptExport)
	.where(and(
		eq(schema.receiptExport.id, exportId),
		eq(schema.receiptExport.userId, locals.user.id),
	));
	if (!exportMeta) error(404, 'Export not found');

	let row;
	try {
		({ row } = await getOrCreateVisualization({
			userId:      locals.user.id,
			workspaceId: locals.workspaceId ?? null,
			exportId,
			platform,
		}));
	} catch (/** @type {any} */ e) {
		const msg = e?.message ?? String(e);
		if (msg.startsWith('hedaz analysis failed')) error(502, msg);
		throw e;
	}

	const object = await platform.env.fuzzyfinance_exports.get(row.r2Key);
	if (!object) error(404, 'Visualization JSON missing from R2');
	const bundle = await object.json();

	return {
		alluvial:  bundle.alluvial  ?? bundle, // bundle on v2; raw alluvial on legacy v1
		trendline: bundle.trendline ?? null,
		exportMeta,
		viz: { id: row.id, nodeCount: row.nodeCount, linkCount: row.linkCount, generatedAt: row.generatedAt },
	};
}
