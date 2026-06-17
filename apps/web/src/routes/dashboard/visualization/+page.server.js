import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { VIZ_ANALYZER_VERSION } from '$lib/server/visualization';

/**
 * Unified saved-visualizations index. Pulls receipt exports + sale
 * exports + their (analyzer-versioned) viz rows in two queries, merges
 * them into one feed tagged with `side`. The page renders a single
 * picker — each card shows what sides are saved and links to the
 * viewer in the appropriate mode.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const wsReceipt = locals.workspaceId
		? [eq(schema.receiptExport.workspaceId, locals.workspaceId)]
		: [];
	const wsSale = locals.workspaceId
		? [eq(schema.saleExport.workspaceId, locals.workspaceId)]
		: [];

	const expenseRows = await db
		.select({
			id:            schema.receiptExport.id,
			fileName:      schema.receiptExport.fileName,
			docCount:      schema.receiptExport.receiptCount,
			rowCount:      schema.receiptExport.rowCount,
			createdAt:     schema.receiptExport.createdAt,
			vizId:         schema.receiptExportVisualization.id,
			nodeCount:     schema.receiptExportVisualization.nodeCount,
			linkCount:     schema.receiptExportVisualization.linkCount,
			generatedAt:   schema.receiptExportVisualization.generatedAt,
		})
		.from(schema.receiptExport)
		.leftJoin(
			schema.receiptExportVisualization,
			and(
				eq(schema.receiptExportVisualization.receiptExportId, schema.receiptExport.id),
				eq(schema.receiptExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			),
		)
		.where(and(eq(schema.receiptExport.userId, locals.user.id), ...wsReceipt))
		.orderBy(desc(schema.receiptExport.createdAt));

	const revenueRows = await db
		.select({
			id:            schema.saleExport.id,
			fileName:      schema.saleExport.fileName,
			docCount:      schema.saleExport.saleCount,
			rowCount:      schema.saleExport.rowCount,
			createdAt:     schema.saleExport.createdAt,
			vizId:         schema.saleExportVisualization.id,
			nodeCount:     schema.saleExportVisualization.nodeCount,
			linkCount:     schema.saleExportVisualization.linkCount,
			generatedAt:   schema.saleExportVisualization.generatedAt,
		})
		.from(schema.saleExport)
		.leftJoin(
			schema.saleExportVisualization,
			and(
				eq(schema.saleExportVisualization.saleExportId, schema.saleExport.id),
				eq(schema.saleExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			),
		)
		.where(and(eq(schema.saleExport.userId, locals.user.id), ...wsSale))
		.orderBy(desc(schema.saleExport.createdAt));

	const exports = [
		...expenseRows.map((r) => ({ ...r, side: /** @type {const} */ ('expense') })),
		...revenueRows.map((r) => ({ ...r, side: /** @type {const} */ ('revenue') })),
	].sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));

	return { exports };
}
