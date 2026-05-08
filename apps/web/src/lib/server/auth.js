import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	trustedOrigins: ["http://localhost:5173", "https://fuzzies.app", "http://192.168.1.163:5173", "http://10.0.0.7:5173"],
	advanced: {
		// Native mobile clients (Dio) send session cookies but no Origin header,
		// which triggers better-auth's CSRF check → 403. SvelteKit-level CSRF is
		// already disabled (checkOrigin: false in svelte.config.js), so disabling
		// here is consistent. Session security is enforced by the signed HttpOnly
		// session cookie, not by Origin checking.
		disableCSRFCheck: true,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge:  60 * 60 * 24,
	},
	socialProviders: {
		google: {
			clientId: [
				env.GOOGLE_CLIENT_ID ?? "GCLIENT_ID_UNDEFINED",
				env.IOS_GOOGLE_CLIENT_ID ?? "IOS_GOOGLE_CLIENT_ID_UNDEFINED"
			],
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? "GCLIENT_SECRET_UNDEFINED",
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent), // must remain last
	],
});

// TODO: will this work??
// export const mobiAuth = betterAuth({
// 	baseURL: env.ORIGIN,
// 	secret: env.BETTER_AUTH_SECRET,
// 	database: drizzleAdapter(db, { provider: 'sqlite' }),
//     // TODO: origins Must be verified for security purposes
//     trustedOrigins: ["*"],
// 	socialProviders: {
// 		google: {
// 			clientId:     env.IOS_GOOGLE_CLIENT_ID ?? "IOS_GCLIENT_ID_UNDEFINED",
// 			clientSecret: env.GOOGLE_CLIENT_SECRET ?? "GCLIENT_SECRET_UNDEFINED"
// 		}
// 	},
// 	plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
// });
