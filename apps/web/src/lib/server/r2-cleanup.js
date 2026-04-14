import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, isNotNull, lt, or, sql, inArray } from 'drizzle-orm';

const R2_ABANDONED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — fallback for never-committed

/**
 * Deletes expired R2 objects for both receipts and sales, then clears their r2Key.
 *
 * Two expiry rules:
 *   1. Synced rows  — r2ExpiresAt IS NOT NULL AND r2ExpiresAt < now
 *   2. Abandoned    — r2ExpiresAt IS NULL AND r2Key IS NOT NULL
 *                      AND status IN (failed, staged, pending, processing)
 *                      AND createdAt < now - 30 days
 *
 * @param {App.Platform['env']} env
 * @returns {Promise<{ receiptsDeleted: number; salesDeleted: number }>}
 */
export async function cleanupExpiredR2Objects(env) {
	const now = Date.now();
	const abandonedCutoff = now - R2_ABANDONED_TTL_MS;
	const abandonedStatuses = ['failed', 'staged', 'pending', 'processing'];

	const [expiredReceipts, expiredSales] = await Promise.all([
		db
			.select({ id: schema.receipt.id, r2Key: schema.receipt.r2Key })
			.from(schema.receipt)
			.where(
				and(
					isNotNull(schema.receipt.r2Key),
					or(
						// Rule 1: synced with an explicit expiry
						and(
							isNotNull(schema.receipt.r2ExpiresAt),
							lt(schema.receipt.r2ExpiresAt, new Date(now))
						),
						// Rule 2: never committed, older than 30 days
						and(
							sql`${schema.receipt.r2ExpiresAt} IS NULL`,
							inArray(schema.receipt.status, abandonedStatuses),
							lt(schema.receipt.createdAt, new Date(abandonedCutoff))
						)
					)
				)
			),

		db
			.select({ id: schema.sale.id, r2Key: schema.sale.r2Key })
			.from(schema.sale)
			.where(
				and(
					isNotNull(schema.sale.r2Key),
					or(
						and(
							isNotNull(schema.sale.r2ExpiresAt),
							lt(schema.sale.r2ExpiresAt, new Date(now))
						),
						and(
							sql`${schema.sale.r2ExpiresAt} IS NULL`,
							inArray(schema.sale.status, abandonedStatuses),
							lt(schema.sale.createdAt, new Date(abandonedCutoff))
						)
					)
				)
			),
	]);

	let receiptsDeleted = 0;
	let salesDeleted    = 0;

	// Delete R2 objects and clear keys — do them concurrently but don't fail the whole
	// run if one object is missing (already deleted manually, etc.)
	await Promise.all([
		...expiredReceipts.map(async ({ id, r2Key }) => {
			try {
				if (r2Key) await env.fuzzyfinance_receipts.delete(r2Key);
				await db
					.update(schema.receipt)
					.set({ r2Key: null })
					.where(sql`${schema.receipt.id} = ${id}`);
				receiptsDeleted++;
			} catch (err) {
				console.warn(`[r2-cleanup] Failed to delete receipt R2 object ${r2Key}:`, err);
			}
		}),

		...expiredSales.map(async ({ id, r2Key }) => {
			try {
				if (r2Key) await env.fuzzyfinance_receipts.delete(r2Key);
				await db
					.update(schema.sale)
					.set({ r2Key: null })
					.where(sql`${schema.sale.id} = ${id}`);
				salesDeleted++;
			} catch (err) {
				console.warn(`[r2-cleanup] Failed to delete sale R2 object ${r2Key}:`, err);
			}
		}),
	]);

	console.log(`[r2-cleanup] Deleted ${receiptsDeleted} receipt + ${salesDeleted} sale R2 objects`);
	return { receiptsDeleted, salesDeleted };
}
