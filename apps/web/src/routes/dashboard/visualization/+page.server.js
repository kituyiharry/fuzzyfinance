import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { VIZ_ANALYZER_VERSION } from '$lib/server/visualization';

/**
 * Saved snapshot listing. Each row couples an expense export and a
 * revenue export under one entry, with the per-side viz cache state
 * resolved via left joins on the analyzer-versioned visualization
 * tables. The page surfaces a single picker that — on selection —
 * opens both sides in a split view.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const wsFilter = locals.workspaceId
		? [eq(schema.visualizationSnapshot.workspaceId, locals.workspaceId)]
		: [];

	const rows = await db
		.select({
			id:                 schema.visualizationSnapshot.id,
			label:              schema.visualizationSnapshot.label,
			rangeStart:         schema.visualizationSnapshot.rangeStart,
			rangeEnd:           schema.visualizationSnapshot.rangeEnd,
			createdAt:          schema.visualizationSnapshot.createdAt,
			receiptExportId:    schema.visualizationSnapshot.receiptExportId,
			saleExportId:       schema.visualizationSnapshot.saleExportId,
			expenseFile:        schema.receiptExport.fileName,
			expenseDocCount:    schema.receiptExport.receiptCount,
			expenseRowCount:    schema.receiptExport.rowCount,
			expenseVizId:       schema.receiptExportVisualization.id,
			expenseNodeCount:   schema.receiptExportVisualization.nodeCount,
			expenseLinkCount:   schema.receiptExportVisualization.linkCount,
			revenueFile:        schema.saleExport.fileName,
			revenueDocCount:    schema.saleExport.saleCount,
			revenueRowCount:    schema.saleExport.rowCount,
			revenueVizId:       schema.saleExportVisualization.id,
			revenueNodeCount:   schema.saleExportVisualization.nodeCount,
			revenueLinkCount:   schema.saleExportVisualization.linkCount,
		})
		.from(schema.visualizationSnapshot)
		.leftJoin(schema.receiptExport, eq(schema.receiptExport.id, schema.visualizationSnapshot.receiptExportId))
		.leftJoin(schema.saleExport,    eq(schema.saleExport.id,    schema.visualizationSnapshot.saleExportId))
		.leftJoin(
			schema.receiptExportVisualization,
			and(
				eq(schema.receiptExportVisualization.receiptExportId, schema.visualizationSnapshot.receiptExportId),
				eq(schema.receiptExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			),
		)
		.leftJoin(
			schema.saleExportVisualization,
			and(
				eq(schema.saleExportVisualization.saleExportId, schema.visualizationSnapshot.saleExportId),
				eq(schema.saleExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			),
		)
		.where(and(eq(schema.visualizationSnapshot.userId, locals.user.id), ...wsFilter))
		.orderBy(desc(schema.visualizationSnapshot.createdAt));

	return { snapshots: rows };
}
