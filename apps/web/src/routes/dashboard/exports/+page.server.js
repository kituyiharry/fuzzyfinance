import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, eq, desc, sql } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const wsFilter = locals.workspaceId ? [eq(schema.receiptExport.workspaceId, locals.workspaceId)] : [];
	const saleWsFilter = locals.workspaceId ? [eq(schema.saleExport.workspaceId, locals.workspaceId)] : [];

	const [receiptRows, saleRows] = await Promise.all([
		db.select({
			id:           schema.receiptExport.id,
			fileName:     schema.receiptExport.fileName,
			receiptCount: schema.receiptExport.receiptCount,
			rowCount:     schema.receiptExport.rowCount,
			receiptIds:   schema.receiptExport.receiptIds,
			createdAt:    schema.receiptExport.createdAt
		})
		.from(schema.receiptExport)
		.where(and(eq(schema.receiptExport.userId, locals.user.id), ...wsFilter))
		.orderBy(desc(schema.receiptExport.createdAt)),

		db.select({
			id:        schema.saleExport.id,
			fileName:  schema.saleExport.fileName,
			saleCount: schema.saleExport.saleCount,
			rowCount:  schema.saleExport.rowCount,
			saleIds:   schema.saleExport.saleIds,
			createdAt: schema.saleExport.createdAt
		})
		.from(schema.saleExport)
		.where(and(eq(schema.saleExport.userId, locals.user.id), ...saleWsFilter))
		.orderBy(desc(schema.saleExport.createdAt)),
	]);

	return {
		exports: receiptRows.map((ex) => ({
			...ex,
			receiptIds: (() => { try { return JSON.parse(ex.receiptIds ?? '[]'); } catch { return []; } })(),
		})),
		saleExports: saleRows.map((ex) => ({
			...ex,
			saleIds: (() => { try { return JSON.parse(ex.saleIds ?? '[]'); } catch { return []; } })(),
		})),
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	deleteExpense: async ({ locals, request }) => {
		if (!locals.user) redirect(302, '/');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return;
		await db.delete(schema.receiptExport).where(
			sql`${schema.receiptExport.id} = ${id} AND ${schema.receiptExport.userId} = ${locals.user.id}`
		);
	},

	deleteRevenue: async ({ locals, request }) => {
		if (!locals.user) redirect(302, '/');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return;
		await db.delete(schema.saleExport).where(
			sql`${schema.saleExport.id} = ${id} AND ${schema.saleExport.userId} = ${locals.user.id}`
		);
	},
};
