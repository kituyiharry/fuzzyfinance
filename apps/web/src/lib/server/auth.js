import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { oidcProvider } from 'better-auth/plugins';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

// import { importPKCS8, SignJWT } from "jose";

// See: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
//      https://better-auth.com/docs/authentication/apple#generate-apple-client-secret-jwt
//
// Generate the client secret JWT required for 'Sign in with Apple'.
// async function generateAppleClientSecret(clientId, teamId, keyId, privateKey) {
//     const key = await importPKCS8(privateKey, "ES256");
//     const now = Math.floor(Date.now() / 1000);
//     return new SignJWT({})
//         .setProtectedHeader({ alg: "ES256", kid: keyId })
//         .setIssuer(teamId)
//         .setSubject(clientId)
//         .setAudience("https://appleid.apple.com")
//         .setIssuedAt(now)
//         .setExpirationTime(now + 180 * 24 * 60 * 60)
//         .sign(key);
// }

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret:  env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	trustedOrigins: [
        "http://localhost:5173",
        // "http://192.168.1.163:5173", 
        // "http://10.0.0.7:5173", 
        "https://fuzzies.app", 
        "fuzzyfinance.admin-c6f.workers.dev", 
        "https://appleid.apple.com"
    ],
	advanced: {
		// Native mobile clients (Dio) send session cookies but no Origin header,
		// which triggers better-auth's CSRF check → 403. SvelteKit-level CSRF is
		// already disabled (checkOrigin: false in svelte.config.js), so disabling
		// here is consistent. Session security is enforced by the signed HttpOnly
		// session cookie, not by Origin checking.
        //
		disableCSRFCheck: true,

		// Apple Sign In uses response_mode=form_post — appleid.apple.com POSTs
		// the auth code back to /api/auth/callback/apple. Lax-SameSite cookies
		// (the default) aren't sent on cross-site POSTs, so better-auth's state
		// cookie is missing and we'd reject with `invalid_code`. Relax to
		// SameSite=None on HTTPS origins only — Secure is required for None
		// and won't set over http://localhost, hence the prod-only gate so
		// local vite/preview dev (http) keeps working with the Lax default.
		...((env.ORIGIN ?? '').startsWith('https://') ? {
			defaultCookieAttributes: {
				sameSite: 'none',
				secure:   true,
				httpOnly: true,
			},
		} : {}),
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
		},

		// Sign in with Apple — identity-only (no Drive/Sheets scopes).
		// Apple's Private Relay returns proxy emails like xxx@privaterelay.appleid.com;
		// we store them verbatim, Apple forwards mail to the user's real address.
		//
		// APPLE_CLIENT_ID:      Services ID from Apple Developer (web), e.g. "app.fuzzies.signin"
		// APPLE_APP_BUNDLE_ID:  Bundle ID for native iOS (optional, only if mobile uses native SIWA)
		// APPLE_CLIENT_SECRET:  JWT signed with the .p8 private key (ES256, kid=APPLE_KEY_ID,
		//                      iss=APPLE_TEAM_ID, aud=https://appleid.apple.com, sub=APPLE_CLIENT_ID,
		//                      exp ≤ 6 months). Rotate before expiry.
		//                      See https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
		apple: {
			clientId:            env.APPLE_CLIENT_ID     ?? "APPLE_CLIENT_ID_UNDEFINED",
			clientSecret:        env.APPLE_CLIENT_SECRET ?? "APPLE_CLIENT_SECRET_UNDEFINED",
            audience:            "https://appleid.apple.com",
            enabled: true,
			// clientSecret:        await generateAppleClientSecret(
            //     env.APPLE_CLIENT_ID, 
            //     env.APPLE_TEAM_ID, 
            //     env.APPLE_KEY_ID, 
            //     env.APPLE_CERTIFICATE,
            // ),
            // May be needed for IOS
			// appBundleIdentifier: env.APPLE_APP_BUNDLE_ID || undefined,

			// Apple normally returns an email in the ID token (real or
			// Private-Relay proxy), but it can be missing for some Apple
			// Business/Education accounts, when the user revokes the email
			// scope at first sign-in, or on certain native-SIWA paths. The
			// `user.email` column is NOT NULL, so synth a stable placeholder
			// derived from the Apple `sub` (which IS always present) and mark
			// it unverified — preserves account continuity across sign-ins
			// without faking verification.
			mapProfileToUser: (/** @type {any} */ profile) => {
				const hasEmail = typeof profile?.email === 'string' && profile.email.length > 0;
				return {
					email: hasEmail
						? profile.email
						: `apple-${profile.sub}@no-email.fuzzies.app`,
					emailVerified: hasEmail && (profile.email_verified === true || profile.email_verified === 'true'),
				};
			},
		},
	},
	plugins: [
		oidcProvider({
			loginPage:   '/',                  // existing sign-in entry
			consentPage: '/oauth/consent',     // custom UI in dashboard aesthetic
			requirePKCE: true,                 // public clients (GPT, mobile) require it
			scopes: ['openid', 'profile', 'email', 'offline_access', 'receipts.read', 'receipts.write'],
			accessTokenExpiresIn:  60 * 60,             // 1h
			refreshTokenExpiresIn: 60 * 60 * 24 * 30,   // 30d
			codeExpiresIn: 60 * 10,                     // 10m
			trustedClients: [
				// Official FuzzyFinance for ChatGPT — public client, PKCE only.
				// Add the real GPT-store callback URL when published; current value
				// is the dev/test callback used by the GPT Store action wizard.
				{
					clientId:     env.GPT_OAUTH_CLIENT_ID ?? 'gpt-store-fuzzyfinance',
					type:         'public',
					name:         'FuzzyFinance for ChatGPT',
					metadata:     null,
					redirectUrls: [
						'https://chat.openai.com/aip/g-fuzzyfinance/oauth/callback',
						'https://chatgpt.com/aip/g-fuzzyfinance/oauth/callback',
						// dev fallback for local cURL round-trip:
						'http://localhost:4173/oauth/test-callback',
					],
					disabled: false,
					skipConsent: false,
				},
			],
		}),
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
