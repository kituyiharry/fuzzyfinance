import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { asc, eq } from 'drizzle-orm';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/');

	const workspaces = await db.select()
		.from(schema.workspace)
		.where(eq(schema.workspace.userId, locals.user.id))
		.orderBy(asc(schema.workspace.createdAt));

	return {
		user:              locals.user,
		session:           locals.session,
		workspaces,
		activeWorkspaceId: locals.workspaceId ?? null,
	};
};
