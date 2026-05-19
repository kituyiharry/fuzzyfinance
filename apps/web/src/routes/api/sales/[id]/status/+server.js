import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, and } from 'drizzle-orm';

const STUCK_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	if (!locals.user) error(401, 'Unauthorized');

	const [sale] = await db
		.select({
			id:            schema.sale.id,
			status:        schema.sale.status,
			errorMessage:  schema.sale.errorMessage,
			documentTitle: schema.sale.documentTitle,
			totalRevenue:  schema.sale.totalRevenue,
			currency:      schema.sale.currency,
			updatedAt:     schema.sale.updatedAt
		})
		.from(schema.sale)
		.where(and(eq(schema.sale.id, params.id), eq(schema.sale.userId, locals.user.id)));

	if (!sale) error(404, 'Sale not found');

	// Auto-heal stuck processing rows
	if (sale.status === 'processing') {
		// Extraction completed but status transition was missed → move to staged
		if (sale.documentTitle != null || sale.totalRevenue != null) {
			await db.update(schema.sale)
				.set({ status: 'staged' })
				.where(eq(schema.sale.id, params.id));
			return json({ ...sale, status: 'staged' });
		}
		// Still genuinely processing — fail after timeout
		const age = Date.now() - (sale.updatedAt?.getTime() ?? 0);
		if (age > STUCK_PROCESSING_MS) {
			const msg = 'Processing timed out. Please re-upload this document.';
			await db.update(schema.sale)
				.set({ status: 'failed', errorMessage: msg })
				.where(eq(schema.sale.id, params.id));
			return json({ ...sale, status: 'failed', errorMessage: msg });
		}
	}

	return json(sale);
}
