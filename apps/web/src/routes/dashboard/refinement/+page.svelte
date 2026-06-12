<script>
	import Card from '$lib/components/Card.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	const FILTERS = /** @type {const} */ ([
		{ id: 'attention', label: 'Needs Review', countKey: 'attention' },
		{ id: 'all',       label: 'All',          countKey: 'all'       },
		{ id: 'receipt',   label: 'Expenses',     countKey: 'receipts'  },
		{ id: 'sale',      label: 'Revenue',      countKey: 'sales'     }
	]);

	/** Build a URL preserving the other current query params. */
	/** @param {Partial<{ filter: string, page: number, size: number }>} patch */
	function buildUrl(patch) {
		const sp = new URLSearchParams(page.url.searchParams);
		if (patch.filter !== undefined) sp.set('filter', patch.filter);
		if (patch.page   !== undefined) sp.set('page',   String(patch.page));
		if (patch.size   !== undefined) sp.set('size',   String(patch.size));
		return `${page.url.pathname}?${sp.toString()}`;
	}

	/** @param {string} filter */
	function setFilter(filter) {
		goto(buildUrl({ filter, page: 1 }), { keepFocus: true, noScroll: true });
	}

	/** @param {number} target */
	function gotoPage(target) {
		goto(buildUrl({ page: target }), { keepFocus: true, noScroll: false });
	}

	/** @param {Event & { currentTarget: HTMLSelectElement }} e */
	function setSize(e) {
		goto(buildUrl({ size: Number(e.currentTarget.value), page: 1 }), { keepFocus: true, noScroll: true });
	}

	/** @param {Date | null} d */
	const fmtDate = (d) => d ? new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)) : '—';

	/** @param {string | null | undefined} src */
	const sourceBadge = (src) => {
		if (!src) return 'Manual';
		if (src.startsWith('xero-'))  return 'Xero';
		if (src.startsWith('qb-'))    return 'QuickBooks';
		if (src.startsWith('myob-'))  return 'MYOB';
		return src;
	};
</script>

<svelte:head><title>Refinement | FuzzyFinance</title></svelte:head>

<div class="max-w-6xl mx-auto flex flex-col gap-4">
	<Card title="Refinement Queue">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-4">
			REVIEW + CATEGORISE DOCUMENTS PULLED FROM INTEGRATIONS. AMOUNTS ARE
			LOCKED ON SYNCED ROWS — CATEGORIES AND LINE-ITEM DECOMPOSITION
			REMAIN EDITABLE.
		</p>

		<!-- Filter bar -->
		<div class="flex gap-2 mb-4 flex-wrap">
			{#each FILTERS as opt (opt.id)}
				{@const count = data.counts[opt.countKey]}
				<button
					onclick={() => setFilter(opt.id)}
					class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{data.filter === opt.id ? 'border-(--color-fg) bg-(--color-fg) text-(--color-bg)' : 'border-(--color-border) text-(--color-muted-foreground) hover:border-(--color-fg)'}"
				>{opt.label} ({count})</button>
			{/each}
		</div>

		{#if data.rows.length === 0}
			<p class="font-mono text-[11px] text-(--color-muted-foreground) text-center py-12">
				Nothing to refine in this filter. Run a sync from
				<a href="/dashboard/integrations" class="underline">Integrations</a>
				to pull in documents.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full font-mono text-[10px]">
					<thead class="border-b-2 border-(--color-border) text-(--color-muted-foreground) uppercase tracking-widest">
						<tr>
							<th class="text-left py-2 pr-3">Type</th>
							<th class="text-left py-2 pr-3">Date</th>
							<th class="text-left py-2 pr-3">Document</th>
							<th class="text-left py-2 pr-3">Source</th>
							<th class="text-right py-2 pr-3">Total</th>
							<th class="text-right py-2 pr-3">Tax</th>
							<th class="text-left py-2 pr-3">Category</th>
							<th class="text-left py-2 pr-3">Lines</th>
							<th class="text-left py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as r (r.kind + r.id)}
							<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-colors">
								<td class="py-2 pr-3 uppercase font-black">{r.kind}</td>
								<td class="py-2 pr-3 text-(--color-muted-foreground)">{fmtDate(r.date)}</td>
								<td class="py-2 pr-3 text-(--color-fg) truncate max-w-xs">{r.documentTitle}</td>
								<td class="py-2 pr-3 text-(--color-muted-foreground)">{sourceBadge(r.externalSource)}</td>
								<td class="py-2 pr-3 text-right font-bold">{r.total ?? '—'} {r.currency ?? ''}</td>
								<td class="py-2 pr-3 text-right font-bold">{r.tax ?? '—'} {r.currency ?? ''}</td>
								<td class="py-2 pr-3">
									{#if r.category}
										<span>{r.category}</span>
									{:else}
										<span class="text-(--color-warning) uppercase">none</span>
									{/if}
								</td>
								<td class="py-2 pr-3 text-(--color-muted-foreground)">
									{r.categorised}/{r.standardCount}
								</td>
								<td class="py-2">
									<a href="/dashboard/refinement/{r.kind}/{r.id}" class="font-black uppercase tracking-widest text-(--color-fg) hover:underline">EDIT →</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			<div class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t-2 border-(--color-border)">
				<div class="font-mono text-[10px] text-(--color-muted-foreground) uppercase tracking-widest">
					{data.pagination.start}–{data.pagination.end} of {data.pagination.total}
				</div>

				<div class="flex items-center gap-2 flex-wrap">
					<label class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground)">
						Rows
						<select
							value={data.pagination.size}
							onchange={setSize}
							class="ml-2 font-mono text-[10px] px-2 py-1 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg)"
						>
							{#each data.pagination.sizeOptions as opt (opt)}
								<option value={opt}>{opt}</option>
							{/each}
						</select>
					</label>

					<button
						onclick={() => gotoPage(1)}
						disabled={data.pagination.page <= 1}
						class="px-2 py-1 border-2 border-(--color-border) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) disabled:opacity-40 hover:border-(--color-fg)"
					>« First</button>
					<button
						onclick={() => gotoPage(data.pagination.page - 1)}
						disabled={data.pagination.page <= 1}
						class="px-2 py-1 border-2 border-(--color-border) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) disabled:opacity-40 hover:border-(--color-fg)"
					>‹ Prev</button>

					<span class="font-mono text-[10px] uppercase tracking-widest text-(--color-fg) px-2">
						{data.pagination.page} / {data.pagination.totalPages}
					</span>

					<button
						onclick={() => gotoPage(data.pagination.page + 1)}
						disabled={data.pagination.page >= data.pagination.totalPages}
						class="px-2 py-1 border-2 border-(--color-border) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) disabled:opacity-40 hover:border-(--color-fg)"
					>Next ›</button>
					<button
						onclick={() => gotoPage(data.pagination.totalPages)}
						disabled={data.pagination.page >= data.pagination.totalPages}
						class="px-2 py-1 border-2 border-(--color-border) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) disabled:opacity-40 hover:border-(--color-fg)"
					>Last »</button>
				</div>
			</div>
		{/if}
	</Card>
</div>
