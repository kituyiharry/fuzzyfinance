import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, sql, and, inArray, isNotNull } from 'drizzle-orm';
import { getIntegrationStatus } from '$lib/server/integration-health';

const DAILY_LIMIT = 30;

/**
 * @typedef {{
 *   successCount:             number;
 *   failedCount:              number;
 *   stagedCount:              number;
 *   editedCount:              number;
 *   committedCount:           number;
 *   totalStorageBytes:        number;
 *   todayCount:               number;
 *   dailyLimit:               number;
 *   integrationStatus:        import('./integration-health.js').IntegrationStatus;
 *   spendingByReceiptDate:    DaySpend[];
 *   spendingByProcessingDate: DaySpend[];
 *   salesSuccessCount:        number;
 *   salesFailedCount:         number;
 *   salesStagedCount:         number;
 *   salesEditedCount:         number;
 *   salesTodayCount:          number;
 *   revenueByDate:            DaySpend[];
 *   revenueByProcessingDate:  DaySpend[];
 * }} DashboardMetrics
 *
 * @typedef {{ day: string; totalAmount: number; receiptCount: number }} DaySpend
 */

/**
 * Runs all dashboard metric queries in a single batch round-trip.
 *
 * @param {string} userId
 * @returns {Promise<DashboardMetrics>}
 */
