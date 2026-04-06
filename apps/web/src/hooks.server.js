import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

/** @type {import('@sveltejs/kit').Handle} */ const handleBetterAuth = async ({
	event,
	resolve
}) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

    // Protect client routes
    if (!session && event.url.pathname.startsWith('/dashboard')) {
        throw redirect(303, '/');
    }

    // Protect client routes
    if (session && event.url.pathname === '/') {
        redirect(302, '/dashboard')
    }

	return svelteKitHandler({ event, resolve, auth, building });
};

export /** @type {import('@sveltejs/kit').Handle} */ const handle = handleBetterAuth;
