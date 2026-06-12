import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { _parseCustom, _normaliseCustom } from '$lib/server/categories';

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	/** @type {{ primary?: string, parent?: string, secondary?: string }} */
	const body = await request.json();
	const primary   = typeof body.primary   === 'string' ? body.primary.trim()   : '';
	const parent    = typeof body.parent    === 'string' ? body.parent.trim()    : '';
	const secondary = typeof body.secondary === 'string' ? body.secondary.trim() : '';

	if (!primary && !(parent && secondary)) {
		error(400, 'Provide either `primary` (to add a primary) or `parent` + `secondary` (to add a sub-category).');
	}

	const ws = await _loadOwnedWorkspace(params.id, locals.user.id);
	const custom = _parseCustom(ws.customCategoriesJson);

	if (primary) {
		if (!custom.primary.includes(primary)) custom.primary.push(primary);
	}
	if (parent && secondary) {
		const bucket = custom.secondary[parent] ?? [];
		if (!bucket.includes(secondary)) bucket.push(secondary);
		custom.secondary[parent] = bucket;
	}

	const next = _normaliseCustom(custom);
	await db.update(schema.workspace)
		.set({ customCategoriesJson: JSON.stringify(next) })
		.where(eq(schema.workspace.id, params.id));

	return json({ ok: true, custom: next });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	/** @type {{ primary?: string, parent?: string, secondary?: string }} */
	const body = await request.json();
	const primary   = typeof body.primary   === 'string' ? body.primary.trim()   : '';
	const parent    = typeof body.parent    === 'string' ? body.parent.trim()    : '';
	const secondary = typeof body.secondary === 'string' ? body.secondary.trim() : '';

	const ws = await _loadOwnedWorkspace(params.id, locals.user.id);
	const custom = _parseCustom(ws.customCategoriesJson);

	if (primary) {
		custom.primary = custom.primary.filter((p) => p !== primary);
		delete custom.secondary[primary];
	}
	if (parent && secondary) {
		const bucket = custom.secondary[parent] ?? [];
		custom.secondary[parent] = bucket.filter((s) => s !== secondary);
	}

	const next = _normaliseCustom(custom);
	await db.update(schema.workspace)
		.set({ customCategoriesJson: JSON.stringify(next) })
		.where(eq(schema.workspace.id, params.id));

	return json({ ok: true, custom: next });
}

/** @param {string} workspaceId @param {string} userId */
async function _loadOwnedWorkspace(workspaceId, userId) {
	const [ws] = await db.select()
		.from(schema.workspace)
		.where(and(eq(schema.workspace.id, workspaceId), eq(schema.workspace.userId, userId)));
	if (!ws) error(404, 'Workspace not found');
	return ws;
}
