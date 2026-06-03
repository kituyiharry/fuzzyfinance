import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { VIZ_ANALYZER_VERSION } from '$lib/server/visualization';

/**
 * List the user's receipt exports, joined with the current-version
 * visualization row (if one exists). The page renders one card per export
 * with a "Visualize" link; the join tells the UI whether to show
 * "Cached (N nodes)" or "Generate".
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const wsFilter = locals.workspaceId
		? [eq(schema.receiptExport.workspaceId, locals.workspaceId)]
		: [];

	const rows = await db
		.select({
			id:           schema.receiptExport.id,
			fileName:     schema.receiptExport.fileName,
			receiptCount: schema.receiptExport.receiptCount,
			rowCount:     schema.receiptExport.rowCount,
			createdAt:    schema.receiptExport.createdAt,
			vizId:        schema.receiptExportVisualization.id,
			nodeCount:    schema.receiptExportVisualization.nodeCount,
			linkCount:    schema.receiptExportVisualization.linkCount,
			generatedAt:  schema.receiptExportVisualization.generatedAt,
		})
		.from(schema.receiptExport)
		.leftJoin(
			schema.receiptExportVisualization,
			and(
				eq(schema.receiptExportVisualization.receiptExportId, schema.receiptExport.id),
				eq(schema.receiptExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			),
		)
		.where(and(eq(schema.receiptExport.userId, locals.user.id), ...wsFilter))
		.orderBy(desc(schema.receiptExport.createdAt));

	return { exports: rows };
}
