import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	if (!locals.user) redirect(302, '/');

	const rows = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, locals.user.id));

	/**
	 * @type {Record<string, {
	 *   accountEmail: string | null,
	 *   scopes: string[],
	 *   tokenExpiresAt: Date | null,
	 *   createdAt: Date,
	 *   tenants?: Array<{ tenantId: string, tenantName: string, tenantType?: string }>,
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
		flash: url.searchParams.get('connected')
	};
}
