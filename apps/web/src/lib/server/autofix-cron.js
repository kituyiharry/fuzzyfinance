/**
 * AutoFix cron worker.
 *
 * Fires every 12 hours from the Cloudflare cron trigger configured in
 * wrangler.jsonc (cron pattern "0 0,12 * * *" — at 00:00 and 12:00 UTC).
 * Iterates every workspace that has uncategorised standard line items
 * and runs the same deduplicated classifier the editor used to trigger
 * from the AutoFix button — `classifyPendingForUser` scoped to one
 * workspace at a time.
 *
 * Why a cron rather than a manual button: the user-triggered HTTP path
 * was hitting Cloudflare's per-request subrequest + wall-clock budgets
 * for large workspaces, and the worker invocation could die before
 * progress flushed. A scheduled invocation gets its own fresh budget,
 * runs without a client connection to drop, and is observable end-to-end
 * via `wrangler tail`.
 *
 * Subrequest budgeting: we cap the number of workspaces processed per
 * cron firing at `MAX_WORKSPACES_PER_RUN` and pick the ones whose
 * autofix_state is oldest (oldest `completedAt`, or never run). Each
 * workspace's classification pass internally caps at
 * `MAX_UNIQUE_PER_RUN` unique descriptions, so the total subrequest cost
 * stays bounded.
 */

import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, asc, eq, exists, isNull, or, sql } from 'drizzle-orm';
import { classifyPendingForUser } from '$lib/server/post-sync-classify';

/**
 * Max workspaces processed in a single cron firing. The classifier's own
 * `MAX_UNIQUE_PER_RUN = 500` budget compounds per workspace, so even
 * with the dedupe we want a hard cap to stay inside the 1000-subrequest
 * cap with headroom for D1 + the cron's own bookkeeping.
 */
const MAX_WORKSPACES_PER_RUN = 5;

/** Throttle progress writes to D1: at most one per second per run. */
const PROGRESS_MIN_INTERVAL_MS = 1000;

/**
 * Main entry — call from the worker's `scheduled` handler.
 *
 * @param {App.Platform['env']} env
 * @returns {Promise<{ workspacesProcessed: number, workspacesSkipped: number, errors: number }>}
 */
export async function runAutofixCron(env) {
	const cronRunId = crypto.randomUUID();
	const t0 = Date.now();
	console.log(`[autofix-cron] ${JSON.stringify({ event: 'cron-start', cronRunId })}`);

	if (!env?.AI || !env?.VECTORIZE) {
		console.warn(`[autofix-cron] ${JSON.stringify({ event: 'cron-skipped', cronRunId, reason: 'AI or VECTORIZE binding missing' })}`);
		return { workspacesProcessed: 0, workspacesSkipped: 0, errors: 0 };
	}

	// Find workspaces with pending (uncategorised standard) line items,
	// ordered by oldest autofix-completion first so attention rotates
	// instead of always hitting the same workspace.
	const candidates = await _loadCandidateWorkspaces();
	console.log(`[autofix-cron] ${JSON.stringify({ event: 'candidates-loaded', cronRunId, totalCandidates: candidates.length, capped: MAX_WORKSPACES_PER_RUN })}`);

	let workspacesProcessed = 0;
	let workspacesSkipped   = 0;
	let errors              = 0;

	for (const ws of candidates.slice(0, MAX_WORKSPACES_PER_RUN)) {
		// Check stale-lock semantics: if another run is genuinely in flight
		// (e.g. a manual POST happened seconds before this cron firing),
		// skip the workspace this cycle.
		const currentState = _parseState(ws.autofixState);
		if (currentState.status === 'running' && currentState.startedAt) {
			const age = Date.now() - new Date(currentState.startedAt).getTime();
			if (age < 15 * 60 * 1000) {
				console.log(`[autofix-cron] ${JSON.stringify({ event: 'workspace-skipped', cronRunId, workspaceId: ws.id, reason: 'manual run in flight', startedAt: currentState.startedAt })}`);
				workspacesSkipped++;
				continue;
			}
		}

		const runId = crypto.randomUUID();
		const startedAt = new Date().toISOString();
		console.log(`[autofix-cron] ${JSON.stringify({ event: 'workspace-start', cronRunId, runId, workspaceId: ws.id, userId: ws.userId, queuePosition: workspacesProcessed + 1 })}`);

		await db.update(schema.workspace)
			.set({ autofixState: JSON.stringify({ status: 'running', runId, startedAt, source: 'cron', cronRunId }) })
			.where(eq(schema.workspace.id, ws.id));

		let lastProgressWriteAt = 0;
		try {
			const summary = await classifyPendingForUser(ws.userId, env, {
				workspaceId:  ws.id,
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
							source:    'cron',
							cronRunId,
							progress:  snapshot
						}) })
						.where(eq(schema.workspace.id, ws.id));
				}
			});

			await db.update(schema.workspace)
				.set({ autofixState: JSON.stringify({
					status:      'idle',
					runId,
					startedAt,
					completedAt: new Date().toISOString(),
					source:      'cron',
					cronRunId,
					summary
				}) })
				.where(eq(schema.workspace.id, ws.id));

			console.log(`[autofix-cron] ${JSON.stringify({ event: 'workspace-completed', cronRunId, runId, workspaceId: ws.id, summary })}`);
			workspacesProcessed++;
		} catch (/** @type {any} */ err) {
			const message = String(err?.message ?? err);
			await db.update(schema.workspace)
				.set({ autofixState: JSON.stringify({
					status:      'idle',
					runId,
					startedAt,
					completedAt: new Date().toISOString(),
					source:      'cron',
					cronRunId,
					error:       message
				}) })
				.where(eq(schema.workspace.id, ws.id));

			console.error(`[autofix-cron] ${JSON.stringify({ event: 'workspace-failed', cronRunId, runId, workspaceId: ws.id, error: message, stack: err?.stack })}`);
			errors++;
		}
	}

	const durationMs = Date.now() - t0;
	console.log(`[autofix-cron] ${JSON.stringify({ event: 'cron-done', cronRunId, workspacesProcessed, workspacesSkipped, errors, durationMs })}`);
	return { workspacesProcessed, workspacesSkipped, errors };
}

