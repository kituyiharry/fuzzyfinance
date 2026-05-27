import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, cookies }) {
    if (!locals.user) error(401, 'Unauthorized');

    const [ws] = await db.select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(and(eq(schema.workspace.id, params.id), eq(schema.workspace.userId, locals.user.id)));
    if (!ws) error(404, 'Workspace not found');

    cookies.set('wid', params.id, {
        path:     '/',
        httpOnly: false,
        sameSite: 'strict',
        secure:   true,
        maxAge:   60 * 60 * 24 * 365,
    });

    return json({ ok: true });
}
