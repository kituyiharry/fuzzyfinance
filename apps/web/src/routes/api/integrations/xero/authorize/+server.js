import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { makeCodeVerifier, makeCodeChallenge } from '$lib/server/xero-pkce';

/**
 * Xero read-only scopes for Phase 1 of the integrations pivot. Write-back
 * (e.g. pushing FuzzyFinance categories as Xero Tracking Categories) is a
 * later phase; widening here means a fresh consent prompt is required.
 *
 * - openid / profile / email — identity
 * - offline_access            — to receive a refresh token
 * - accounting.invoices.read     — Invoices (ACCREC = revenue, ACCPAY = expense)
 * - accounting.contacts.read     — merchant / customer names
 * - accounting.settings.read     — Accounts (chart of accounts), TrackingCategories
 *
 * Notes on scopes that look adjacent but were *not* picked:
 *   - `accounting.transactions.read` does NOT exist on Xero (and never has
 *     under that exact name) — invoice / bill data is split per-resource.
 *     Don't reintroduce it.
 *   - `accounting.banktransactions.read` will be added in Phase 1.5 when
 *     we sync bank-side cash flow alongside invoices.
 *   - `accounting.reports.*.read` — Xero exposes per-report sub-scopes
 *     (e.g. `accounting.reports.profitandloss.read`). Add the specific
 *     ones we need when Phase 5 (fuzzy optimisations) lands.
 */
const XERO_SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
	'accounting.invoices.read',
	'accounting.contacts.read',
	'accounting.settings.read'
];


/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, cookies }) {
	if (!locals.user) redirect(302, '/');

	if (!env.XERO_CLIENT_ID) {
		throw new Error('XERO_CLIENT_ID is not configured');
	}

	const state    = crypto.randomUUID();
	const verifier = makeCodeVerifier();
	const challenge = await makeCodeChallenge(verifier);

	const cookieOpts = /** @type {const} */ ({
		path:     '/',
		httpOnly: true,
		secure:   true,
		sameSite: 'lax',
		maxAge:   600 // 10 minutes
	});
	cookies.set('xero_oauth_state',    state,    cookieOpts);
	cookies.set('xero_pkce_verifier',  verifier, cookieOpts);

	const params = new URLSearchParams({
		response_type:         'code',
		client_id:             env.XERO_CLIENT_ID,
		redirect_uri:          `${env.ORIGIN}/api/integrations/xero/callback`,
		scope:                 XERO_SCOPES.join(' '),
		state,
		code_challenge:        challenge,
		code_challenge_method: 'S256'
	});

	redirect(302, `https://login.xero.com/identity/connect/authorize?${params}`);
}
