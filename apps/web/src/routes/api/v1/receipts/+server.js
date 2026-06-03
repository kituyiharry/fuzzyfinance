import { error, json } from '@sveltejs/kit';
import { requireScope } from '$lib/server/api-auth';
import { newReceiptSchema } from '$lib/server/api-schemas';
import { createReceiptFromTranscription } from '$lib/server/receipt-create';

/**
 * POST /api/v1/receipts — create a receipt from already-transcribed data.
 * Body: see newReceiptSchema. Returns { id, vectorId }.
 *
 * Scope required: receipts.write
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST(event) {
	requireScope(event, 'receipts.write');

	const body = await event.request.json().catch(() => null);
	const parsed = newReceiptSchema.safeParse(body);
	if (!parsed.success) {
		error(400, `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
	}

	// @ts-ignore — guaranteed by requireScope
	const userId = event.locals.user.id;
	const workspaceId = event.locals.workspaceId ?? null;

	const { id, vectorId } = await createReceiptFromTranscription(
		event.platform,
		{ userId, workspaceId, source: 'api' },
		parsed.data,
	);

	return json({ id, vectorId }, { status: 201 });
}
