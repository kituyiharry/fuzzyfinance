import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, count } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ params, request, locals }) {
    if (!locals.user) error(401, 'Unauthorized');

    const body = await request.json();
    const name      = body?.name      !== undefined ? String(body.name      ?? '').trim() : undefined;
    const driveSlug = body?.driveSlug !== undefined ? String(body.driveSlug ?? '').trim() : undefined;

    if (name !== undefined) {
        if (!name) error(400, 'name is required');
        if (name.length > 50) error(400, 'name must be 50 characters or fewer');
    }
    if (driveSlug !== undefined) {
        if (!driveSlug) error(400, 'Folder slug cannot be empty');
        if (driveSlug.length > 50) error(400, 'Folder slug must be 50 characters or fewer');
    }

    const [ws] = await db.select({ id: schema.workspace.id, isDefault: schema.workspace.isDefault, driveSlug: schema.workspace.driveSlug })
        .from(schema.workspace)
        .where(and(eq(schema.workspace.id, params.id), eq(schema.workspace.userId, locals.user.id)));
    if (!ws) error(404, 'Workspace not found');

    if (driveSlug !== undefined && ws.isDefault) error(400, 'Cannot change folder slug for the default workspace');

    /** @type {Partial<typeof schema.workspace.$inferInsert>} */
    const updateData = { updatedAt: new Date() };
    if (name !== undefined)      updateData.name      = name;
    if (driveSlug !== undefined) updateData.driveSlug = driveSlug;

    await db.update(schema.workspace)
        .set(updateData)
        .where(eq(schema.workspace.id, params.id));

    // If slug changed, clear cached workspace folder IDs from all user integrations
    if (driveSlug !== undefined && driveSlug !== ws.driveSlug) {
        const integrations = await db.select()
            .from(schema.integration)
            .where(eq(schema.integration.userId, locals.user.id));
        for (const integration of integrations) {
            /** @type {Record<string, unknown> & { workspaceFolders?: Record<string, unknown> }} */
            const meta = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
            if (meta.workspaceFolders?.[params.id]) {
                const { [params.id]: _cleared, ...remainingFolders } = meta.workspaceFolders;
                await db.update(schema.integration)
                    .set({ metadataJson: JSON.stringify({ ...meta, workspaceFolders: remainingFolders }) })
                    .where(eq(schema.integration.id, integration.id));
            }
        }
    }

    return json({ ok: true });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, cookies }) {
    if (!locals.user) error(401, 'Unauthorized');

    const [ws] = await db.select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(and(eq(schema.workspace.id, params.id), eq(schema.workspace.userId, locals.user.id)));
    if (!ws) error(404, 'Workspace not found');

    const [{ total }] = await db.select({ total: count() })
        .from(schema.workspace)
        .where(eq(schema.workspace.userId, locals.user.id));
    if (total <= 1) error(400, 'Cannot delete your only workspace');

    await db.delete(schema.workspace)
        .where(and(eq(schema.workspace.id, params.id), eq(schema.workspace.userId, locals.user.id)));

    if (cookies.get('wid') === params.id) {
        cookies.delete('wid', { path: '/' });
    }

    return json({ ok: true });
}
