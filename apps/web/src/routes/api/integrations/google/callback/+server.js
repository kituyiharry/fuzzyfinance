import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, cookies, url }) {
	if (!locals.user) redirect(302, '/');

	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state');

	cookies.delete('oauth_state', { path: '/' });

	if (!code || !returnedState || returnedState !== storedState) {
		error(400, 'Invalid or missing OAuth state — possible CSRF attempt');
	}

	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: `${env.ORIGIN}/api/integrations/google/callback`,
			grant_type: 'authorization_code'
		})
	});

	if (!tokenRes.ok) {
		const body = await tokenRes.text();
		console.error('[google/callback] token exchange failed:', body);
		error(502, 'Failed to exchange Google authorization code for tokens');
	}

	/** @type {{ access_token: string, refresh_token?: string, expires_in?: number, scope?: string, id_token?: string }} */
	const tokens = await tokenRes.json();

	// Decode email from id_token JWT payload (no signature verification needed here —
	// the token was just issued by Google in response to our server-side request)
	let accountEmail = null;
	if (tokens.id_token) {
		try {
			const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
			accountEmail = payload.email ?? null;
		} catch {
			// non-fatal — email is informational
		}
	}

	const tokenExpiresAt = tokens.expires_in
		? new Date(Date.now() + tokens.expires_in * 1000)
		: null;

	const grantedScopes = tokens.scope ? tokens.scope.split(' ') : [];

	const [existing] = await db
		.select()
		.from(schema.integration)
		.where(
			and(
				eq(schema.integration.userId, locals.user.id),
				eq(schema.integration.provider, 'google')
			)
		);

	if (existing) {
		await db
			.update(schema.integration)
			.set({
				accountEmail,
				accessToken: tokens.access_token,
				// Google only re-issues a refresh token when prompt=consent; keep the old one if absent
				refreshToken: tokens.refresh_token ?? existing.refreshToken,
				tokenExpiresAt,
				scopes: JSON.stringify(grantedScopes)
			})
			.where(eq(schema.integration.id, existing.id));
	} else {
		await db.insert(schema.integration).values({
			id: crypto.randomUUID(),
			userId: locals.user.id,
			provider: 'google',
			accountEmail,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? null,
			tokenExpiresAt,
			scopes: JSON.stringify(grantedScopes)
		});
	}

	redirect(302, '/dashboard/integrations?connected=google');
}
