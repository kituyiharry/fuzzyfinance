import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, or, isNull, gt, asc } from 'drizzle-orm';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/');

	const now = new Date();
	const [banners, workspaces] = await Promise.all([
		db.select()
			.from(schema.announcement)
			.where(
				and(
					eq(schema.announcement.active, true),
					eq(schema.announcement.showBanner, true),
					or(isNull(schema.announcement.expiresAt), gt(schema.announcement.expiresAt, now))
				)
			),
		db.select()
			.from(schema.workspace)
			.where(eq(schema.workspace.userId, locals.user.id))
			.orderBy(asc(schema.workspace.createdAt)),
	]);

	return {
		user:              locals.user,
		session:           locals.session,
		banners,
		workspaces,
		activeWorkspaceId: locals.workspaceId ?? null,
	};
};
