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
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days — covers typical mobile usage gaps
		updateAge:  60 * 60 * 24,      // extend session if used after >1 day
	},
	socialProviders: {
		google: {
            // see: https://better-auth.com/docs/authentication/google#cross-platform-sign-in-web-ios-android
			clientId:     [ 
                env.GOOGLE_CLIENT_ID ?? "GCLIENT_ID_UNDEFINED",
                env.IOS_GOOGLE_CLIENT_ID ?? "IOS_GOOGLE_CLIENT_ID_UNDEFINED"
            ],
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? "GCLIENT_SECRET_UNDEFINED", 
            //extraClientIds: [
                //env.IOS_GOOGLE_CLIENT_ID ?? "IOS_GOOGLE_CLIENT_ID_UNDEFINED"
            //]
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
});

// TODO: will this work??
export const mobiAuth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
    // TODO: origins Must be verified for security purposes
    trustedOrigins: ["*"],
	socialProviders: {
		google: {
			clientId:     env.IOS_GOOGLE_CLIENT_ID ?? "IOS_GCLIENT_ID_UNDEFINED",
			clientSecret: env.GOOGLE_CLIENT_SECRET ?? "GCLIENT_SECRET_UNDEFINED"
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)] // make sure this is the last plugin in the array
});
