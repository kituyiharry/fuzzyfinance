import { auth } from '$lib/server/auth';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {

    const data  = await request.json();
	const { idToken } = data;

	return auth.handler(
		new Request(new URL('/api/auth/sign-in/social', request.url), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				provider: 'google',
                idToken:  { token: idToken },
				callbackURL: '/dashboard'
			})
		})
	);
}
