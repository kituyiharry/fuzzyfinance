import { error, json } from '@sveltejs/kit';
import { syncUserXero } from '$lib/server/xero-sync';

/**
 * Manual Xero sync trigger.
 *
 * Modes (selected via `?mode=…` or `{ mode: '…' }` in the JSON body):
 *   - `auto` (default): live-delta sync — first run back-fills the active
 *     FY, subsequent runs use `If-Modified-Since` against the stored
 *     `lastSyncedAt` watermark.
 *   - `previousFy`: one-shot historical back-fill of the prior AU/NZ FY
 *     only. Does NOT advance `lastSyncedAt`.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ locals, platform, url, request }) {
	if (!locals.user) error(401, 'Unauthorized');

	// Pick up the mode from `?mode=` or, failing that, from the JSON body.
	let rawMode = url.searchParams.get('mode') ?? 'auto';
	if (rawMode !== 'previousFy') {
		try {
			const body = await request.clone().json();
			if (body?.mode === 'previousFy') rawMode = 'previousFy';
		} catch { /* body absent or not JSON — keep default */ }
	}
	const mode = /** @type {'auto' | 'previousFy'} */ (rawMode === 'previousFy' ? 'previousFy' : 'auto');

	try {
		const summary = await syncUserXero(locals.user.id, platform?.env, { mode });
		return json({ ok: true, mode, summary });
	} catch (/** @type {any} */ e) {
		const message = String(e?.message ?? e);
		if (message.startsWith('AUTH_REQUIRED:')) {
			return json({ ok: false, code: 'AUTH_REQUIRED', message }, { status: 401 });
		}
		console.error('[xero/sync] failed:', e);
		return json({ ok: false, message }, { status: 502 });
	}
}