/**
 * Load workspaces that *might* have work to do, ordered oldest first.
 *
 * "Might have work" = has at least one standard line item with a missing
 * primary OR secondary category. This is checked via a correlated
 * subquery rather than a JOIN so we don't load the line items
 * themselves.
 *
 * Ordering: workspaces with no recorded `completedAt` (never run) come
 * first; the rest sorted by ascending `completedAt` so the oldest run
 * gets next attention.
 *
 * @returns {Promise<Array<{ id: string, userId: string, autofixState: string | null }>>}
 */
async function _loadCandidateWorkspaces() {
	const hasPendingReceiptLine = exists(
		db.select({ x: sql`1` })
			.from(schema.receiptLineItem)
			.innerJoin(schema.receipt, eq(schema.receipt.id, schema.receiptLineItem.receiptId))
			.where(and(
				eq(schema.receipt.workspaceId, schema.workspace.id),
				eq(schema.receiptLineItem.kind, 'standard'),
				or(
					isNull(schema.receiptLineItem.primaryCategory),
					isNull(schema.receiptLineItem.secondaryCategory)
				)
			))
	);
	const hasPendingSaleLine = exists(
		db.select({ x: sql`1` })
			.from(schema.saleLineItem)
			.innerJoin(schema.sale, eq(schema.sale.id, schema.saleLineItem.saleId))
			.where(and(
				eq(schema.sale.workspaceId, schema.workspace.id),
				eq(schema.saleLineItem.kind, 'standard'),
				or(
					isNull(schema.saleLineItem.primaryCategory),
					isNull(schema.saleLineItem.secondaryCategory)
				)
			))
	);

	return db.select({
		id:           schema.workspace.id,
		userId:       schema.workspace.userId,
		autofixState: schema.workspace.autofixState
	})
		.from(schema.workspace)
		.where(or(hasPendingReceiptLine, hasPendingSaleLine))
		// SQLite sorts NULL first by default — perfect for "never run goes first".
		.orderBy(asc(sql`json_extract(${schema.workspace.autofixState}, '$.completedAt')`));
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ status: 'idle' | 'running', startedAt?: string }}
 */
function _parseState(raw) {
	if (!raw) return { status: 'idle' };
	try {
		const parsed = JSON.parse(raw);
		if (parsed && (parsed.status === 'idle' || parsed.status === 'running')) return parsed;
	} catch { /* fall through */ }
	return { status: 'idle' };
}