export async function getDashboardMetrics(userId) {
	const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

	// Single batch: 15 queries → 1 HTTP round-trip to Turso.
	// getIntegrationStatus runs in parallel alongside the batch (it hits a different table/service).
	const [batchResults, integrationStatus] = await Promise.all([
		db.batch([
			// 0 — receipt status counts
			db.select({ status: schema.receipt.status, count: sql`COUNT(*)`.as('count') })
				.from(schema.receipt)
				.where(eq(schema.receipt.userId, userId))
				.groupBy(schema.receipt.status),

			// 1 — receipt storage bytes
			db.select({ total: sql`COALESCE(SUM(${schema.receipt.rawSizeBytes}), 0)`.as('total') })
				.from(schema.receipt)
				.where(eq(schema.receipt.userId, userId)),

			// 2 — receipt today count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.receipt)
				.where(and(
					eq(schema.receipt.userId, userId),
					sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)),

			// 3 — receipt staged count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.receipt)
				.where(and(eq(schema.receipt.userId, userId), eq(schema.receipt.status, 'staged'))),

			// 4 — receipt edited count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.receipt)
				.where(and(
					eq(schema.receipt.userId, userId),
					sql`${schema.receipt.correctedFields} IS NOT NULL`,
					sql`${schema.receipt.correctedFields} != '[]'`
				)),

			// 5 — spending by receipt date (last 30 days)
			db.select({
				day:          sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.receipt.total} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
				.from(schema.receipt)
				.where(and(
					eq(schema.receipt.userId, userId),
					inArray(schema.receipt.status, ['complete', 'complete_no_sync']),
					isNotNull(schema.receipt.receiptDate),
					sql`${schema.receipt.receiptDate} >= ${thirtyDaysAgo}`
				))
				.groupBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`)
				.orderBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`),

			// 6 — spending by processing date (last 30 days)
			db.select({
				day:          sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.receipt.total} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
				.from(schema.receipt)
				.where(and(
					eq(schema.receipt.userId, userId),
					inArray(schema.receipt.status, ['complete', 'complete_no_sync']),
					sql`${schema.receipt.createdAt} >= ${thirtyDaysAgo}`
				))
				.groupBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`)
				.orderBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`),

			// 7 — sales status counts
			db.select({ status: schema.sale.status, count: sql`COUNT(*)`.as('count') })
				.from(schema.sale)
				.where(eq(schema.sale.userId, userId))
				.groupBy(schema.sale.status),

			// 8 — sales storage bytes
			db.select({ total: sql`COALESCE(SUM(${schema.sale.rawSizeBytes}), 0)`.as('total') })
				.from(schema.sale)
				.where(eq(schema.sale.userId, userId)),

			// 9 — sales today count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.sale)
				.where(and(
					eq(schema.sale.userId, userId),
					sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)),

			// 10 — sales staged count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.sale)
				.where(and(eq(schema.sale.userId, userId), eq(schema.sale.status, 'staged'))),

			// 11 — sales edited count
			db.select({ count: sql`COUNT(*)`.as('count') })
				.from(schema.sale)
				.where(and(
					eq(schema.sale.userId, userId),
					sql`${schema.sale.correctedFields} IS NOT NULL`,
					sql`${schema.sale.correctedFields} != '[]'`
				)),

			// 12 — revenue by sale date (last 30 days)
			db.select({
				day:          sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.sale.totalRevenue} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
				.from(schema.sale)
				.where(and(
					eq(schema.sale.userId, userId),
					inArray(schema.sale.status, ['complete', 'complete_no_sync']),
					isNotNull(schema.sale.saleDate),
					sql`${schema.sale.saleDate} >= ${thirtyDaysAgo}`
				))
				.groupBy(sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`)
				.orderBy(sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`),

			// 13 — revenue by processing date (last 30 days)
			db.select({
				day:          sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.sale.totalRevenue} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
				.from(schema.sale)
				.where(and(
					eq(schema.sale.userId, userId),
					inArray(schema.sale.status, ['complete', 'complete_no_sync']),
					sql`${schema.sale.createdAt} >= ${thirtyDaysAgo}`
				))
				.groupBy(sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`)
				.orderBy(sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`),
		]),

		getIntegrationStatus(userId),
	]);

	const [
		receiptStatusCounts,   // 0
		receiptStorage,        // 1
		receiptToday,          // 2
		receiptStaged,         // 3
		receiptEdited,         // 4
		spendingByReceiptDate, // 5
		spendingByUploadDate,  // 6
		salesStatusCounts,     // 7
		salesStorage,          // 8
		salesToday,            // 9
		salesStaged,           // 10
		salesEdited,           // 11
		revenueByDate,         // 12
		revenueByUploadDate,   // 13
	] = batchResults;

	// Tally receipt success / failed
	let successCount = 0;
	let failedCount  = 0;
	for (const row of receiptStatusCounts) {
		const n = Number(row.count);
		if (row.status === 'complete' || row.status === 'complete_no_sync') successCount += n;
		if (row.status === 'failed') failedCount += n;
	}

	// Tally sales success / failed
	let salesSuccessCount = 0;
	let salesFailedCount  = 0;
	for (const row of salesStatusCounts) {
		const n = Number(row.count);
		if (row.status === 'complete' || row.status === 'complete_no_sync') salesSuccessCount += n;
		if (row.status === 'failed') salesFailedCount += n;
	}

	return {
		successCount,
		failedCount,
		stagedCount:              Number(receiptStaged[0]?.count ?? 0),
		editedCount:              Number(receiptEdited[0]?.count ?? 0),
		committedCount:           successCount,
		totalStorageBytes:        Number(receiptStorage[0]?.total ?? 0) + Number(salesStorage[0]?.total ?? 0),
		todayCount:               Number(receiptToday[0]?.count ?? 0),
		dailyLimit:               DAILY_LIMIT,
		integrationStatus,
		spendingByReceiptDate:    /** @type {DaySpend[]} */ (spendingByReceiptDate.map(normalise)),
		spendingByProcessingDate: /** @type {DaySpend[]} */ (spendingByUploadDate.map(normalise)),
		salesSuccessCount,
		salesFailedCount,
		salesStagedCount:         Number(salesStaged[0]?.count ?? 0),
		salesEditedCount:         Number(salesEdited[0]?.count ?? 0),
		salesTodayCount:          Number(salesToday[0]?.count ?? 0),
		revenueByDate:            /** @type {DaySpend[]} */ (revenueByDate.map(normalise)),
		revenueByProcessingDate:  /** @type {DaySpend[]} */ (revenueByUploadDate.map(normalise)),
	};
}

/**
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
