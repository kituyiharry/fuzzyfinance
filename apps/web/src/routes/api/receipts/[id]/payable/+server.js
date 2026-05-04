// @ts-nocheck
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, asc } from 'drizzle-orm';

/** @param {string} receiptId @param {string} userId */
async function requireReceipt(receiptId, userId) {
    const [r] = await db.select({ id: schema.receipt.id }).from(schema.receipt)
        .where(and(eq(schema.receipt.id, receiptId), eq(schema.receipt.userId, userId)));
    if (!r) error(404, 'Receipt not found');
}

/** GET — fetch payable + updates for this receipt (null if none) */
export async function GET({ params, locals }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireReceipt(params.id, locals.user.id);
    const [payable] = await db.select().from(schema.payable).where(eq(schema.payable.receiptId, params.id));
    if (!payable) return json(null);
    const updates = await db.select().from(schema.payableUpdate)
        .where(eq(schema.payableUpdate.payableId, payable.id))
        .orderBy(asc(schema.payableUpdate.createdAt));
    return json({ ...payable, updates });
}

/** POST — open a new payable */
export async function POST({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireReceipt(params.id, locals.user.id);
    const [existing] = await db.select({ id: schema.payable.id }).from(schema.payable)
        .where(eq(schema.payable.receiptId, params.id));
    if (existing) error(409, 'A payable already exists for this receipt');
    const body = await request.json().catch(() => ({}));
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.payable).values({ id, userId: locals.user.id, receiptId: params.id, status: 'open', openedAt: now });
    if (body.note?.trim()) {
        await db.insert(schema.payableUpdate).values({ id: crypto.randomUUID(), payableId: id, note: body.note.trim() });
    }
    const [created] = await db.select().from(schema.payable).where(eq(schema.payable.id, id));
    const updates = await db.select().from(schema.payableUpdate).where(eq(schema.payableUpdate.payableId, id)).orderBy(asc(schema.payableUpdate.createdAt));
    return json({ ...created, updates }, { status: 201 });
}

/** PATCH — close the payable */
export async function PATCH({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireReceipt(params.id, locals.user.id);
    const [payable] = await db.select().from(schema.payable)
        .where(and(eq(schema.payable.receiptId, params.id), eq(schema.payable.userId, locals.user.id)));
    if (!payable) error(404, 'Payable not found');
    if (payable.status === 'closed') error(400, 'Payable is already closed');
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    await db.update(schema.payable).set({ status: 'closed', closedAt: now }).where(eq(schema.payable.id, payable.id));
    if (body.note?.trim()) {
        await db.insert(schema.payableUpdate).values({ id: crypto.randomUUID(), payableId: payable.id, note: body.note.trim() });
    }
    return json({ ok: true });
}

/** DELETE — remove the payable entirely */
export async function DELETE({ params, locals }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireReceipt(params.id, locals.user.id);
    await db.delete(schema.payable)
        .where(and(eq(schema.payable.receiptId, params.id), eq(schema.payable.userId, locals.user.id)));
    return json({ ok: true });
}
