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
    trustedOrigins: ["http://localhost:5173"],
	socialProviders: {
		google: {
			clientId:     env.GOOGLE_CLIENT_ID ?? "GCLIENT_ID_UNDEFINED",
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? "GCLIENT_SECRET_UNDEFINED"
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
});
