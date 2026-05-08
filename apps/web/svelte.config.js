import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csrf: {
            //trustedOrigins: ["*"],
			// Native mobile clients (Dio) don't send an Origin header, which
			// SvelteKit's built-in CSRF check treats as a mismatch → 403.
			// API routes are protected by better-auth session cookies instead.
			checkOrigin: false,
		},
	},
};

export default config;
