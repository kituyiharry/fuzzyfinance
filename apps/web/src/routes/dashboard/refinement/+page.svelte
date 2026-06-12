<script>
	import Card from '$lib/components/Card.svelte';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	// ── AutoFix state (read-only) ─────────────────────────────────────
	// AutoFix runs as a Cloudflare cron every 12 hours (see
	// `lib/server/autofix-cron.js`). The UI no longer has a button to
	// trigger it — we just surface the workspace's most recent run state
	// so the user can see when categorisation last advanced and whether
	// it failed. A poll loop keeps the pill live when a cron-scheduled
	// run is currently in flight.
	/** @type {{ status: 'idle' | 'running', runId?: string, source?: string, startedAt?: string, completedAt?: string, summary?: { uniqueDescriptions?: number, linesUpdated?: number, headersUpdated?: number, skipped?: number }, error?: string, progress?: { phase: string, workspaceIndex?: number, workspaceCount?: number, uniqueDescriptions?: number, geminiPending?: number, dirtyReceipts?: number, dirtySales?: number, linesUpdated?: number, updatedAt: string } }} */
	let autofix = $state(data.autofix?.state ?? { status: 'idle' });
	let pollAbort = /** @type {AbortController | null} */ (null);

	/** Poll the GET endpoint every 10s while running. Stops on idle or unmount. */
	async function pollUntilIdle() {
		if (!data.autofix?.workspaceId) return;
		pollAbort?.abort();
		pollAbort = new AbortController();
		const signal = pollAbort.signal;
		while (autofix.status === 'running' && !signal.aborted) {
			await new Promise((r) => setTimeout(r, 10000));
			if (signal.aborted) return;
			try {
				const res = await fetch(`/api/workspaces/${data.autofix.workspaceId}/autofix`, { signal });
				if (!res.ok) break;
				autofix = await res.json();
			} catch {
				break;
			}
		}
		if (autofix.status === 'idle') await invalidateAll();
	}

	$effect(() => {
		// Kick off polling on mount if the server-loaded state is already running.
		if (autofix.status === 'running') pollUntilIdle();
		return () => pollAbort?.abort();
	});

	/** @param {string | undefined} iso */
	function fmtRelative(iso) {
		if (!iso) return '';
		const ms = Date.now() - new Date(iso).getTime();
		const s = Math.max(0, Math.round(ms / 1000));
		if (s < 60) return `${s}s ago`;
		const m = Math.round(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.round(m / 60);
		return `${h}h ago`;
	}

	const FILTERS = /** @type {const} */ ([
		{ id: 'attention', label: 'Needs Review', countKey: 'attention' },
		{ id: 'all',       label: 'All',          countKey: 'all'       },
		{ id: 'receipt',   label: 'Expenses',     countKey: 'receipts'  },
		{ id: 'sale',      label: 'Revenue',      countKey: 'sales'     }
	]);

	/** @typedef {'date' | 'kind' | 'documentTitle' | 'externalSource' | 'total' | 'tax' | 'category' | 'categorised'} SortKey */
	/** @typedef {'asc' | 'desc'} SortDir */

	/** UI-only state. Doesn't round-trip to the server — pagination owns
	 *  which rows are visible, this just reorders / narrows the current page. */
	let sortKey   = $state(/** @type {SortKey} */ ('date'));
	let sortDir   = $state(/** @type {SortDir} */ ('desc'));
	let search    = $state('');

	/** @param {SortKey} key */
	function toggleSort(key) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			// Sensible defaults: dates + amounts descend on first click,
			// text columns ascend.
			sortDir = key === 'date' || key === 'total' || key === 'tax' || key === 'categorised' ? 'desc' : 'asc';
		}
	}

	/**
	 * @param {{ date: Date | null, kind: string, documentTitle: string, externalSource: string | null, total: string | null, tax: string | null, category: string | null, categorised: number }} r
	 * @param {SortKey} key
	 */
	function sortVal(r, key) {
		switch (key) {
			case 'date':           return r.date?.getTime() ?? 0;
			case 'total':          return Number(r.total) || 0;
			case 'tax':            return Number(r.tax)   || 0;
			case 'categorised':    return r.categorised;
			case 'documentTitle':  return (r.documentTitle ?? '').toLowerCase();
			case 'externalSource': return (r.externalSource ?? '').toLowerCase();
			case 'category':       return (r.category ?? '').toLowerCase();
			case 'kind':           return r.kind;
		}
	}

	const visibleRows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		const filtered = needle === ''
			? data.rows
			: data.rows.filter((r) =>
				(r.documentTitle  ?? '').toLowerCase().includes(needle)
				|| (r.externalSource ?? '').toLowerCase().includes(needle)
				|| (r.category       ?? '').toLowerCase().includes(needle)
			);

		const dir = sortDir === 'asc' ? 1 : -1;
		return [...filtered].sort((a, b) => {
			const av = sortVal(a, sortKey);
			const bv = sortVal(b, sortKey);
			if (av < bv) return -1 * dir;
			if (av > bv) return  1 * dir;
			return 0;
		});
	});

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

	/** @param {{ kind: string, id: string }} r */
	function openRow(r) {
		goto(`/dashboard/refinement/${r.kind}/${r.id}`);
	}

	/** @param {KeyboardEvent} e @param {{ kind: string, id: string }} r */
	function onRowKey(e, r) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openRow(r);
		}
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

	/** @param {SortKey} key */
	const sortArrow = (key) => sortKey !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓';
