import { error, json } from '@sveltejs/kit';
import { classifyPendingForUser } from '$lib/server/post-sync-classify';

/**
 * Manually run the post-sync classification pass for the current user.
 *
 * Useful when a previous `sync` left rows uncategorised (e.g. it ran
 * out of subrequest budget, or it ran before the user added a Gemini
 * credential). This endpoint shares the same budget as the sync — it's
 * its own worker invocation, with a fresh 1000-subrequest cap.
 *
 * The pass is deduplicated by description so calling it after a large
 * sync stays well inside the budget.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.AI || !env?.VECTORIZE) error(503, 'AI / Vectorize bindings unavailable');

	try {
		const result = await classifyPendingForUser(locals.user.id, env);
		return json({ ok: true, ...result });
	} catch (/** @type {any} */ e) {
		console.error('[xero/classify-pending] failed:', e);
		return json({ ok: false, message: String(e?.message ?? e) }, { status: 502 });
	}
}
