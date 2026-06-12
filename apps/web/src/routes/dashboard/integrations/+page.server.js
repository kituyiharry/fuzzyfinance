import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { asc, eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	if (!locals.user) redirect(302, '/');

	const rows = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, locals.user.id));

	// Load the user's workspaces — needed to populate the tenant→workspace
	// mapping selector on the Xero card.
	const workspaces = await db
		.select({ id: schema.workspace.id, name: schema.workspace.name, isDefault: schema.workspace.isDefault })
		.from(schema.workspace)
		.where(eq(schema.workspace.userId, locals.user.id))
		.orderBy(asc(schema.workspace.name));

	/**
	 * @type {Record<string, {
	 *   accountEmail: string | null,
	 *   scopes: string[],
	 *   tokenExpiresAt: Date | null,
	 *   createdAt: Date,
	 *   tenants?: Array<{ tenantId: string, tenantName: string, tenantType?: string, workspaceId?: string | null }>,
	 *   lastSyncedAt?: string | null,
	 *   lastSummary?: { tenants?: number, invoicesCreated?: number, invoicesUpdated?: number, skipped?: number }
	 * }>}
	 */
	const integrations = {};

	for (const row of rows) {
		const meta = row.metadataJson ? JSON.parse(row.metadataJson) : {};
		integrations[row.provider] = {
			accountEmail:   row.accountEmail,
			scopes:         row.scopes ? JSON.parse(row.scopes) : [],
			tokenExpiresAt: row.tokenExpiresAt,
			createdAt:      row.createdAt,
			tenants:        meta.xeroTenants ?? undefined,
			lastSyncedAt:   meta.lastSyncedAt ?? null,
			lastSummary:    meta.lastSummary ?? undefined
		};
	}

	return {
		integrations,
		workspaces,
		flash: url.searchParams.get('connected')
	};
}
