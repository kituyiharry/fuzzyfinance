import { env } from '$env/dynamic/private';

export const rpID = () => (env.ORIGIN ? new URL(env.ORIGIN).hostname : 'localhost');

export const expectedOrigins = () => {
	const origins = [env.ORIGIN ?? 'http://localhost:5173'];
	if (env.ANDROID_APK_FINGERPRINT) {
		origins.push(`android:apk-key-hash:${env.ANDROID_APK_FINGERPRINT}`);
	}
	return origins;
};

/** Replicates better-auth / better-call signed cookie format: `value.base64HMAC` */
export async function signSessionCookie(/** @type {string} */ value) {
	const secret = env.BETTER_AUTH_SECRET;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
	return encodeURIComponent(`${value}.${b64}`);
}

export function sessionCookieHeader(/** @type {string} */ signedValue) {
	const secure = env.ORIGIN?.startsWith('https') ? '; Secure' : '';
	const maxAge = 60 * 60 * 24 * 30;
	return `better-auth.session_token=${signedValue}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
