import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, asc } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
    if (!locals.user) error(401, 'Unauthorized');

    const workspaces = await db.select()
        .from(schema.workspace)
        .where(eq(schema.workspace.userId, locals.user.id))
        .orderBy(asc(schema.workspace.createdAt));

    return json(workspaces);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
    if (!locals.user) error(401, 'Unauthorized');

    const body = await request.json();
    const name = (body?.name ?? '').trim();
    if (!name) error(400, 'name is required');
    if (name.length > 50) error(400, 'name must be 50 characters or fewer');

    const id = crypto.randomUUID();
    await db.insert(schema.workspace).values({
        id,
        userId:    locals.user.id,
        name,
        isDefault: false,
        driveSlug: name,
    });

    return json({ id, name }, { status: 201 });
}
