import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq } from 'drizzle-orm';

const GEMINI_SCOPE = 'https://www.googleapis.com/auth/generative-language.retriever';

/**
 * Returns a valid Google OAuth access token scoped for the Generative Language
 * API, or null if the user has no Google integration or has not granted the
 * required scope. Errors (including expired refresh tokens) are swallowed so
 * callers can silently fall back to the GEMINI_API_KEY.
 *
 * @param {string} userId
 * @returns {Promise<string | null>}
 */
export async function getGeminiAccessToken(userId) {
	try {
		const rows = await db
			.select()
			.from(schema.integration)
			.where(eq(schema.integration.userId, userId));

		const integration = rows.find((r) => r.provider === 'google');
		if (!integration) return null;

		const grantedScopes = integration.scopes ? JSON.parse(integration.scopes) : [];
		if (!grantedScopes.includes(GEMINI_SCOPE)) return null;

		return await _ensureFresh(integration, 'google', false);
	} catch {
		return null;
	}
}

/**
 * Returns a valid access token for the given integration, refreshing it first
 * if it has expired or is within 30 minutes of expiry.
 *
 * Pass `forceRefresh: true` to bypass the TTL check and always fetch a new
 * token — use this after a 401 response from a cloud API indicates the stored
 * token is stale even though tokenExpiresAt says otherwise.
 *
 * Throws with message prefix `AUTH_REQUIRED: ` when the refresh token itself
 * is invalid (revoked, consent withdrawn). Callers must surface this to the
 * user as a re-authorisation prompt.
 *
 * @param {string} userId
 * @param {'google' | 'microsoft' | 'xero'} provider
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string | null>} A valid access token, or null if no integration exists
 */
export async function getValidAccessToken(userId, provider, opts = {}) {
	const rows = await db
		.select()
		.from(schema.integration)
		.where(eq(schema.integration.userId, userId));

	const integration = rows.find((r) => r.provider === provider);
	if (!integration) return null;

	return _ensureFresh(integration, provider, opts.forceRefresh ?? false);
}

/**
 * @param {typeof schema.integration.$inferSelect} integration
 * @param {'google' | 'microsoft' | 'xero'} provider
 * @param {boolean} forceRefresh
 * @returns {Promise<string>}
 */
async function _ensureFresh(integration, provider, forceRefresh) {
	const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
	const isExpired =
		forceRefresh ||
		!integration.tokenExpiresAt ||
		integration.tokenExpiresAt <= thirtyMinutesFromNow;

	if (!isExpired) return integration.accessToken ?? '';

	if (!integration.refreshToken) {
		throw new Error(`AUTH_REQUIRED: No refresh token stored for ${provider} integration — please reconnect.`);
	}

	let tokens;
	if (provider === 'google')         tokens = await _refreshGoogle(integration.refreshToken);
	else if (provider === 'microsoft') tokens = await _refreshMicrosoft(integration.refreshToken);
	else                               tokens = await _refreshXero(integration.refreshToken);

	const tokenExpiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000)
		: null;

	await db
		.update(schema.integration)
		.set({
			accessToken: tokens.access_token,
			// Xero rotates the refresh token on every refresh — the old one is
			// immediately invalidated, so we MUST persist the new one. Google and
			// Microsoft re-issue lazily; keep the existing one when absent.
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
	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: env.GOOGLE_CLIENT_ID,
		client_secret: env.GOOGLE_CLIENT_SECRET,
		refresh_token: refreshToken
	});

	// One retry for transient network failures — auth failures are not retried
	for (let attempt = 0; attempt < 2; attempt++) {
		let res;
		try {
			res = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body
			});
		} catch (networkErr) {
			if (attempt === 0) continue; // retry once on network error
			throw new Error(`Google token refresh failed (network): ${networkErr}`);
		}

		if (res.ok) return res.json();

		const responseBody = await res.text();
		const isAuthError =
			responseBody.includes('"invalid_grant"') ||
			responseBody.includes('"invalid_client"');

		if (isAuthError) {
			throw new Error(`AUTH_REQUIRED: Google token refresh failed — access was revoked or expired. Please reconnect your Google account.`);
		}

		// Non-auth server error: retry once
		if (attempt === 0) continue;
		throw new Error(`Google token refresh failed (${res.status}): ${responseBody}`);
	}

	// Unreachable but satisfies type-checker
	throw new Error('Google token refresh failed');
}

/**
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
async function _refreshMicrosoft(refreshToken) {
	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: env.MICROSOFT_CLIENT_ID,
		client_secret: env.MICROSOFT_CLIENT_SECRET,
		refresh_token: refreshToken,
		scope: 'Files.ReadWrite offline_access'
	});

	for (let attempt = 0; attempt < 2; attempt++) {
		let res;
		try {
			res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body
			});
		} catch (networkErr) {
			if (attempt === 0) continue;
			throw new Error(`Microsoft token refresh failed (network): ${networkErr}`);
		}

		if (res.ok) return res.json();

		const responseBody = await res.text();
		const isAuthError =
			responseBody.includes('"invalid_grant"') ||
			responseBody.includes('"interaction_required"') ||
			responseBody.includes('"consent_required"');

		if (isAuthError) {
			throw new Error(`AUTH_REQUIRED: Microsoft token refresh failed — access was revoked or consent withdrawn. Please reconnect your Microsoft account.`);
		}

		if (attempt === 0) continue;
		throw new Error(`Microsoft token refresh failed (${res.status}): ${responseBody}`);
	}

	throw new Error('Microsoft token refresh failed');
}

/**
 * Refresh a Xero access token.
 *
 * Xero is a *public* OAuth 2.0 + PKCE app — no client_secret. The token
 * endpoint accepts the client_id alone and rotates the refresh token on
 * every call: the response includes a new `refresh_token` and the one we
 * just sent is **immediately invalidated**. `_ensureFresh` persists the
 * rotation; this function must never be called outside that wrapper or the
 * integration will be silently broken on the next refresh attempt.
 *
 * Reference: https://developer.xero.com/documentation/guides/oauth2/auth-flow#refreshing-access-and-refresh-tokens
 *
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
async function _refreshXero(refreshToken) {
	const body = new URLSearchParams({
		grant_type:    'refresh_token',
		client_id:     env.XERO_CLIENT_ID ?? '',
		refresh_token: refreshToken
	});

	for (let attempt = 0; attempt < 2; attempt++) {
		let res;
		try {
			res = await fetch('https://identity.xero.com/connect/token', {
				method:  'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body
			});
		} catch (networkErr) {
			if (attempt === 0) continue;
			throw new Error(`Xero token refresh failed (network): ${networkErr}`);
		}

		if (res.ok) return res.json();

		const responseBody = await res.text();
		const isAuthError =
			responseBody.includes('"invalid_grant"') ||
			responseBody.includes('"invalid_client"');

		if (isAuthError) {
			throw new Error(`AUTH_REQUIRED: Xero token refresh failed — refresh token expired (60-day limit) or access was revoked. Please reconnect your Xero account.`);
		}

		if (attempt === 0) continue;
		throw new Error(`Xero token refresh failed (${res.status}): ${responseBody}`);
	}

	throw new Error('Xero token refresh failed');
}
