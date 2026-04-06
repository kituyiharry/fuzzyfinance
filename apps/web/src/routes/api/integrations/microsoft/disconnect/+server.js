import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	await db
		.delete(schema.integration)
		.where(
			and(
				eq(schema.integration.userId, locals.user.id),
				eq(schema.integration.provider, 'microsoft')
			)
		);

	return json({ success: true });
}
