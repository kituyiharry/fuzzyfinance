import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';

/**
 * Returns a valid access token for the given integration, refreshing it first
 * if it has expired or is within 5 minutes of expiry.
 *
 * @param {string} userId
 * @param {'google' | 'microsoft'} provider
 * @returns {Promise<string | null>} A valid access token, or null if no integration exists
 */
export async function getValidAccessToken(userId, provider) {
	const [integration] = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, userId));

	if (!integration || integration.provider !== provider) {
		// Try a more targeted query
		const rows = await db
			.select()
			.from(schema.integration)
			.where(eq(schema.integration.userId, userId));
		const match = rows.find((r) => r.provider === provider);
		if (!match) return null;
		return _ensureFresh(match, provider);
	}

	return _ensureFresh(integration, provider);
}

/**
 * @param {typeof schema.integration.$inferSelect} integration
 * @param {'google' | 'microsoft'} provider
 * @returns {Promise<string>}
 */
async function _ensureFresh(integration, provider) {
	const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
	const isExpired =
		!integration.tokenExpiresAt || integration.tokenExpiresAt <= thirtyMinutesFromNow;

	if (!isExpired) return integration.accessToken ?? '';

	if (!integration.refreshToken) {
		throw new Error(`No refresh token stored for ${provider} integration`);
	}

	const tokens = await (provider === 'google'
		? _refreshGoogle(integration.refreshToken)
		: _refreshMicrosoft(integration.refreshToken));

	const tokenExpiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000)
		: null;

	await db
		.update(schema.integration)
		.set({
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? integration.refreshToken,
			tokenExpiresAt
		})
		.where(eq(schema.integration.id, integration.id));

	return tokens.access_token;
}

/**
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
async function _refreshGoogle(refreshToken) {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			refresh_token: refreshToken
		})
	});
	if (!res.ok) {
		const body = await res.text();
		const isAuthError = body.includes('"invalid_grant"') || body.includes('"invalid_client"');
		const prefix = isAuthError ? 'AUTH_REQUIRED: ' : '';
		throw new Error(`${prefix}Google token refresh failed: ${body}`);
	}
	return res.json();
}

/**
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
async function _refreshMicrosoft(refreshToken) {
	const res = await fetch(
		'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: env.MICROSOFT_CLIENT_ID,
				client_secret: env.MICROSOFT_CLIENT_SECRET,
				refresh_token: refreshToken,
				scope: 'Files.ReadWrite offline_access'
			})
		}
	);
	if (!res.ok) {
		const body = await res.text();
		const isAuthError = body.includes('"invalid_grant"') || body.includes('"interaction_required"') || body.includes('"consent_required"');
		const prefix = isAuthError ? 'AUTH_REQUIRED: ' : '';
		throw new Error(`${prefix}Microsoft token refresh failed: ${body}`);
	}
	return res.json();
}
