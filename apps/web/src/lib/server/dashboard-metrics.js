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
 * Runs all dashboard metric queries in parallel for a given user.
 *
 * @param {string} userId
 * @returns {Promise<DashboardMetrics>}
 */
export async function getDashboardMetrics(userId) {
	const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

	const [
		statusCounts,
		storageResult,
		todayResult,
		spendingByReceiptDate,
		spendingByProcessingDate,
		salesStatusCounts,
		salesStorageResult,
		salesTodayResult,
		revenueByDate,
		revenueByProcessingDate,
		integrationStatus
	] = await Promise.all([
		// Receipt success + failed counts
		db
			.select({
				status: schema.receipt.status,
				count: sql`COUNT(*)`.as('count')
			})
			.from(schema.receipt)
			.where(eq(schema.receipt.userId, userId))
			.groupBy(schema.receipt.status),

		// Receipt total storage
		db
			.select({
				total: sql`COALESCE(SUM(${schema.receipt.rawSizeBytes}), 0)`.as('total')
			})
			.from(schema.receipt)
			.where(eq(schema.receipt.userId, userId)),

		// Receipt today's upload count
		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.receipt)
			.where(
				and(
					eq(schema.receipt.userId, userId),
					sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)
			),

		// Spending grouped by receipt date (last 30 days)
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
					sql`${schema.receipt.receiptDate} >= ${thirtyDaysAgo}`
				)
			)
			.groupBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.receipt.receiptDate} / 1000, 'unixepoch')`),

		// Spending grouped by processing date (last 30 days)
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
					sql`${schema.receipt.createdAt} >= ${thirtyDaysAgo}`
				)
			)
			.groupBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch')`),

		// Sales status counts
		db
			.select({
				status: schema.sale.status,
				count: sql`COUNT(*)`.as('count')
			})
			.from(schema.sale)
			.where(eq(schema.sale.userId, userId))
			.groupBy(schema.sale.status),

		// Sales total storage
		db
			.select({
				total: sql`COALESCE(SUM(${schema.sale.rawSizeBytes}), 0)`.as('total')
			})
			.from(schema.sale)
			.where(eq(schema.sale.userId, userId)),

		// Sales today's upload count
		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.sale)
			.where(
				and(
					eq(schema.sale.userId, userId),
					sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)
			),

		// Revenue grouped by sale date (last 30 days)
		db
			.select({
				day:          sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.sale.totalRevenue} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
			.from(schema.sale)
			.where(
				and(
					eq(schema.sale.userId, userId),
					inArray(schema.sale.status, ['complete', 'complete_no_sync']),
					isNotNull(schema.sale.saleDate),
					sql`${schema.sale.saleDate} >= ${thirtyDaysAgo}`
				)
			)
			.groupBy(sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.sale.saleDate} / 1000, 'unixepoch')`),

		// Revenue grouped by processing date (last 30 days)
		db
			.select({
				day:          sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`.as('day'),
				totalAmount:  sql`COALESCE(SUM(CAST(${schema.sale.totalRevenue} AS REAL)), 0)`.as('totalAmount'),
				receiptCount: sql`COUNT(*)`.as('receiptCount')
			})
			.from(schema.sale)
			.where(
				and(
					eq(schema.sale.userId, userId),
					inArray(schema.sale.status, ['complete', 'complete_no_sync']),
					sql`${schema.sale.createdAt} >= ${thirtyDaysAgo}`
				)
			)
			.groupBy(sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`)
			.orderBy(sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch')`),

		getIntegrationStatus(userId)
	]);

	const [stagedResult, editedResult, salesStagedResult, salesEditedResult] = await Promise.all([
		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.receipt)
			.where(and(eq(schema.receipt.userId, userId), eq(schema.receipt.status, 'staged'))),

		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.receipt)
			.where(
				and(
					eq(schema.receipt.userId, userId),
					sql`${schema.receipt.correctedFields} IS NOT NULL`,
					sql`${schema.receipt.correctedFields} != '[]'`
				)
			),

		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.sale)
			.where(and(eq(schema.sale.userId, userId), eq(schema.sale.status, 'staged'))),

		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.sale)
			.where(
				and(
					eq(schema.sale.userId, userId),
					sql`${schema.sale.correctedFields} IS NOT NULL`,
					sql`${schema.sale.correctedFields} != '[]'`
				)
			)
	]);

	// Tally receipt success / failed
	let successCount = 0;
	let failedCount  = 0;
	for (const row of statusCounts) {
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

	const stagedCount      = Number(stagedResult[0]?.count      ?? 0);
	const editedCount      = Number(editedResult[0]?.count      ?? 0);
	const salesStagedCount = Number(salesStagedResult[0]?.count ?? 0);
	const salesEditedCount = Number(salesEditedResult[0]?.count ?? 0);

	const receiptStorageBytes = Number(storageResult[0]?.total      ?? 0);
	const salesStorageBytes   = Number(salesStorageResult[0]?.total ?? 0);

	return {
		successCount,
		failedCount,
		stagedCount,
		editedCount,
		committedCount:           successCount,
		totalStorageBytes:        receiptStorageBytes + salesStorageBytes,
		todayCount:               Number(todayResult[0]?.count ?? 0),
		dailyLimit:               DAILY_LIMIT,
		integrationStatus,
		spendingByReceiptDate:    /** @type {DaySpend[]} */ (spendingByReceiptDate.map(normalise)),
		spendingByProcessingDate: /** @type {DaySpend[]} */ (spendingByProcessingDate.map(normalise)),
		salesSuccessCount,
		salesFailedCount,
		salesStagedCount,
		salesEditedCount,
		salesTodayCount:          Number(salesTodayResult[0]?.count ?? 0),
		revenueByDate:            /** @type {DaySpend[]} */ (revenueByDate.map(normalise)),
		revenueByProcessingDate:  /** @type {DaySpend[]} */ (revenueByProcessingDate.map(normalise))
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
