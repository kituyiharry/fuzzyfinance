import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, ne, sql, desc } from 'drizzle-orm';
import { processReceipt } from '$lib/server/receipt-processor';

const DAILY_LIMIT = 30;

const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'application/pdf'
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env?.fuzzyfinance_receipts) error(503, 'Storage binding unavailable');

	// Enforce daily upload limit
	const [countRow] = await db
		.select({ count: sql`COUNT(*)`.as('count') })
		.from(schema.receipt)
		.where(
			and(
				eq(schema.receipt.userId, locals.user.id),
				sql`DATE(${schema.receipt.createdAt} / 1000, 'unixepoch') = DATE('now')`
			)
		);
	if (Number(countRow?.count ?? 0) >= DAILY_LIMIT) {
		error(429, `Daily upload limit reached (${DAILY_LIMIT}/day). Resets at midnight UTC.`);
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data')) {
		error(415, 'Expected multipart/form-data');
	}

	let formData;
	try {
		formData = await request.formData();
	} catch {
		error(400, 'Could not parse form data');
	}

	const file = formData.get('file');
	if (!(file instanceof File)) error(400, 'Missing file field');

	if (!ALLOWED_MIME_TYPES.has(file.type)) {
		error(415, `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WEBP, PDF`);
	}

	if (file.size > MAX_BYTES) {
		error(413, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB`);
	}

	const receiptId = crypto.randomUUID();
	const r2Key = `receipts/${locals.user.id}/${receiptId}/${file.name}`;

	// Read bytes once — used for both hash and R2 upload
	const bytes = await file.arrayBuffer();

	// Compute SHA-256 for duplicate detection
	const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
	const hashArray  = Array.from(new Uint8Array(hashBuffer));
	const fileHash   = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

	// Stage 1 dedup — skip if user explicitly forces the upload
	const force = formData.get('force') === 'true';
	if (!force) {
		const [existing] = await db
			.select({ id: schema.receipt.id })
			.from(schema.receipt)
			.where(and(
				eq(schema.receipt.userId, locals.user.id),
				eq(schema.receipt.fileHash, fileHash),
				ne(schema.receipt.status, 'failed')
			))
			.limit(1);

		if (existing) {
			return json(
				{ error: 'duplicate', duplicateReceiptId: existing.id },
				{ status: 409 }
			);
		}

        // don't check for similar file names due to direct capture images being
        // named in a similar manner
		// const [similar] = await db
		// 	.select({ id: schema.receipt.id })
		// 	.from(schema.receipt)
		// 	.where(
		// 		eq(schema.receipt.rawFileName, file.name),
		// 	)
		// 	.limit(1);

		// if (similar) {
		// 	return json(
		// 		{ error: 'duplicate', duplicateReceiptId: similar.id },
		// 		{ status: 409 }
		// 	);
		// }

	}

	// Write to R2 transit buffer
	await platform.env.fuzzyfinance_receipts.put(r2Key, bytes, {
		httpMetadata: { contentType: file.type }
	});

	// Insert pending receipt row
	await db.insert(schema.receipt).values({
		id:           receiptId,
		userId:       locals.user.id,
		status:       'pending',
		r2Key,
		rawFileName:  file.name,
		rawMimeType:  file.type,
		rawSizeBytes: file.size,
		fileHash
	});

	// Kick off background processing — returns 202 immediately
	platform.ctx.waitUntil(processReceipt(platform.env, receiptId));

	return json({ receiptId }, { status: 202 });
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url }) {
	if (!locals.user) error(401, 'Unauthorized');

	const before  = url.searchParams.get('before');
	const limit   = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
	const cursor  = before ? parseInt(before, 10) : null;

	const rows = await db
		.select()
		.from(schema.receipt)
		.where(
			cursor
				? and(
					eq(schema.receipt.userId, locals.user.id),
					sql`${schema.receipt.createdAt} < ${cursor}`
				  )
				: eq(schema.receipt.userId, locals.user.id)
		)
		.orderBy(desc(schema.receipt.createdAt))
		.limit(limit);

	return json(rows);
}
