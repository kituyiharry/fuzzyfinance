import { error, json } from '@sveltejs/kit';
import { getOrCreateVisualization } from '$lib/server/visualization';

/**
 * Get-or-create the visualization row for a given receipt export.
 * Idempotent on `(receiptExportId, analyzerVersion)`.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');

	try {
		const { row, cached } = await getOrCreateVisualization({
			userId:      locals.user.id,
			workspaceId: locals.workspaceId ?? null,
			exportId:    params.exportId,
			platform,
		});
		return json({
			id:        row.id,
			r2Key:     row.r2Key,
			nodeCount: row.nodeCount,
			linkCount: row.linkCount,
			cached,
		});
	} catch (/** @type {any} */ e) {
		const msg = e?.message ?? String(e);
		if (msg === 'Export not found')               error(404, msg);
		if (msg === 'HEDAZ service binding missing')  error(500, msg);
		if (msg.startsWith('hedaz analysis failed'))  error(502, msg);
		throw e;
	}
}
