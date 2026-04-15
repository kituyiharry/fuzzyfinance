import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, or, isNull, gt, desc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const now = new Date();
	const announcements = await db
		.select()
		.from(schema.announcement)
		.where(
			and(
				eq(schema.announcement.active, true),
				or(
					isNull(schema.announcement.expiresAt),
					gt(schema.announcement.expiresAt, now)
				)
			)
		)
		.orderBy(desc(schema.announcement.publishedAt));

	return { announcements };
}
