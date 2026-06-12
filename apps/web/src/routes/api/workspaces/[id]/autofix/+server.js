import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq } from 'drizzle-orm';
import { classifyPendingForUser } from '$lib/server/post-sync-classify';

/**
 * Workspace-scoped AutoFix endpoint.
 *
 * Kicks off a background classification pass that fills missing primary
 * + secondary categories on every standard line item in the workspace.
 * Runs the same waterfall (embeddings → Gemini) the post-sync classifier
 * uses, deduplicated by description.
 *
 * Coordination: `workspace.autofix_state` is a JSON blob that acts as a
 * soft mutex. POST returns 409 if a run is already in flight (started
 * within the last 15 minutes). The actual work runs in
 * `platform.ctx.waitUntil`, so the HTTP response returns in tens of
 * milliseconds while the classifier keeps going in the background.
 *
 * Every line item the run updates also gets an `autofixedAt: <ISO>`
 * field written into the parent's `lineItemsJson` cache so the UI +
 * Drive sync downstreams can see which rows the run touched.
 */

/** Any `running` lock older than this is treated as abandoned (worker
 *  died mid-task, network blip, etc.). */
const STALE_LOCK_MS = 15 * 60 * 1000;

/**
 * GET — current AutoFix state for the workspace. Returns
 *   {
 *     status:       'idle' | 'running',
 *     startedAt?:   ISO,
 *     completedAt?: ISO,
 *     summary?:     { uniqueDescriptions, linesUpdated, headersUpdated, skipped },
 *     error?:       string
 *   }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');
	const [ws] = await db.select()
		.from(schema.workspace)
		.where(and(
			eq(schema.workspace.id, params.id),
			eq(schema.workspace.userId, locals.user.id)
		));
	if (!ws) error(404, 'Workspace not found');
	return json(_parseState(ws.autofixState));
}

/**
 * POST — start an AutoFix run. Returns 202 with the new state on
 * success, 409 with the current state when a run is already underway.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ params, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	const env = platform?.env;
	if (!env?.AI || !env?.VECTORIZE) error(503, 'AI / Vectorize bindings unavailable');

	const [ws] = await db.select()
		.from(schema.workspace)
		.where(and(
			eq(schema.workspace.id, params.id),
			eq(schema.workspace.userId, locals.user.id)
		));
	if (!ws) error(404, 'Workspace not found');

	const state = _parseState(ws.autofixState);

	// Mutex: reject if a run is already in flight and hasn't gone stale.
	if (state.status === 'running' && state.startedAt) {
		const age = Date.now() - new Date(state.startedAt).getTime();
		if (age < STALE_LOCK_MS) {
			return json({
				ok: false,
				message: 'AutoFix is already running',
				state
			}, { status: 409 });
		}
		// Stale lock — fall through and overwrite.
	}

	const runId = crypto.randomUUID();
	const startedAt = new Date().toISOString();
	const t0 = Date.now();
	const newState = { status: /** @type {const} */ ('running'), runId, startedAt };
	await db.update(schema.workspace)
		.set({ autofixState: JSON.stringify(newState) })
		.where(eq(schema.workspace.id, ws.id));

	const userId = locals.user.id;
	const workspaceId = ws.id;

	console.log(`[autofix] ${JSON.stringify({ event: 'started', runId, userId, workspaceId })}`);

	const work = (async () => {
		// Throttle progress writes so D1 doesn't get hammered — at most one
		// write per second per AutoFix run. The last snapshot of each phase
		// is still flushed even if it lands within the throttle window.
		let lastProgressWriteAt = 0;
		const PROGRESS_MIN_INTERVAL_MS = 1000;
		try {
			const summary = await classifyPendingForUser(userId, env, {
				workspaceId,
				stampAutofix: true,
				runId,
				onProgress: async (snapshot) => {
					const now = Date.now();
					if (now - lastProgressWriteAt < PROGRESS_MIN_INTERVAL_MS) return;
					lastProgressWriteAt = now;
					await db.update(schema.workspace)
						.set({ autofixState: JSON.stringify({
							status:    'running',
							runId,
							startedAt,
							progress:  snapshot
						}) })
						.where(eq(schema.workspace.id, workspaceId));
				}
			});
			await db.update(schema.workspace)
				.set({ autofixState: JSON.stringify({
					status:      'idle',
					runId,
					startedAt,
					completedAt: new Date().toISOString(),
					summary
				}) })
				.where(eq(schema.workspace.id, workspaceId));
			console.log(`[autofix] ${JSON.stringify({ event: 'completed', runId, userId, workspaceId, durationMs: Date.now() - t0, summary })}`);
		} catch (/** @type {any} */ err) {
			const message = String(err?.message ?? err);
			await db.update(schema.workspace)
				.set({ autofixState: JSON.stringify({
					status:      'idle',
					runId,
					startedAt,
					completedAt: new Date().toISOString(),
					error:       message
				}) })
				.where(eq(schema.workspace.id, workspaceId));
			console.error(`[autofix] ${JSON.stringify({ event: 'failed', runId, userId, workspaceId, durationMs: Date.now() - t0, error: message, stack: err?.stack })}`);
		}
	})();
	platform?.ctx?.waitUntil?.(work);

	return json({ ok: true, state: newState }, { status: 202 });
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ status: 'idle' | 'running', startedAt?: string, completedAt?: string, summary?: any, error?: string }}
 */
function _parseState(raw) {
	if (!raw) return { status: 'idle' };
	try {
		const parsed = JSON.parse(raw);
		if (parsed && (parsed.status === 'idle' || parsed.status === 'running')) return parsed;
	} catch {
		// fall through
	}
	return { status: 'idle' };
}
