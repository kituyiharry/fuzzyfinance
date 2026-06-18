import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { getOrCreateVisualization } from '$lib/server/visualization';

/**
 * Snapshot viewer load. Resolves both sides (expense + revenue) by
 * dispatching to the side-aware viz cache, fetches both bundles from
 * R2, and hands them to the page so the Sankey / Trendlines / Treemap
 * tabs can render them side by side.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params, locals, platform }) {
	if (!locals.user) redirect(302, '/');
	if (!platform?.env?.fuzzyfinance_exports) error(500, 'R2 binding missing');

	const [snap] = await db.select()
		.from(schema.visualizationSnapshot)
		.where(and(
			eq(schema.visualizationSnapshot.id, params.snapshotId),
			eq(schema.visualizationSnapshot.userId, locals.user.id),
		));
	if (!snap) error(404, 'Snapshot not found');

	let expense = null;
	let revenue = null;
	let baselineCurrency = 'AUD';

	if (locals.workspaceId) {
		const [ws] = await db
			.select({ preferredCurrency: schema.workspace.preferredCurrency })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, locals.workspaceId));
		if (ws?.preferredCurrency) baselineCurrency = ws.preferredCurrency;
	}

	if (snap.receiptExportId) {
		const [meta] = await db.select({
			fileName:  schema.receiptExport.fileName,
			docCount:  schema.receiptExport.receiptCount,
			rowCount:  schema.receiptExport.rowCount,
			createdAt: schema.receiptExport.createdAt,
		})
			.from(schema.receiptExport)
			.where(eq(schema.receiptExport.id, snap.receiptExportId));

		try {
			const { row } = await getOrCreateVisualization({
				userId:      locals.user.id,
				workspaceId: locals.workspaceId ?? null,
				exportId:    snap.receiptExportId,
				side:        'expense',
				platform,
			});
			const object = await platform.env.fuzzyfinance_exports.get(row.r2Key);
			if (object) {
				const bundle = await object.json();
				expense = {
					exportId:  snap.receiptExportId,
					meta,
					alluvial:  bundle.alluvial  ?? bundle,
					trendline: bundle.trendline ?? null,
					viz:       { id: row.id, nodeCount: row.nodeCount, linkCount: row.linkCount, generatedAt: row.generatedAt },
				};
			}
		} catch (/** @type {any} */ e) {
			expense = { error: e?.message ?? String(e), meta, exportId: snap.receiptExportId };
		}
	}

	if (snap.saleExportId) {
		const [meta] = await db.select({
			fileName:  schema.saleExport.fileName,
			docCount:  schema.saleExport.saleCount,
			rowCount:  schema.saleExport.rowCount,
			createdAt: schema.saleExport.createdAt,
		})
			.from(schema.saleExport)
			.where(eq(schema.saleExport.id, snap.saleExportId));

		try {
			const { row } = await getOrCreateVisualization({
				userId:      locals.user.id,
				workspaceId: locals.workspaceId ?? null,
				exportId:    snap.saleExportId,
				side:        'revenue',
				platform,
			});
			const object = await platform.env.fuzzyfinance_exports.get(row.r2Key);
			if (object) {
				const bundle = await object.json();
				revenue = {
					exportId:  snap.saleExportId,
					meta,
					alluvial:  bundle.alluvial  ?? bundle,
					trendline: bundle.trendline ?? null,
					viz:       { id: row.id, nodeCount: row.nodeCount, linkCount: row.linkCount, generatedAt: row.generatedAt },
				};
			}
		} catch (/** @type {any} */ e) {
			revenue = { error: e?.message ?? String(e), meta, exportId: snap.saleExportId };
		}
	}

	return {
		snapshot: { id: snap.id, label: snap.label, rangeStart: snap.rangeStart, rangeEnd: snap.rangeEnd, createdAt: snap.createdAt },
		expense,
		revenue,
		baselineCurrency,
	};
}
