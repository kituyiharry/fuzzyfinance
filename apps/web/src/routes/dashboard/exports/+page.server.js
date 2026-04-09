import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { eq, desc, sql } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const rows = await db
		.select({
			id:           schema.receiptExport.id,
			fileName:     schema.receiptExport.fileName,
			receiptCount: schema.receiptExport.receiptCount,
			rowCount:     schema.receiptExport.rowCount,
			receiptIds:   schema.receiptExport.receiptIds,
			createdAt:    schema.receiptExport.createdAt
		})
		.from(schema.receiptExport)
		.where(eq(schema.receiptExport.userId, locals.user.id))
		.orderBy(desc(schema.receiptExport.createdAt));

	const exports = rows.map((ex) => ({
		...ex,
		receiptIds: (() => { try { return JSON.parse(ex.receiptIds ?? '[]'); } catch { return []; } })(),
	}));

	return { exports };
}

/** @type {import('./$types').Actions} */
export const actions = {
	/** Delete an export record */
	delete: async ({ locals, request }) => {
		if (!locals.user) redirect(302, '/');

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return;

		await db
			.delete(schema.receiptExport)
			.where(
				sql`${schema.receiptExport.id} = ${id} AND ${schema.receiptExport.userId} = ${locals.user.id}`
			);
	}
};
