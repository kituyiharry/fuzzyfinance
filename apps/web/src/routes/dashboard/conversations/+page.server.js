import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, desc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const conversations = await db
		.select({
			id:        schema.conversation.id,
			title:     schema.conversation.title,
			messages:  schema.conversation.messages,
			createdAt: schema.conversation.createdAt,
			updatedAt: schema.conversation.updatedAt,
		})
		.from(schema.conversation)
		.where(eq(schema.conversation.userId, locals.user.id))
		.orderBy(desc(schema.conversation.createdAt));

	return {
		conversations: conversations.map((c) => ({
			...c,
			messages: JSON.parse(c.messages ?? '[]'),
		})),
	};
}
