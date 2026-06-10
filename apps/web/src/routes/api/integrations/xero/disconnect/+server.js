import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/**
 * Disconnect the user's Xero integration.
 *
 * We hard-delete the integration row — no token-introspection / revoke call
 * to Xero is attempted, mirroring the existing Google/Microsoft pattern.
 * Already-synced receipt + sale rows are intentionally **kept**: dropping
 * them would lose user-edited classifications. They keep their
 * `externalSource = 'xero-...'` provenance for transparency.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	await db
		.delete(schema.integration)
		.where(
			and(
				eq(schema.integration.userId,   locals.user.id),
				eq(schema.integration.provider, 'xero')
			)
		);

	return json({ success: true });
}
