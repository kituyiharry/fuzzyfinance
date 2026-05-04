// @ts-nocheck
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

export async function POST({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    const [receivable] = await db.select().from(schema.receivable)
        .where(and(eq(schema.receivable.saleId, params.id), eq(schema.receivable.userId, locals.user.id)));
    if (!receivable) error(404, 'Receivable not found');
    if (receivable.status === 'closed') error(400, 'Cannot add updates to a closed receivable');
    const body = await request.json();
    if (!body.note?.trim()) error(400, 'Note is required');
    await db.insert(schema.receivableUpdate).values({ id: crypto.randomUUID(), receivableId: receivable.id, note: body.note.trim() });
    return json({ ok: true }, { status: 201 });
}
