/**
 * Semver of the Rust analyser output format. Must stay in lockstep with
 * `ANALYZER_VERSION` in apps/zadeh/src/lib.rs. Bumping invalidates cached
 * visualization rows — the next request for an export regenerates the JSON.
 *
 * v2: bundle format — R2 object now contains both `alluvial` and `trendline`.
 */
export const VIZ_ANALYZER_VERSION = '2.0.0';

/**
 * R2 object key for a generated visualization. Side baked into the path
 * so receipt + sale exports with colliding UUIDs (cosmically improbable
 * but possible) never overwrite each other.
 *
 * @param {string} userId
 * @param {string} exportId
 * @param {string} version
 * @param {'expense' | 'revenue'} side
 */
export const r2KeyFor = (userId, exportId, version, side = 'expense') =>
	`visualizations/${side}/${userId}/${exportId}/${version}.json`;

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';

/**
 * Get the cached visualization row for `(exportId, current version)` or
 * generate it via hedaz, persist to R2 + DB, and return the new row.
 *
 * `side` selects which export table to read from + write the viz to:
 *   - 'expense' → `receipt_export` + `receipt_export_visualization`
 *   - 'revenue' → `sale_export`    + `sale_export_visualization`
 *
 * The CSV column on each table already carries everything hedaz needs —
 * the sale CSV happens to use the same column layout as the receipt CSV
 * (see `sale-csv.js`), so the hedaz pipeline stays one source of truth.
 *
 * Throws if the export isn't owned by `userId`, if HEDAZ isn't bound,
 * or if the hedaz call fails (caller maps to HTTP status).
 *
 * @param {{ userId: string; workspaceId: string | null; exportId: string; side?: 'expense' | 'revenue'; platform: App.Platform | undefined }} args
 */
export async function getOrCreateVisualization({ userId, workspaceId, exportId, side = 'expense', platform }) {
	if (!platform?.env?.HEDAZ) throw new Error('HEDAZ service binding missing');

	if (side === 'revenue') {
		const [exported] = await db.select()
			.from(schema.saleExport)
			.where(and(
				eq(schema.saleExport.id, exportId),
				eq(schema.saleExport.userId, userId),
			));
		if (!exported) throw new Error('Export not found');

		const [cached] = await db.select()
			.from(schema.saleExportVisualization)
			.where(and(
				eq(schema.saleExportVisualization.saleExportId, exportId),
				eq(schema.saleExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
			));
		if (cached) return { row: cached, cached: true, side };

		const r2Key = r2KeyFor(userId, exportId, VIZ_ANALYZER_VERSION, 'revenue');
		const hedazResponse = await platform.env.HEDAZ.fetch(
			new Request('http://hedaz/analyse/export', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					csv_text:         exported.csvData,
					r2_key:           r2Key,
					default_currency: 'AUD',
				}),
			})
		);
		if (!hedazResponse.ok) {
			const detail = await hedazResponse.text();
			throw new Error(`hedaz analysis failed: ${detail}`);
		}
		const { node_count, link_count } = await hedazResponse.json();

		const [inserted] = await db.insert(schema.saleExportVisualization).values({
			id:              crypto.randomUUID(),
			userId,
			workspaceId,
			saleExportId:    exportId,
			analyzerVersion: VIZ_ANALYZER_VERSION,
			r2Key,
			nodeCount:       node_count,
			linkCount:       link_count,
		}).returning();

		return { row: inserted, cached: false, side };
	}

	// side === 'expense'
	const [exported] = await db.select()
		.from(schema.receiptExport)
		.where(and(
			eq(schema.receiptExport.id, exportId),
			eq(schema.receiptExport.userId, userId),
		));
	if (!exported) throw new Error('Export not found');

	const [cached] = await db.select()
		.from(schema.receiptExportVisualization)
		.where(and(
			eq(schema.receiptExportVisualization.receiptExportId, exportId),
			eq(schema.receiptExportVisualization.analyzerVersion, VIZ_ANALYZER_VERSION),
		));
	if (cached) return { row: cached, cached: true, side };

	const r2Key = r2KeyFor(userId, exportId, VIZ_ANALYZER_VERSION, 'expense');
	const hedazResponse = await platform.env.HEDAZ.fetch(
		new Request('http://hedaz/analyse/export', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				csv_text:         exported.csvData,
				r2_key:           r2Key,
				default_currency: 'AUD',
			}),
		})
	);
	if (!hedazResponse.ok) {
		const detail = await hedazResponse.text();
		throw new Error(`hedaz analysis failed: ${detail}`);
	}
	const { node_count, link_count } = await hedazResponse.json();

	const [inserted] = await db.insert(schema.receiptExportVisualization).values({
		id:               crypto.randomUUID(),
		userId,
		workspaceId,
		receiptExportId:  exportId,
		analyzerVersion:  VIZ_ANALYZER_VERSION,
		r2Key,
		nodeCount:        node_count,
		linkCount:        link_count,
	}).returning();

	return { row: inserted, cached: false, side };
}
