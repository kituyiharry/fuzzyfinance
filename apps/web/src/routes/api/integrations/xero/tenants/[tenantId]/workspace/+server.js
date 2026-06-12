import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/**
 * Map one Xero tenant onto a FuzzyFinance workspace.
 *
 * A user can authorise multiple Xero organisations in a single OAuth
 * grant. Each tenant's invoices land in whichever workspace this
 * endpoint records; the sync waterfall reads
 * `metadata.xeroTenants[i].workspaceId` and falls back to the user's
 * default workspace when no explicit mapping is set.
 *
 * On re-sync, existing rows are moved to the newly-mapped workspace
 * — so toggling this is non-destructive and reversible.
 *
 * Body: `{ workspaceId: string | null }`
 *   - string → assign tenant to that workspace (ownership-checked).
 *   - null   → clear the assignment; sync falls back to default.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Body must be a JSON object');
	const workspaceId = body.workspaceId === null ? null : (typeof body.workspaceId === 'string' ? body.workspaceId : undefined);
	if (workspaceId === undefined) error(400, 'workspaceId must be a string or null');

	// Ownership check on the target workspace.
	if (workspaceId !== null) {
		const [ws] = await db.select()
			.from(schema.workspace)
			.where(and(
				eq(schema.workspace.id, workspaceId),
				eq(schema.workspace.userId, locals.user.id)
			));
		if (!ws) error(404, 'Workspace not found');
	}

	const [integration] = await db.select()
		.from(schema.integration)
		.where(and(
			eq(schema.integration.userId, locals.user.id),
			eq(schema.integration.provider, 'xero')
		));
	if (!integration) error(404, 'No Xero integration for this user');

	const metadata = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
	/** @type {Array<{ tenantId: string, tenantName?: string, workspaceId?: string | null }>} */
	const tenants = Array.isArray(metadata.xeroTenants) ? metadata.xeroTenants : [];

	const idx = tenants.findIndex((t) => t.tenantId === params.tenantId);
	if (idx === -1) error(404, 'Tenant not found in this integration');

	tenants[idx] = { ...tenants[idx], workspaceId };
	metadata.xeroTenants = tenants;

	await db.update(schema.integration)
		.set({ metadataJson: JSON.stringify(metadata) })
		.where(eq(schema.integration.id, integration.id));

	return json({ ok: true, tenantId: params.tenantId, workspaceId });
}
