import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';

/** @type {Record<string, string>} */
const TRUSTED_CLIENT_NAMES = {
	'gpt-store-fuzzyfinance': 'FuzzyFinance for ChatGPT',
};

/**
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const rows = await db
		.select({
			id:           schema.oauthAccessToken.id,
			clientId:     schema.oauthAccessToken.clientId,
			scopes:       schema.oauthAccessToken.scopes,
			createdAt:    schema.oauthAccessToken.createdAt,
			expiresAt:    schema.oauthAccessToken.accessTokenExpiresAt,
			refreshExp:   schema.oauthAccessToken.refreshTokenExpiresAt,
		})
		.from(schema.oauthAccessToken)
		.where(eq(schema.oauthAccessToken.userId, locals.user.id))
		.orderBy(desc(schema.oauthAccessToken.createdAt));

	// Group by clientId — one app may have multiple active tokens.
	/** @type {Map<string, { clientId: string; name: string; scopes: Set<string>; lastIssued: Date | null; tokenIds: string[] }>} */
	const byClient = new Map();
	for (const r of rows) {
		const cid = r.clientId ?? '(unknown)';
		const existing = byClient.get(cid) ?? {
			clientId: cid,
			name: TRUSTED_CLIENT_NAMES[cid] ?? cid,
			scopes: new Set(),
			lastIssued: null,
			tokenIds: [],
		};
		for (const s of String(r.scopes ?? '').split(/[\s,]+/).filter(Boolean)) {
			existing.scopes.add(s);
		}
		if (r.createdAt && (!existing.lastIssued || r.createdAt > existing.lastIssued)) {
			existing.lastIssued = r.createdAt;
		}
		existing.tokenIds.push(r.id);
		byClient.set(cid, existing);
	}

	// Fallback to oauthApplication for non-trusted clients.
	for (const cid of byClient.keys()) {
		if (!TRUSTED_CLIENT_NAMES[cid]) {
			const [app] = await db
				.select({ name: schema.oauthApplication.name })
				.from(schema.oauthApplication)
				.where(eq(schema.oauthApplication.clientId, cid));
			const entry = byClient.get(cid);
			if (app?.name && entry) entry.name = app.name;
		}
	}

	return {
		apps: [...byClient.values()].map((a) => ({
			...a,
			scopes:     [...a.scopes].sort(),
			lastIssued: a.lastIssued ? a.lastIssued.toISOString() : null,
		})),
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	revoke: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/');
		const form = await request.formData();
		const clientId = String(form.get('clientId') ?? '');
		if (!clientId) return { success: false };

		await db
			.delete(schema.oauthAccessToken)
			.where(and(
				eq(schema.oauthAccessToken.userId, locals.user.id),
				eq(schema.oauthAccessToken.clientId, clientId),
			));

		await db
			.delete(schema.oauthConsent)
			.where(and(
				eq(schema.oauthConsent.userId, locals.user.id),
				eq(schema.oauthConsent.clientId, clientId),
			));

		return { success: true };
	},
};
