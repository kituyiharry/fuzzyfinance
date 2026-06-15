import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = /** @type {const} */ ([25, 50, 100, 200]);
const VALID_FILTERS = /** @type {const} */ (['attention', 'all', 'receipt', 'sale']);

/**
 * Load receipts + sales for the active workspace, marking each as
 * `needsAttention` if the header has no category or the row has zero
 * non-tax line items. The list view pivots on this so the user can
 * find rows that actually need refining.
 *
 * Pagination + filter are driven by URL search params:
 *   - filter: 'attention' | 'all' | 'receipt' | 'sale' (default: 'attention')
 *   - page:   1-indexed integer (default: 1)
 *   - size:   25 | 50 | 100 | 200 (default: 50)
 *
 * Counts are computed over the *full* workspace set so the filter tabs
 * keep showing the same totals regardless of which page is open.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ url, locals }) {
	if (!locals.user) redirect(302, '/');

	const filterParam = url.searchParams.get('filter');
	const filter = /** @type {typeof VALID_FILTERS[number]} */ (
		VALID_FILTERS.includes(/** @type {any} */ (filterParam)) ? filterParam : 'attention'
	);

	const pageRaw = Number(url.searchParams.get('page'));
	const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

	const sizeRaw = Number(url.searchParams.get('size'));
	const size = PAGE_SIZE_OPTIONS.includes(/** @type {any} */ (sizeRaw))
		? sizeRaw
		: DEFAULT_PAGE_SIZE;

	const wsFilterR = locals.workspaceId ? [eq(schema.receipt.workspaceId, locals.workspaceId)] : [];
	const wsFilterS = locals.workspaceId ? [eq(schema.sale.workspaceId,    locals.workspaceId)] : [];

	// AutoFix state for the active workspace — surfaced as a button +
	// status pill in the UI. Falls back to `idle` when there's no
	// workspace context or no stored state yet.
	let autofixState = { status: /** @type {'idle' | 'running'} */ ('idle') };
	let autofixWorkspaceId = locals.workspaceId ?? null;
	if (locals.workspaceId) {
		const [ws] = await db.select({ autofixState: schema.workspace.autofixState })
			.from(schema.workspace)
			.where(eq(schema.workspace.id, locals.workspaceId));
		if (ws?.autofixState) {
			try {
				const parsed = JSON.parse(ws.autofixState);
				if (parsed && (parsed.status === 'idle' || parsed.status === 'running')) {
					autofixState = parsed;
				}
			} catch { /* leave default */ }
		}
	}

	const receipts = await db.select()
		.from(schema.receipt)
		.where(and(eq(schema.receipt.userId, locals.user.id), ...wsFilterR))
		.orderBy(desc(schema.receipt.receiptDate));

	const sales = await db.select()
		.from(schema.sale)
		.where(and(eq(schema.sale.userId, locals.user.id), ...wsFilterS))
		.orderBy(desc(schema.sale.saleDate));

	const receiptIds = receipts.map((r) => r.id);
	const saleIds    = sales.map((s) => s.id);

	// Scoped line-item lookups — the previous query pulled every line
	// item in the table, which scales badly. `inArray([])` is a no-op
	// returned by drizzle, so the conditional guards still work.
	const rLines = receiptIds.length > 0
		? await db.select().from(schema.receiptLineItem).where(inArray(schema.receiptLineItem.receiptId, receiptIds))
		: [];
	const sLines = saleIds.length > 0
		? await db.select().from(schema.saleLineItem).where(inArray(schema.saleLineItem.saleId, saleIds))
		: [];

	/** Bucket line items by parent id once, so per-row annotation is O(1). */
	/** @type {Map<string, typeof rLines>} */
	const rLineByParent = new Map();
	for (const li of rLines) {
		const arr = rLineByParent.get(li.receiptId) ?? [];
		arr.push(li);
		rLineByParent.set(li.receiptId, arr);
	}
	/** @type {Map<string, typeof sLines>} */
	const sLineByParent = new Map();
	for (const li of sLines) {
		const arr = sLineByParent.get(li.saleId) ?? [];
		arr.push(li);
		sLineByParent.set(li.saleId, arr);
	}

	/**
	 * `categorised` now counts standard lines that have BOTH primary AND
	 * secondary — partial categorisation (only primary) still shows up in
	 * Needs Review. Tax lines are excluded from the denominator because
	 * their categorisation is locked to the upstream Xero data.
	 *
	 * @param {Array<{kind:string,primaryCategory:string|null,secondaryCategory:string|null}>} mine
	 */
	function annotate(mine) {
		const standardCount = mine.filter((l) => l.kind === 'standard').length;
		const categorised   = mine.filter((l) => l.kind === 'standard' && l.primaryCategory && l.secondaryCategory).length;
		return { lineCount: mine.length, standardCount, categorised };
	}

	const receiptRows = receipts.map((r) => {
		const stats = annotate(rLineByParent.get(r.id) ?? []);
		return {
			kind:           /** @type {const} */ ('receipt'),
			id:             r.id,
			documentTitle:  r.merchantName ?? r.invoiceNumber ?? '(no name)',
			date:           r.receiptDate,
			total:          r.total,
			currency:       r.currency,
			category:       r.category,
			externalSource: r.externalSource,
			tax:            r.tax,
			...stats,
			// "Needs Review" = header missing a category, OR any standard line
			// item missing primary or secondary. The "no line items at all"
			// branch was dropped — that's a sync/data-quality concern, not
			// a categorisation one, and it was over-flagging.
			needsAttention: !r.category || stats.categorised < stats.standardCount
		};
	});

	const saleRows = sales.map((s) => {
		const stats = annotate(sLineByParent.get(s.id) ?? []);
		return {
			kind:           /** @type {const} */ ('sale'),
			id:             s.id,
			documentTitle:  s.documentTitle ?? '(no name)',
			date:           s.saleDate,
			total:          s.totalRevenue,
			currency:       s.currency,
			category:       s.category,
			tax:            null,
			externalSource: s.externalSource,
			...stats,
			needsAttention: !s.category || stats.standardCount === 0 || stats.categorised < stats.standardCount
		};
	});

	const allRows = [...receiptRows, ...saleRows]
		.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

	// Full-set counts so the tabs reflect totals, not current-page totals.
	const counts = {
		all:       allRows.length,
		receipts:  receiptRows.length,
		sales:     saleRows.length,
		attention: allRows.filter((r) => r.needsAttention).length
	};

	// Apply filter, then paginate.
	const filtered =
		filter === 'attention' ? allRows.filter((r) => r.needsAttention) :
		filter === 'receipt'   ? receiptRows :
		filter === 'sale'      ? saleRows    :
		allRows;

	const total      = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / size));
	const clampedPage = Math.min(page, totalPages);
	const start = (clampedPage - 1) * size;
	const rows  = filtered.slice(start, start + size);

	return {
		rows,
		counts,
		filter,
		pagination: {
			page:        clampedPage,
			size,
			total,
			totalPages,
			sizeOptions: PAGE_SIZE_OPTIONS,
			start:       total === 0 ? 0 : start + 1,
			end:         start + rows.length
		},
		autofix: {
			workspaceId: autofixWorkspaceId,
			state:       autofixState
		}
	};
}
