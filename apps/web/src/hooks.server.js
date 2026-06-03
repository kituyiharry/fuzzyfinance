import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { runWithDb, db } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';

/** @type {import('@sveltejs/kit').Handle} */
const handleBetterAuth = async ({ event, resolve }) => {

    if(!env.IOS_GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GEMINI_API_KEY)
    {
        throw "UNDEFINED KEYS in ENV";
    }

    if (event.url.pathname === '/api/auth/callback/apple') {
        const cookieHeader = event.request.headers.get('cookie') ?? '';
        console.log(['[apple-cb]', {
            clientId: env.APPLE_CLIENT_ID, 
            teamId: env.APPLE_TEAM_ID,
            keyId: env.APPLE_KEY_ID, 
            hasKey: Boolean(env.APPLE_CERTIFICATE),
            method: event.request.method,
            hasStateCookie: cookieHeader.includes('state'),  // or whatever name better-auth uses
            cookieNames: cookieHeader.split(';').map(c => c.split('=')[0].trim()),
        }]);
    }


	// Route better-auth paths directly, bypassing svelteKitHandler's origin check
	// which fails when mobile clients use a different host than env.ORIGIN.
	// /api/auth/passkey/* are SvelteKit routes, not better-auth endpoints.
	if (
		event.url.pathname.startsWith('/api/auth') &&
		!event.url.pathname.startsWith('/api/auth/passkey/')
	) {
		return auth.handler(event.request);
	}

	// ── External API (Bearer-only) ──────────────────────────────────────
	// /api/v1/* is authenticated by OAuth access token, not by cookie
	// session. Look up the token in oauth_access_token, validate it's not
	// expired, populate locals.user + locals.tokenScopes. No cookie fallback
	// — Bearer is mandatory for these paths.
	if (event.url.pathname.startsWith('/api/v1/')) {
		const authz = event.request.headers.get('authorization');
		if (authz?.startsWith('Bearer ')) {
			const token = authz.slice(7).trim();
			const [tokenRow] = await db
				.select({
					userId:    schema.oauthAccessToken.userId,
					scopes:    schema.oauthAccessToken.scopes,
					expiresAt: schema.oauthAccessToken.accessTokenExpiresAt,
				})
				.from(schema.oauthAccessToken)
				.where(eq(schema.oauthAccessToken.accessToken, token));
			if (tokenRow && tokenRow.userId && tokenRow.expiresAt && new Date(tokenRow.expiresAt) > new Date()) {
				const [u] = await db
					.select()
					.from(schema.user)
					.where(eq(schema.user.id, tokenRow.userId));
				if (u) {
					event.locals.user = u;
					event.locals.tokenScopes = new Set(
						String(tokenRow.scopes ?? '').split(/[\s,]+/).filter(Boolean),
					);
				}
			}
		}
		return resolve(event);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		const uid = session.user.id;
		const wid = event.cookies.get('wid');
		let workspaceId = null;
		if (wid) {
			const [ws] = await db.select({ id: schema.workspace.id })
				.from(schema.workspace)
				.where(and(eq(schema.workspace.id, wid), eq(schema.workspace.userId, uid)));
			if (ws) workspaceId = ws.id;
		}
		if (!workspaceId) {
			const [def] = await db.select({ id: schema.workspace.id })
				.from(schema.workspace)
				.where(and(eq(schema.workspace.userId, uid), eq(schema.workspace.isDefault, true)));
			if (def) workspaceId = def.id;
		}
		event.locals.workspaceId = workspaceId;
	}

	if (!session && event.url.pathname.startsWith('/dashboard')) {
		throw redirect(303, '/');
	}

	if (session && event.url.pathname === '/') {
		redirect(302, '/dashboard');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/** @type {import('@sveltejs/kit').Handle} */
export const handle = ({ event, resolve }) =>
	runWithDb(event.platform?.env?.DB, () => handleBetterAuth({ event, resolve }));
