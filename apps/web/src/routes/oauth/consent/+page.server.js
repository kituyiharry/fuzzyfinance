import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';

/**
 * Better-auth's oidcProvider redirects the user here when a client requests
 * consent. Query params: consent_code, client_id, scope.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ url, locals }) {
	if (!locals.user) redirect(303, `/?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);

	const consentCode = url.searchParams.get('consent_code') ?? '';
	const clientId    = url.searchParams.get('client_id')    ?? '';
	const scope       = url.searchParams.get('scope')        ?? '';

	const scopes = scope.split(/[\s,]+/).filter(Boolean);

	// Look up the client for display. The plugin's trustedClients aren't in
	// the DB, so this may return nothing for the GPT trusted client — fall
	// back to the clientId itself.
	let appName = clientId;
	if (clientId) {
		const [app] = await db
			.select({ name: schema.oauthApplication.name })
			.from(schema.oauthApplication)
			.where(eq(schema.oauthApplication.clientId, clientId));
		if (app?.name) appName = app.name;
		else if (clientId === 'gpt-store-fuzzyfinance') appName = 'FuzzyFinance for ChatGPT';
	}

	return { consentCode, clientId, scopes, appName };
}
