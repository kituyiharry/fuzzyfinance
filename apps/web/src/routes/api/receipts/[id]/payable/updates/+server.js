// @ts-nocheck
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/** POST — add an update note to the payable */
export async function POST({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    const [payable] = await db.select().from(schema.payable)
        .where(and(eq(schema.payable.receiptId, params.id), eq(schema.payable.userId, locals.user.id)));
    if (!payable) error(404, 'Payable not found');
    if (payable.status === 'closed') error(400, 'Cannot add updates to a closed payable');
    const body = await request.json();
    if (!body.note?.trim()) error(400, 'Note is required');
    await db.insert(schema.payableUpdate).values({ id: crypto.randomUUID(), payableId: payable.id, note: body.note.trim() });
    return json({ ok: true }, { status: 201 });
}
