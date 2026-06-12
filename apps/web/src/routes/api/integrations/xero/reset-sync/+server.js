import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/**
 * Clear the user's Xero integration `lastSyncedAt` watermark so the next
 * `POST /api/integrations/xero/sync` re-runs as a first-sync (back-fills
 * from the active financial-year start instead of polling deltas since
 * the previous run).
 *
 * Does NOT mutate any receipt / sale data — only the integration row's
 * metadata. Re-running the sync after a reset upserts existing rows in
 * place (matched on `userId + externalSource + externalAccountId`).
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [integration] = await db.select()
		.from(schema.integration)
		.where(and(
			eq(schema.integration.userId,   locals.user.id),
			eq(schema.integration.provider, 'xero')
		));
	if (!integration) error(404, 'No Xero integration for this user');

	const metadata = integration.metadataJson ? JSON.parse(integration.metadataJson) : {};
	const { lastSyncedAt: _dropped, lastSummary: _dropped2, ...rest } = metadata;

	await db.update(schema.integration)
		.set({ metadataJson: JSON.stringify(rest) })
		.where(eq(schema.integration.id, integration.id));

	return json({ ok: true, previousLastSyncedAt: _dropped ?? null });
}
