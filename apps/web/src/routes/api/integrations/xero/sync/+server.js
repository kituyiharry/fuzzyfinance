import { error, json } from '@sveltejs/kit';
import { syncUserXero } from '$lib/server/xero-sync';

/**
 * Manual Xero sync trigger. Mirrored by a scheduled cron in Phase 1.5;
 * for v1 this is the only way to advance the integration window.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	try {
		const summary = await syncUserXero(locals.user.id);
		return json({ ok: true, summary });
	} catch (/** @type {any} */ e) {
		const message = String(e?.message ?? e);
		if (message.startsWith('AUTH_REQUIRED:')) {
			return json({ ok: false, code: 'AUTH_REQUIRED', message }, { status: 401 });
		}
		console.error('[xero/sync] failed:', e);
		return json({ ok: false, message }, { status: 502 });
	}
}
