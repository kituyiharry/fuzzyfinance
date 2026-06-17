import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { getOrCreateVisualization } from '$lib/server/visualization';

/**
 * @param {string | null | undefined} raw
 * @returns {'expense' | 'revenue'}
 */
function parseSide(raw) {
	return raw === 'revenue' ? 'revenue' : 'expense';
}

/**
 * Load (or lazily generate) the visualization JSON for a saved export.
 * `?side=expense|revenue` picks which export table to read from — same
 * `[exportId]` route serves both kinds.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params, url, locals, platform }) {
	if (!locals.user) redirect(302, '/');
	if (!platform?.env?.fuzzyfinance_exports) error(500, 'R2 binding missing');

	const exportId = params.exportId;
	const side = parseSide(url.searchParams.get('side'));

	// Verify ownership + grab metadata for the header. Each side has its
	// own table; we never read the wrong one because side is explicit.
	let exportMeta;
	if (side === 'revenue') {
		const [row] = await db.select({
			id:        schema.saleExport.id,
			fileName:  schema.saleExport.fileName,
			docCount:  schema.saleExport.saleCount,
			rowCount:  schema.saleExport.rowCount,
			createdAt: schema.saleExport.createdAt,
		})
		.from(schema.saleExport)
		.where(and(
			eq(schema.saleExport.id, exportId),
			eq(schema.saleExport.userId, locals.user.id),
		));
		exportMeta = row;
	} else {
		const [row] = await db.select({
			id:        schema.receiptExport.id,
			fileName:  schema.receiptExport.fileName,
			docCount:  schema.receiptExport.receiptCount,
			rowCount:  schema.receiptExport.rowCount,
			createdAt: schema.receiptExport.createdAt,
		})
		.from(schema.receiptExport)
		.where(and(
			eq(schema.receiptExport.id, exportId),
			eq(schema.receiptExport.userId, locals.user.id),
		));
		exportMeta = row;
	}
	if (!exportMeta) error(404, 'Export not found');

	let row;
	try {
		({ row } = await getOrCreateVisualization({
			userId:      locals.user.id,
			workspaceId: locals.workspaceId ?? null,
			exportId,
			side,
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

	let baselineCurrency = 'AUD';
	if (locals.workspaceId) {
		const [ws] = await db
			.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, locals.workspaceId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	return {
		side,
		alluvial:  bundle.alluvial  ?? bundle, // bundle on v2; raw alluvial on legacy v1
		trendline: bundle.trendline ?? null,
		exportMeta,
		viz: { id: row.id, nodeCount: row.nodeCount, linkCount: row.linkCount, generatedAt: row.generatedAt },
		baselineCurrency,
	};
}
