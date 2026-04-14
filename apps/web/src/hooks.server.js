import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { runWithDb } from '$lib/server/db';

/** @type {import('@sveltejs/kit').Handle} */
const handleBetterAuth = async ({ event, resolve }) => {
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
