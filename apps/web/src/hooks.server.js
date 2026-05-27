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

	// Route better-auth paths directly, bypassing svelteKitHandler's origin check
	// which fails when mobile clients use a different host than env.ORIGIN.
	// /api/auth/passkey/* are SvelteKit routes, not better-auth endpoints.
	if (
		event.url.pathname.startsWith('/api/auth') &&
		!event.url.pathname.startsWith('/api/auth/passkey/')
	) {
		return auth.handler(event.request);
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
