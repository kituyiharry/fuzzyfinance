import { redirect } from '@sveltejs/kit';
import { getIntegrationStatus } from '$lib/server/integration-health';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, sql } from 'drizzle-orm';

const DAILY_LIMIT = 30;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const [integrationStatus, countRow] = await Promise.all([
		getIntegrationStatus(locals.user.id),
		db
			.select({ count: sql`COUNT(*)`.as('count') })
			.from(schema.sale)
			.where(
				and(
					eq(schema.sale.userId, locals.user.id),
					sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch') = DATE('now')`
				)
			)
			.then((rows) => rows[0])
	]);

	return {
		integrationStatus,
		todayCount: Number(countRow?.count ?? 0),
		dailyLimit: DAILY_LIMIT
	};
}