</script>

<svelte:head><title>Refinement | FuzzyFinance</title></svelte:head>

<div class="max-w-6xl mx-auto flex flex-col gap-4">
	<Card title="Refinement Queue">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-4">
			REVIEW + CATEGORISE DOCUMENTS PULLED FROM INTEGRATIONS. AMOUNTS ARE
			LOCKED ON SYNCED ROWS — CATEGORIES AND LINE-ITEM DECOMPOSITION
			REMAIN EDITABLE. CLICK ANY ROW TO REFINE IT.
		</p>

		<!-- Filter bar -->
		<div class="flex gap-2 mb-3 flex-wrap items-center">
			{#each FILTERS as opt (opt.id)}
				{@const count = data.counts[opt.countKey]}
				<button
					onclick={() => setFilter(opt.id)}
					class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{data.filter === opt.id ? 'border-(--color-fg) bg-(--color-fg) text-(--color-bg)' : 'border-(--color-border) text-(--color-muted-foreground) hover:border-(--color-fg)'}"
				>{opt.label} ({count})</button>
			{/each}
		</div>

		<!-- AutoFix status pill (auto-runs every 12h via cron — read-only here) -->
		{#if autofix.status === 'running'}
			<div class="font-mono text-[10px] text-(--color-muted-foreground) uppercase tracking-widest mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
				<span>AutoFix running ({autofix.source ?? 'manual'}) — for {fmtRelative(autofix.startedAt)}.</span>
				{#if autofix.progress}
					<span class="text-(--color-fg)">Phase: <strong>{autofix.progress.phase}</strong></span>
					{#if autofix.progress.uniqueDescriptions != null}
						<span>{autofix.progress.uniqueDescriptions} unique desc</span>
					{/if}
					{#if autofix.progress.geminiPending != null}
						<span>{autofix.progress.geminiPending} via Gemini</span>
					{/if}
					{#if autofix.progress.linesUpdated != null}
						<span>{autofix.progress.linesUpdated} lines updated</span>
					{/if}
				{/if}
				{#if autofix.runId}
					<span class="text-(--color-muted-foreground) ml-auto">runId: <code>{autofix.runId.slice(0, 8)}</code></span>
				{/if}
			</div>
		{:else if autofix.error}
			<div class="font-mono text-[10px] text-(--color-danger) uppercase tracking-widest mb-3 flex flex-wrap items-center gap-x-2">
				<span>Last AutoFix failed: {autofix.error}</span>
				{#if autofix.runId}
					<span class="ml-auto">runId: <code>{autofix.runId.slice(0, 8)}</code></span>
				{/if}
			</div>
		{:else if autofix.summary && autofix.completedAt}
			<div class="font-mono text-[10px] text-(--color-muted-foreground) uppercase tracking-widest mb-3 flex flex-wrap items-center gap-x-2">
				<span>Last AutoFix ({autofix.source ?? 'manual'}): {fmtRelative(autofix.completedAt)} — {autofix.summary?.linesUpdated ?? 0} line(s) updated from {autofix.summary?.uniqueDescriptions ?? 0} unique description(s), {autofix.summary?.headersUpdated ?? 0} header(s) derived. Next cron run: every 12h.</span>
				{#if autofix.runId}
					<span class="ml-auto">runId: <code>{autofix.runId.slice(0, 8)}</code></span>
				{/if}
			</div>
		{:else}
			<div class="font-mono text-[10px] text-(--color-muted-foreground) uppercase tracking-widest mb-3">
				AutoFix runs automatically every 12 hours via the Cloudflare cron.
			</div>
		{/if}

		<!-- Search box (UI-only, scopes the current page) -->
		<div class="flex items-center gap-3 mb-4 flex-wrap">
			<div class="flex-1 min-w-[200px]">
				<input
					type="search"
					bind:value={search}
					placeholder="Search document, source, or category..."
					class="w-full font-mono text-[10px] px-3 py-2 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) focus:outline-none focus:border-(--color-fg)"
				/>
			</div>
			{#if search.trim() !== '' || sortKey !== 'date' || sortDir !== 'desc'}
				<button
					onclick={() => { search = ''; sortKey = 'date'; sortDir = 'desc'; }}
					class="px-3 py-2 border-2 border-(--color-border) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-muted-foreground) hover:border-(--color-fg) hover:text-(--color-fg)"
				>Reset</button>
			{/if}
			<span class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground)">
				{visibleRows.length} of {data.rows.length} on page
			</span>
		</div>

		{#if data.rows.length === 0}
			<p class="font-mono text-[11px] text-(--color-muted-foreground) text-center py-12">
				Nothing to refine in this filter. Run a sync from
				<a href="/dashboard/integrations" class="underline">Integrations</a>
				to pull in documents.
			</p>
		{:else if visibleRows.length === 0}
			<p class="font-mono text-[11px] text-(--color-muted-foreground) text-center py-12">
				No rows on this page match the search. Clear the box or open another page.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full font-mono text-[10px]">
					<thead class="border-b-2 border-(--color-border) text-(--color-muted-foreground) uppercase tracking-widest select-none">
						<tr>
							<th class="text-left py-2 pr-3">
								<button onclick={() => toggleSort('kind')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Type{sortArrow('kind')}</button>
							</th>
							<th class="text-left py-2 pr-1">
								<button onclick={() => toggleSort('date')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Date{sortArrow('date')}</button>
							</th>
							<th class="text-left py-2 pr-3">
								<button onclick={() => toggleSort('documentTitle')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Document{sortArrow('documentTitle')}</button>
							</th>
							<th class="text-left py-2 pr-3">
								<button onclick={() => toggleSort('externalSource')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Source{sortArrow('externalSource')}</button>
							</th>
							<th class="text-right py-2 pr-3">
								<button onclick={() => toggleSort('total')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Total{sortArrow('total')}</button>
							</th>
							<th class="text-right py-2 pr-3">
								<button onclick={() => toggleSort('tax')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Tax{sortArrow('tax')}</button>
							</th>
							<!--<th class="text-left py-2 pr-3">-->
								<!--<button onclick={() => toggleSort('category')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Category{sortArrow('category')}</button>-->
							<!--</th>-->
							<th class="text-left py-2 pr-2">
								<button onclick={() => toggleSort('categorised')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Lines{sortArrow('categorised')}</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleRows as r (r.kind + r.id)}
							<tr
								role="button"
								tabindex="0"
								aria-label="Refine {r.kind} {r.documentTitle}"
								onclick={() => openRow(r)}
								onkeydown={(e) => onRowKey(e, r)}
								class="border-b border-(--color-border) hover:bg-(--color-muted) focus:bg-(--color-muted) focus:outline-2 focus:outline-(--color-fg) transition-colors cursor-pointer"
							>
								<td class="py-2 pr-3 uppercase font-black">{r.kind}</td>
								<td class="py-2 pr-1 text-(--color-muted-foreground)">{fmtDate(r.date)}</td>
								<td class="py-2 pr-3 text-(--color-fg) truncate max-w-xs">{r.documentTitle}</td>
								<td class="py-2 pr-3 text-(--color-muted-foreground)">{sourceBadge(r.externalSource)}</td>
								<td class="py-2 pr-3 text-right font-bold">{r.total ?? '—'} {r.currency ?? ''}</td>
								<td class="py-2 pr-3 text-right font-bold">{r.tax ?? '—'} {r.currency ?? ''}</td>
								<!--<td class="py-2 pr-3">-->
									<!--{#if r.category}-->
										<!--<span>{r.category}</span>-->
									<!--{:else}-->
										<!--<span class="text-(--color-warning) uppercase">none</span>-->
									<!--{/if}-->
								<!--</td>-->
								<td class="py-2 pr-2 text-(--color-muted-foreground)">
									{r.categorised}/{r.standardCount}
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
