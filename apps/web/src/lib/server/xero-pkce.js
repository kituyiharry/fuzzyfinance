/**
 * PKCE helpers shared between the Xero authorize route (generates the
 * verifier + challenge) and any tests that need to assemble a code_verifier.
 *
 * Public OAuth 2.0 clients on Xero don't pass a client_secret — the
 * verifier-to-challenge round-trip is what proves the redirect handler is
 * the same party that started the flow.
 *
 * Reference: https://tools.ietf.org/html/rfc7636
 */

/** Generates a 64-char base64url verifier (above the 43-char minimum). */
export function makeCodeVerifier() {
	const bytes = new Uint8Array(48);
	crypto.getRandomValues(bytes);
	return _b64url(bytes);
}

/**
 * S256: BASE64URL(SHA-256(verifier)).
 * @param {string} verifier
 * @returns {Promise<string>}
 */
export async function makeCodeChallenge(verifier) {
	const data = new TextEncoder().encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return _b64url(new Uint8Array(digest));
}

/** @param {Uint8Array} bytes */
function _b64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
