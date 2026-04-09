import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const { id } = params;

	const [deleted] = await db
		.delete(schema.conversation)
		.where(and(eq(schema.conversation.id, id), eq(schema.conversation.userId, locals.user.id)))
		.returning({ id: schema.conversation.id });

	if (!deleted) error(404, 'Conversation not found');

	return json({ success: true });
}
