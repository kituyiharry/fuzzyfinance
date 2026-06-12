import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, cookies, url }) {
	if (!locals.user) redirect(302, '/');

	const code           = url.searchParams.get('code');
	const returnedState  = url.searchParams.get('state');
	const storedState    = cookies.get('xero_oauth_state');
	const codeVerifier   = cookies.get('xero_pkce_verifier');

	cookies.delete('xero_oauth_state',   { path: '/' });
	cookies.delete('xero_pkce_verifier', { path: '/' });

	if (!code || !returnedState || returnedState !== storedState) {
		error(400, 'Invalid or missing OAuth state — possible CSRF attempt');
	}
	if (!codeVerifier) {
		error(400, 'Missing PKCE verifier — restart the Xero authorization flow');
	}

	// ── 1. Exchange code for tokens ───────────────────────────────────────
	// Xero supports two app types:
	//   • Web App (confidential) — needs client_secret, PKCE optional
	//   • Mobile/desktop app (public) — needs PKCE, no client_secret
	// We send both when available: PKCE always (cookie was set by authorize),
	// client_secret when XERO_CLIENT_SECRET is configured. Xero accepts that
	// combination cleanly and it covers either registration type.
	const tokenParams = new URLSearchParams({
		grant_type:    'authorization_code',
		client_id:     env.XERO_CLIENT_ID ?? '',
		code,
		redirect_uri:  `${env.ORIGIN}/api/integrations/xero/callback`,
		code_verifier: codeVerifier
	});
	if (env.XERO_CLIENT_SECRET) {
		tokenParams.set('client_secret', env.XERO_CLIENT_SECRET);
	}

	const tokenRes = await fetch('https://identity.xero.com/connect/token', {
		method:  'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body:    tokenParams
	});

	if (!tokenRes.ok) {
		const body = await tokenRes.text();
		console.error('[xero/callback] token exchange failed:', tokenRes.status, body);
		error(502, `Failed to exchange Xero authorization code for tokens (${tokenRes.status}). Check worker logs for the Xero error body.`);
	}

	/** @type {{ access_token: string, refresh_token?: string, expires_in?: number, scope?: string, id_token?: string, token_type?: string }} */
	const tokens = await tokenRes.json();

	// id_token email (no signature check — token was just issued in response
	// to our own server-side request).
	let accountEmail = null;
	if (tokens.id_token) {
		try {
			const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
			accountEmail = payload.email ?? null;
		} catch { /* informational — non-fatal */ }
	}

	// ── 2. Discover which Xero tenants the user authorised ────────────────
	// One OAuth grant can attach many Xero orgs. Every subsequent API call
	// must carry an `xero-tenant-id` header — list them here so the sync
	// worker knows what to iterate.
	/** @type {Array<{ connectionId: string, tenantId: string, tenantName: string, tenantType: string, connectedAt: string }>} */
	let xeroTenants = [];
	try {
		const connRes = await fetch('https://api.xero.com/connections', {
			headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' }
		});
		if (connRes.ok) {
			/** @type {Array<{ id: string, tenantId: string, tenantType: string, tenantName: string, createdDateUtc?: string, updatedDateUtc?: string }>} */
			const conns = await connRes.json();
			xeroTenants = conns.map((c) => ({
				connectionId: c.id,
				tenantId:     c.tenantId,
				tenantName:   c.tenantName,
				tenantType:   c.tenantType,
				connectedAt:  c.createdDateUtc ?? new Date().toISOString()
			}));
		} else {
			const detail = await connRes.text();
			console.error('[xero/callback] /connections failed:', detail);
		}
	} catch (e) {
		console.error('[xero/callback] /connections error:', e);
	}

	const tokenExpiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000)
		: null;
	const grantedScopes = tokens.scope ? tokens.scope.split(' ') : [];

	const metadata = { xeroTenants, lastSyncedAt: null };

	// ── 3. Upsert the integration row ─────────────────────────────────────
	const [existing] = await db
		.select()
		.from(schema.integration)
		.where(
			and(
				eq(schema.integration.userId,   locals.user.id),
				eq(schema.integration.provider, 'xero')
			)
		);

	if (existing) {
		// Preserve any existing metadata keys (e.g. account-code maps populated
		// on a later sync) and merge in the freshly-fetched tenant list.
		const prev = existing.metadataJson ? JSON.parse(existing.metadataJson) : {};
		await db.update(schema.integration)
			.set({
				accountEmail,
				accessToken:    tokens.access_token,
				refreshToken:   tokens.refresh_token ?? existing.refreshToken,
				tokenExpiresAt,
				scopes:         JSON.stringify(grantedScopes),
				metadataJson:   JSON.stringify({ ...prev, ...metadata })
			})
			.where(eq(schema.integration.id, existing.id));
	} else {
		await db.insert(schema.integration).values({
			id:             crypto.randomUUID(),
			userId:         locals.user.id,
			provider:       'xero',
			accountEmail,
			accessToken:    tokens.access_token,
			refreshToken:   tokens.refresh_token ?? null,
			tokenExpiresAt,
			scopes:         JSON.stringify(grantedScopes),
			metadataJson:   JSON.stringify(metadata)
		});
	}

	redirect(302, '/dashboard/integrations?connected=xero');
}
