import { env } from '$env/dynamic/private';

/**
 * Expose which social sign-in providers are configured. The Apple button
 * only renders when the Services-ID + client-secret JWT are both present,
 * so the user doesn't see a button that errors out on click.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load() {
	return {
		providers: {
			apple: Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET),
		},
	};
}
