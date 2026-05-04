// @ts-nocheck
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, asc } from 'drizzle-orm';

/** @param {string} saleId @param {string} userId */
async function requireSale(saleId, userId) {
    const [s] = await db.select({ id: schema.sale.id }).from(schema.sale)
        .where(and(eq(schema.sale.id, saleId), eq(schema.sale.userId, userId)));
    if (!s) error(404, 'Sale not found');
}

export async function GET({ params, locals }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireSale(params.id, locals.user.id);
    const [receivable] = await db.select().from(schema.receivable).where(eq(schema.receivable.saleId, params.id));
    if (!receivable) return json(null);
    const updates = await db.select().from(schema.receivableUpdate)
        .where(eq(schema.receivableUpdate.receivableId, receivable.id))
        .orderBy(asc(schema.receivableUpdate.createdAt));
    return json({ ...receivable, updates });
}

export async function POST({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireSale(params.id, locals.user.id);
    const [existing] = await db.select({ id: schema.receivable.id }).from(schema.receivable)
        .where(eq(schema.receivable.saleId, params.id));
    if (existing) error(409, 'A receivable already exists for this sale');
    const body = await request.json().catch(() => ({}));
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.receivable).values({ id, userId: locals.user.id, saleId: params.id, status: 'open', openedAt: now });
    if (body.note?.trim()) {
        await db.insert(schema.receivableUpdate).values({ id: crypto.randomUUID(), receivableId: id, note: body.note.trim() });
    }
    const [created] = await db.select().from(schema.receivable).where(eq(schema.receivable.id, id));
    const updates = await db.select().from(schema.receivableUpdate).where(eq(schema.receivableUpdate.receivableId, id)).orderBy(asc(schema.receivableUpdate.createdAt));
    return json({ ...created, updates }, { status: 201 });
}

export async function PATCH({ params, locals, request }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireSale(params.id, locals.user.id);
    const [receivable] = await db.select().from(schema.receivable)
        .where(and(eq(schema.receivable.saleId, params.id), eq(schema.receivable.userId, locals.user.id)));
    if (!receivable) error(404, 'Receivable not found');
    if (receivable.status === 'closed') error(400, 'Receivable is already closed');
    const body = await request.json().catch(() => ({}));
    await db.update(schema.receivable).set({ status: 'closed', closedAt: new Date() }).where(eq(schema.receivable.id, receivable.id));
    if (body.note?.trim()) {
        await db.insert(schema.receivableUpdate).values({ id: crypto.randomUUID(), receivableId: receivable.id, note: body.note.trim() });
    }
    return json({ ok: true });
}

export async function DELETE({ params, locals }) {
    if (!locals.user) error(401, 'Unauthorized');
    await requireSale(params.id, locals.user.id);
    await db.delete(schema.receivable)
        .where(and(eq(schema.receivable.saleId, params.id), eq(schema.receivable.userId, locals.user.id)));
    return json({ ok: true });
}
