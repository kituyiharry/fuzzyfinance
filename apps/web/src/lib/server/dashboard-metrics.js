import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, sql, and, inArray, isNotNull } from 'drizzle-orm';
import { getIntegrationStatus } from '$lib/server/integration-health';

const DAILY_LIMIT = 30;

/**
 * @typedef {{
 *   successCount:            number;
 *   failedCount:             number;
 *   totalStorageBytes:       number;
 *   todayCount:              number;
 *   dailyLimit:              number;
 *   integrationStatus:       import('./integration-health.js').IntegrationStatus;
 *   spendingByReceiptDate:   DaySpend[];
 *   spendingByProcessingDate: DaySpend[];
 * }} DashboardMetrics
 *
 * @typedef {{ day: string; totalAmount: number; receiptCount: number }} DaySpend
 */

/**
 * Runs all dashboard metric queries in parallel for a given user.
 *
 * @param {string} userId
 * @returns {Promise<DashboardMetrics>}
 */
export async function getDashboardMetrics(userId) {
	const [
		statusCounts,
		storageResult,
		todayResult,
		spendingByReceiptDate,
		spendingByProcessingDate,
		integrationStatus
	] = await Promise.all([
		// Success + failed counts in one query
		db
			.select({
				status: schema.receipt.status,
				count: sql`COUNT(*)`.as('count')
			})
			.from(schema.receipt)
			.where(eq(schema.receipt.userId, userId))
			.groupBy(schema.receipt.status),

		// Total storage
		db
			.select({
				total: sql`COALESCE(SUM(${schema.receipt.rawSizeBytes}), 0)`.as('total')
			})
			.from(schema.receipt)
			.where(eq(schema.receipt.userId, userId)),

		// Today's upload count — DATE() operates in seconds, createdAt is ms
		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.receipt)
			.where(
				and(
					eq(schema.receipt.userId, userId),
					sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)
			),

		// Spending grouped by the date printed on the receipt (last 30 days)
		db
			.select({
				day:          sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.receipt.total} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
			.from(schema.receipt)
			.where(
				and(
					eq(schema.receipt.userId, userId),
					inArray(schema.receipt.status, ['complete', 'complete_no_sync']),
					isNotNull(schema.receipt.receiptDate),
					sql`${schema.receipt.receiptDate} >= ${Date.now() - 30 * 24 * 60 * 60 * 1000}`
				)
			)
			.groupBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`),

		// Spending grouped by processing date (createdAt, last 30 days)
		db
			.select({
				day:          sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.receipt.total} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
			.from(schema.receipt)
			.where(
				and(
					eq(schema.receipt.userId, userId),
					inArray(schema.receipt.status, ['complete', 'complete_no_sync']),
					sql`${schema.receipt.createdAt} >= ${Date.now() - 30 * 24 * 60 * 60 * 1000}`
				)
			)
			.groupBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`),

		getIntegrationStatus(userId)
	]);

	// Tally success / failed from the grouped status results
	let successCount = 0;
	let failedCount  = 0;
	for (const row of statusCounts) {
		const n = Number(row.count);
		if (row.status === 'complete' || row.status === 'complete_no_sync') successCount += n;
		if (row.status === 'failed') failedCount += n;
	}

	return {
		successCount,
		failedCount,
		totalStorageBytes:        Number(storageResult[0]?.total ?? 0),
		todayCount:               Number(todayResult[0]?.count ?? 0),
		dailyLimit:               DAILY_LIMIT,
		integrationStatus,
		spendingByReceiptDate:    /** @type {DaySpend[]} */ (spendingByReceiptDate.map(normalise)),
		spendingByProcessingDate: /** @type {DaySpend[]} */ (spendingByProcessingDate.map(normalise))
	};
}

/**
 * Coerce raw DB row values to the correct JS types.
 * @param {any} row
 * @returns {DaySpend}
 */
function normalise(row) {
	return {
		day:          String(row.day ?? ''),
		totalAmount:  Number(row.totalAmount ?? 0),
		receiptCount: Number(row.receiptCount ?? 0)
	};
}
