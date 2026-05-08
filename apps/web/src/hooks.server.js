import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { runWithDb } from '$lib/server/db';
import { env } from '$env/dynamic/private';

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
