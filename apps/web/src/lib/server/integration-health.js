import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';

/**
 * @typedef {'none' | 'all_expired' | 'ok'} IntegrationStatus
 */

/**
 * Returns the integration health for a user.
 *
 * - `'none'`        — no integrations connected at all
 * - `'all_expired'` — integrations exist but every token has expired
 * - `'ok'`          — at least one integration has a valid (non-expired) token
 *
 * Token validity is determined by `tokenExpiresAt` without making any network
 * requests. A 5-minute buffer is applied so tokens that expire very soon are
 * treated as expired.
 *
 * @param {string} userId
 * @returns {Promise<IntegrationStatus>}
 */
export async function getIntegrationStatus(userId) {
	const integrations = await db
		.select({
			tokenExpiresAt: schema.integration.tokenExpiresAt
		})
		.from(schema.integration)
		.where(eq(schema.integration.userId, userId));

	if (integrations.length === 0) return 'none';

	const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

	const anyValid = integrations.some(
		(i) => i.tokenExpiresAt && i.tokenExpiresAt > fiveMinutesFromNow
	);

	return anyValid ? 'ok' : 'all_expired';
}
