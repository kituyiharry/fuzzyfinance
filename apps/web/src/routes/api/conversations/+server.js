import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, desc } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
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

	return json(conversations);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await request.json();

	/** @type {Array<{ role: string; content: string }>} */
	const messages = Array.isArray(body?.messages) ? body.messages : [];
	if (!messages.length) error(400, 'No messages to save');

	// Auto-generate title from first user message
	const firstUser = messages.find((m) => m.role === 'user');
	const raw = firstUser?.content ?? 'Conversation';
	const title = raw.length > 80 ? raw.slice(0, 77) + '...' : raw;

	const id = crypto.randomUUID();
	await db.insert(schema.conversation).values({
		id,
		userId:   locals.user.id,
		title,
		messages: JSON.stringify(messages),
	});

	return json({ id, title }, { status: 201 });
}
