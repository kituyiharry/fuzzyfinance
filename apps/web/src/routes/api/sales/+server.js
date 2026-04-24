import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and, ne, sql } from 'drizzle-orm';
import { processSale } from '$lib/server/sales-processor';

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
		.from(schema.sale)
		.where(
			and(
				eq(schema.sale.userId, locals.user.id),
				sql`DATE(${schema.sale.createdAt} / 1000, 'unixepoch') = DATE('now')`
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

	const saleId = crypto.randomUUID();
	const r2Key = `sales/${locals.user.id}/${saleId}/${file.name}`;

	// Read bytes once — used for both hash and R2 upload
	const bytes = await file.arrayBuffer();

	// Compute SHA-256 for duplicate detection
	const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
	const hashArray  = Array.from(new Uint8Array(hashBuffer));
	const fileHash   = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

	const force = formData.get('force') === 'true';
	if (!force) {
		const [existing] = await db
			.select({ id: schema.sale.id })
			.from(schema.sale)
			.where(and(
				eq(schema.sale.userId, locals.user.id),
				eq(schema.sale.fileHash, fileHash),
				ne(schema.sale.status, 'failed')
			))
			.limit(1);

		if (existing) {
			return json(
				{ error: 'duplicate', duplicateSaleId: existing.id },
				{ status: 409 }
			);
		}

		// const [similar] = await db
		// 	.select({ id: schema.sale.id })
		// 	.from(schema.sale)
		// 	.where(eq(schema.sale.rawFileName, file.name))
		// 	.limit(1);

		// if (similar) {
		// 	return json(
		// 		{ error: 'duplicate', duplicateSaleId: similar.id },
		// 		{ status: 409 }
		// 	);
		// }
	}

	// Write to R2 transit buffer
	await platform.env.fuzzyfinance_receipts.put(r2Key, bytes, {
		httpMetadata: { contentType: file.type }
	});

	// Insert pending sale row
	await db.insert(schema.sale).values({
		id:           saleId,
		userId:       locals.user.id,
		status:       'pending',
		r2Key,
		rawFileName:  file.name,
		rawMimeType:  file.type,
		rawSizeBytes: file.size,
		fileHash
	});

	// Kick off background processing — returns 202 immediately
	platform.ctx.waitUntil(processSale(platform.env, saleId));

	return json({ saleId }, { status: 202 });
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const rows = await db
		.select()
		.from(schema.sale)
		.where(eq(schema.sale.userId, locals.user.id));

	rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

	return json(rows);
}
