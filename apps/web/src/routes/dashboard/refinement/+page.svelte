<script>
	import Card from '$lib/components/Card.svelte';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	$effect(() => {
		// Navigating away cancels any in-flight page-autofill loop.
		return () => pageAutofillAbort?.abort();
	});

	// ── Quick delta sync ──────────────────────────────────────────────────
	// Mirrors the "SYNC NOW" button on the Integrations card. Calls the
	// existing Xero sync endpoint with the default `auto` mode, which uses
	// `If-Modified-Since` against the workspace's `lastSyncedAt` watermark
	// so only invoices touched since the last run come down. Surfaced here
	// so the user can pull a delta without leaving the refinement queue.
	let syncing = $state(false);
	/** @type {string | null} */
	let syncMessage = $state(null);
	async function deltaSync() {
		if (syncing) return;
		syncing = true;
		syncMessage = null;
		try {
			const res = await fetch('/api/integrations/xero/sync?mode=auto', { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				syncMessage = body?.message ?? `Sync failed (${res.status})`;
				return;
			}
			const s = body?.summary;
			syncMessage = s
				? `Synced ${s.invoicesCreated ?? 0} new + ${s.invoicesUpdated ?? 0} updated across ${s.tenants ?? 0} tenant(s).`
				: 'Sync complete.';
			await invalidateAll();
		} catch (/** @type {any} */ err) {
			syncMessage = String(err?.message ?? err);
		} finally {
			syncing = false;
		}
	}

	// ── Page-based autofill loop ──────────────────────────────────────────
	// Runs the same waterfall the editor's Autofill button uses, but driven
	// from outside per row. Visible on the Needs Review tab only. Iterates
	// the currently-visible rows that need attention, throttled with a
	// PAGE_AUTOFILL_DELAY_MS gap between rows so we don't spam the suggest
	// endpoint, and bails on navigation (the $effect above aborts the
	// AbortController on unmount).
	const PAGE_AUTOFILL_DELAY_MS = 700;

	/** @typedef {{ id: string, error: string }} PageAutofillFailure */
	let pageAutofill = $state({
		active:        false,
		current:       0,
		total:         0,
		successCount:  0,
		skipCount:     0,
		failureCount:  0,
		currentTitle:  '',
		/** @type {PageAutofillFailure[]} */
		failures:      []
	});
	let pageAutofillAbort = /** @type {AbortController | null} */ (null);

	async function startPageAutofill() {
		if (pageAutofill.active) return;
		if (!data.autofix?.workspaceId) {
			pageAutofill = { ...pageAutofill, failures: [{ id: '', error: 'No workspace context.' }] };
			return;
		}
		const targets = pageAutofillCandidates.slice();
		if (targets.length === 0) return;

		pageAutofillAbort?.abort();
		pageAutofillAbort = new AbortController();
		const signal = pageAutofillAbort.signal;
		pageAutofill = {
			active:        true,
			current:       0,
			total:         targets.length,
			successCount:  0,
			skipCount:     0,
			failureCount:  0,
			currentTitle:  '',
			failures:      []
		};

		try {
			for (let i = 0; i < targets.length; i++) {
				if (signal.aborted) break;
				const row = targets[i];
				pageAutofill.current = i + 1;
				pageAutofill.currentTitle = row.documentTitle;

				try {
					const outcome = await autofillOneRow(row, signal);
					if (outcome === 'noop') pageAutofill.skipCount++;
					else                    pageAutofill.successCount++;
				} catch (/** @type {any} */ err) {
					if (signal.aborted) break;
					pageAutofill.failureCount++;
					pageAutofill.failures = [...pageAutofill.failures, { id: row.id, error: String(err?.message ?? err) }];
				}

				if (i < targets.length - 1 && !signal.aborted) {
					await new Promise((r) => setTimeout(r, PAGE_AUTOFILL_DELAY_MS));
				}
			}
		} finally {
			pageAutofill.active = false;
			if (!signal.aborted) await invalidateAll();
		}
	}

	function stopPageAutofill() {
		pageAutofillAbort?.abort();
	}

	/**
	 * Pulls the row's line items, asks the suggest endpoint, applies
	 * returned (primary, secondary) tuples, derives the header category
	 * from the mode of primaries if blank, then PATCHes + PUTs.
	 *
	 * Returns `'noop'` when there's nothing to fill (already complete).
	 *
	 * @param {{ kind: 'receipt' | 'sale', id: string, documentTitle: string }} row
	 * @param {AbortSignal} signal
	 * @returns {Promise<'updated' | 'noop'>}
	 */
	async function autofillOneRow(row, signal) {
		const workspaceId = data.autofix?.workspaceId;
		if (!workspaceId) throw new Error('No workspace context');
		const kindPath = row.kind === 'receipt' ? 'receipts' : 'sales';

		// 1. Fetch row + line items.
		const getRes = await fetch(`/api/${kindPath}/${row.id}`, { signal });
		if (!getRes.ok) throw new Error(`Load failed (${getRes.status})`);
		const doc = await getRes.json();
		/** @type {Array<{ id: string, description: string|null, qty?: string|null, unitPrice?: string|null, unitsSold?: string|null, sellPrice?: string|null, total: string|null, primaryCategory: string|null, secondaryCategory: string|null, kind: 'standard'|'tax', aiSuggested?: boolean }>} */
		const lineItems = Array.isArray(doc.lineItems) ? doc.lineItems : [];

		const targets = lineItems
			.filter((li) => li.kind === 'standard' && (!li.primaryCategory || !li.secondaryCategory));

		// Already complete — both lines and header settled.
		if (targets.length === 0 && doc.category) return 'noop';

		// 2. Ask the suggest endpoint (only if there are uncategorised lines).
		/** @type {Array<{ primary: string, secondary: string } | null>} */
		let suggestions = [];
		if (targets.length > 0) {
			const merchant = row.kind === 'receipt' ? doc.merchantName : doc.documentTitle;
			const suggestRes = await fetch(`/api/workspaces/${workspaceId}/embeddings/suggest`, {
				method:  'POST',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ merchant, lines: targets.map((t) => ({ description: t.description })) }),
				signal
			});
			if (!suggestRes.ok) throw new Error(`Suggest failed (${suggestRes.status})`);
			const body = await suggestRes.json();
			suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];
		}

		// 3. Apply suggestions.
		// Same overwrite rule as the editor's Autofill button:
		//   - primary missing  → take the whole tuple, overwriting any
		//     orphaned secondary (it lacked a primary, so it's suspect).
		//   - primary set      → only fill in missing secondary; never
		//     stomp on the user-set primary.
		// Unit info fills only when the row's existing unit fields are
		// empty — manual measurements are never overwritten.
		const updatedLines = lineItems.map((li) => ({ ...li }));
		let lineFills = 0;
		for (let i = 0; i < targets.length; i++) {
			const s = /** @type {{ primary: string, secondary: string, unitSize?: string, unitType?: string } | null} */ (suggestions[i]);
			if (!s) continue;
			const idx = updatedLines.findIndex((li) => li.id === targets[i].id);
			if (idx === -1) continue;
			if (!updatedLines[idx].primaryCategory) {
				updatedLines[idx].primaryCategory   = s.primary;
				updatedLines[idx].secondaryCategory = s.secondary;
			} else if (!updatedLines[idx].secondaryCategory) {
				updatedLines[idx].secondaryCategory = s.secondary;
			}
			if (s.unitSize && s.unitType) {
				/** @type {Record<string, unknown>} */
				const row = updatedLines[idx];
				if (!row.unitSize) row.unitSize = s.unitSize;
				if (!row.unitType) row.unitType = s.unitType;
			}
			updatedLines[idx].aiSuggested = true;
			lineFills++;
		}

		// 4. Derive header category if blank.
		const derivedHeader = doc.category ? null : _modePrimaryFromArray(updatedLines);

		// 5. Nothing actually changed — nothing to write.
		if (lineFills === 0 && !derivedHeader) return 'noop';

		// 6. PATCH header if we got a new value for it.
		if (derivedHeader) {
			const patchRes = await fetch(`/api/${kindPath}/${row.id}`, {
				method:  'PATCH',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ category: derivedHeader }),
				signal
			});
			if (!patchRes.ok) throw new Error(`Header save failed (${patchRes.status})`);
		}

		// 7. PUT line items if any were filled.
		if (lineFills > 0) {
			const payload = row.kind === 'receipt'
				? updatedLines.map((li) => ({
					id: li.id, description: li.description, qty: li.qty, unitPrice: li.unitPrice,
					total: li.total, primaryCategory: li.primaryCategory, secondaryCategory: li.secondaryCategory,
					kind: li.kind, aiSuggested: li.aiSuggested,
					unitSize: /** @type {any} */ (li).unitSize ?? null, unitType: /** @type {any} */ (li).unitType ?? null
				}))
				: updatedLines.map((li) => ({
					id: li.id, description: li.description, unitsSold: li.unitsSold, sellPrice: li.sellPrice,
					total: li.total, primaryCategory: li.primaryCategory, secondaryCategory: li.secondaryCategory,
					kind: li.kind, aiSuggested: li.aiSuggested,
					unitSize: /** @type {any} */ (li).unitSize ?? null, unitType: /** @type {any} */ (li).unitType ?? null
				}));
			const putRes = await fetch(`/api/${kindPath}/${row.id}/line-items`, {
				method:  'PUT',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ lineItems: payload }),
				signal
			});
			if (!putRes.ok) {
				const body = await putRes.json().catch(() => null);
				throw new Error(body?.message ?? `Line save failed (${putRes.status})`);
			}
		}

		return 'updated';
	}

	/** @param {Array<{ kind: 'standard'|'tax', primaryCategory: string|null }>} ls */
	function _modePrimaryFromArray(ls) {
		/** @type {Map<string, number>} */
		const counts = new Map();
		for (const li of ls) {
			if (li.kind !== 'standard') continue;
			const p = li.primaryCategory;
			if (!p) continue;
			counts.set(p, (counts.get(p) ?? 0) + 1);
		}
		if (counts.size === 0) return null;
		let winner = '';
		let best = 0;
		for (const [p, n] of counts) if (n > best) { best = n; winner = p; }
		return winner || null;
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

	// Derived after `visibleRows` so the use-before-declaration order is right.
	const pageAutofillCandidates = $derived(visibleRows.filter((r) => r.needsAttention));

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
				{@const active = data.filter === opt.id}
				<button
					onclick={() => setFilter(opt.id)}
					aria-pressed={active}
					class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-all
						{active
							? 'border-(--color-fg) bg-(--color-fg) text-(--color-bg) shadow-[2px_2px_0_0_var(--color-fg)] translate-x-[-1px] translate-y-[-1px]'
							: 'border-(--color-border) text-(--color-muted-foreground) hover:border-(--color-fg) hover:text-(--color-fg)'}"
				>{#if active}● {/if}{opt.label} ({count})</button>
			{/each}

			<div class="ml-auto flex items-center gap-2 flex-wrap">
				<button
					onclick={deltaSync}
					disabled={syncing}
					title="Pulls invoices changed since the last sync (uses Xero's If-Modified-Since header)"
					class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{syncing
							? 'border-(--color-border) text-(--color-muted-foreground) cursor-wait'
							: 'border-(--color-fg) text-(--color-fg) hover:bg-(--color-fg) hover:text-(--color-bg)'}"
				>{syncing ? 'SYNCING…' : '↻ SYNC DELTA'}</button>

				{#if data.filter === 'attention'}
					{#if pageAutofill.active}
						<button
							onclick={stopPageAutofill}
							class="px-3 py-1.5 border-2 border-(--color-danger) font-mono text-[10px] font-black uppercase tracking-widest text-(--color-danger) hover:bg-(--color-danger) hover:text-(--color-bg) transition-colors"
						>STOP</button>
					{:else}
						<button
							onclick={startPageAutofill}
							disabled={pageAutofillCandidates.length === 0 || !data.autofix?.workspaceId}
							class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
								{pageAutofillCandidates.length === 0
									? 'border-(--color-border) text-(--color-muted-foreground) cursor-not-allowed'
									: 'border-(--color-fg) bg-(--color-fg) text-(--color-bg) hover:bg-(--color-bg) hover:text-(--color-fg)'}"
						>✨ AUTOFILL PAGE ({pageAutofillCandidates.length})</button>
					{/if}
				{/if}
			</div>
		</div>

		{#if syncMessage}
			<div class="font-mono text-[10px] uppercase tracking-widest mb-3 text-(--color-muted-foreground)">
				{syncMessage}
			</div>
		{/if}

		<!-- Page-autofill progress -->
		{#if pageAutofill.active || pageAutofill.failures.length > 0 || pageAutofill.successCount > 0}
			{@const pct = pageAutofill.total === 0 ? 0 : Math.min(100, Math.round((pageAutofill.current / pageAutofill.total) * 100))}
			<div class="mb-3 flex flex-col gap-1.5">
				<!-- Bar -->
				<div class="h-1.5 w-full border border-(--color-border) bg-(--color-bg) overflow-hidden">
					<div
						class="h-full transition-[width] duration-300
							{pageAutofill.failureCount > 0 && !pageAutofill.active ? 'bg-(--color-warning)' : 'bg-(--color-fg)'}"
						style="width: {pct}%"
					></div>
				</div>

				<!-- Status text -->
				<div class="font-mono text-[10px] uppercase tracking-widest flex flex-wrap items-center gap-x-2 gap-y-1
					{pageAutofill.failures.length > 0 ? 'text-(--color-warning)' : 'text-(--color-muted-foreground)'}">
					{#if pageAutofill.active}
						<span class="text-(--color-fg) font-black">{pct}%</span>
						<span>row {pageAutofill.current}/{pageAutofill.total}</span>
						{#if pageAutofill.currentTitle}<span class="truncate max-w-xs">· {pageAutofill.currentTitle}</span>{/if}
						<span>· {pageAutofill.successCount} updated, {pageAutofill.skipCount} skipped, {pageAutofill.failureCount} failed</span>
					{:else}
						<span class="text-(--color-fg) font-black">Done.</span>
						<span>{pageAutofill.successCount} updated · {pageAutofill.skipCount} skipped · {pageAutofill.failureCount} failed</span>
					{/if}
					{#if pageAutofill.failures.length > 0}
						<details class="ml-auto">
							<summary class="cursor-pointer text-(--color-warning)">{pageAutofill.failures.length} error(s)</summary>
							<ul class="text-(--color-warning) mt-2 ml-4 list-disc">
								{#each pageAutofill.failures.slice(0, 10) as f, i (i)}
									<li><code>{f.id.slice(0, 8)}</code>: {f.error}</li>
								{/each}
								{#if pageAutofill.failures.length > 10}
									<li class="text-(--color-muted-foreground)">… +{pageAutofill.failures.length - 10} more</li>
								{/if}
							</ul>
						</details>
					{/if}
				</div>
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
								<button onclick={() => toggleSort('kind')} aria-pressed={sortKey === 'kind'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'kind' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Type{sortArrow('kind')}</button>
							</th>
							<th class="text-left py-2 pr-1">
								<button onclick={() => toggleSort('date')} aria-pressed={sortKey === 'date'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'date' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Date{sortArrow('date')}</button>
							</th>
							<th class="text-left py-2 pr-3">
								<button onclick={() => toggleSort('documentTitle')} aria-pressed={sortKey === 'documentTitle'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'documentTitle' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Document{sortArrow('documentTitle')}</button>
							</th>
							<th class="text-left py-2 pr-3">
								<button onclick={() => toggleSort('externalSource')} aria-pressed={sortKey === 'externalSource'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'externalSource' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Source{sortArrow('externalSource')}</button>
							</th>
							<th class="text-right py-2 pr-3">
								<button onclick={() => toggleSort('total')} aria-pressed={sortKey === 'total'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'total' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Total{sortArrow('total')}</button>
							</th>
							<th class="text-right py-2 pr-3">
								<button onclick={() => toggleSort('tax')} aria-pressed={sortKey === 'tax'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'tax' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Tax{sortArrow('tax')}</button>
							</th>
							<!--<th class="text-left py-2 pr-3">-->
								<!--<button onclick={() => toggleSort('category')} class="font-black uppercase tracking-widest hover:text-(--color-fg)">Category{sortArrow('category')}</button>-->
							<!--</th>-->
							<th class="text-left py-2 pr-2">
								<button onclick={() => toggleSort('categorised')} aria-pressed={sortKey === 'categorised'} class="font-black uppercase tracking-widest transition-colors {sortKey === 'categorised' ? 'text-(--color-fg) underline underline-offset-[3px] decoration-2' : 'hover:text-(--color-fg)'}">Lines{sortArrow('categorised')}</button>
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
