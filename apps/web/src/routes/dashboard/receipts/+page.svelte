<script>
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import Card from '$lib/components/Card.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	// ── Search & filter state ────────────────────────────────────────────────
	let searchQuery = $state('');

	const activeFilterCount = $derived(
		[data.filters.status, data.filters.category, data.filters.tag,
		 data.filters.dateFrom, data.filters.dateTo, data.filters.q].filter(Boolean).length
	);

	// ── Selection mode ────────────────────────────────────────────────────────
	let selecting = $state(false);
	let selectedIds = new SvelteSet();
	let exporting = $state(false);
	/** @type {{ id: string; fileName: string; receiptCount: number; rowCount: number } | null} */
	let exportResult = $state(null);

	function toggleSelectMode() {
		selecting = !selecting;
		if (!selecting) {
			selectedIds.clear();
			exportResult = null;
		}
	}

	/** @param {string} id */
	function toggleSelect(id) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}

	function selectAll() {
		for (const r of data.receipts) selectedIds.add(r.id);
	}

	function deselectAll() {
		selectedIds.clear();
	}

	async function doExport() {
		if (selectedIds.size === 0) return;
		exporting = true;
		exportResult = null;
		try {
			const res = await fetch('/api/exports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ receiptIds: [...selectedIds] })
			});
			if (!res.ok) {
				const msg = await res.text();
				alert(`Export failed: ${msg}`);
				return;
			}
			exportResult = await res.json();
		} finally {
			exporting = false;
		}
	}

	/**
	 * @param {Record<string, string>} overrides
	 * @returns {string}
	 */
	function buildParams(overrides = {}) {
		/** @type {Record<string, string>} */
		const base = {};
		if (data.filters.q)        base.q        = data.filters.q;
		if (data.filters.status)   base.status   = data.filters.status;
		if (data.filters.category) base.category = data.filters.category;
		if (data.filters.tag)      base.tag      = data.filters.tag;
		if (data.filters.sort && data.filters.sort !== 'uploaded_desc') base.sort = data.filters.sort;
		if (data.filters.dateFrom) base.dateFrom = data.filters.dateFrom;
		if (data.filters.dateTo)   base.dateTo   = data.filters.dateTo;
		const merged = { ...base, ...overrides };
		Object.keys(merged).forEach(k => { if (!merged[k]) delete merged[k]; });
		return new URLSearchParams(merged).toString();
	}

	/** @param {number} p */
	function pageUrl(p) {
		return `?${buildParams({ page: String(p) })}`;
	}

	function runSearch() {
		const q = searchQuery.trim();
		goto(`?${buildParams(q ? { q, page: '1' } : { q: '', page: '1' })}`);
	}

	/** @param {Event & { currentTarget: HTMLSelectElement }} e */
	function onFilterChange(e) {
		const field = e.currentTarget.name;
		const value = e.currentTarget.value;
		goto(`?${buildParams({ [field]: value, page: '1' })}`);
	}

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	function onDateChange(e) {
		const field = e.currentTarget.name;
		const value = e.currentTarget.value;
		goto(`?${buildParams({ [field]: value, page: '1' })}`);
	}

	function clearAll() {
		searchQuery = '';
		goto('?');
	}

	const totalPages = $derived(Math.ceil(data.total / data.pageSize));
	const hasPrev    = $derived(data.page > 1);
	const hasNext    = $derived(data.page < totalPages);
</script>

<svelte:head>
	<title>Receipts | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
	<!-- Top bar -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex-1 flex gap-2">
			<input
				type="text"
				placeholder="SEARCH RECEIPTS..."
				bind:value={searchQuery}
				onkeydown={(e) => e.key === 'Enter' && runSearch()}
				class="flex-1 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-3 py-2 uppercase tracking-widest placeholder:text-(--color-muted-foreground) focus:outline-none focus:border-(--color-fg)"
			/>
			<button
				onclick={runSearch}
				class="border-2 border-(--color-border) px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) hover:border-(--color-fg) transition-colors"
			>
				{data.filters.q ? 'CLEAR' : 'SEARCH'}
			</button>
		</div>
		<div class="flex gap-2">
			<button
				onclick={toggleSelectMode}
				class="border-2 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors {selecting ? 'border-(--color-fg) bg-(--color-fg) text-(--color-bg)' : 'border-(--color-border) text-(--color-fg) hover:border-(--color-fg)'}"
			>
				{selecting ? 'CANCEL SELECT' : 'SELECT'}
			</button>
			{#if !selecting}
				<a
					href="/dashboard/receipts/upload"
					class="btn-primary text-xs font-black uppercase tracking-widest no-underline px-4 py-2 inline-flex items-center"
				>
					+ UPLOAD RECEIPT
				</a>
			{/if}
		</div>
	</div>

	<!-- Selection toolbar (shown when in selection mode) -->
	{#if selecting}
		<div class="flex items-center justify-between gap-4 border-2 border-(--color-fg) p-3 bg-(--color-bg)">
			<div class="flex items-center gap-3">
				<span class="font-mono text-[10px] font-black uppercase text-(--color-fg)">
					{selectedIds.size} SELECTED
				</span>
				<button onclick={selectAll} class="font-mono text-[9px] uppercase text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors">
					SELECT PAGE
				</button>
				{#if selectedIds.size > 0}
					<button onclick={deselectAll} class="font-mono text-[9px] uppercase text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors">
						DESELECT ALL
					</button>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				{#if exportResult}
					<a
						href="/api/exports/{exportResult.id}/download"
						download={exportResult.fileName}
						class="font-mono text-[9px] uppercase font-black tracking-widest text-green-600 border border-green-600 px-3 py-1 hover:bg-green-600 hover:text-white transition-colors no-underline"
					>
						DOWNLOAD ({exportResult.rowCount} ROWS) ↓
					</a>
					<a href="/dashboard/exports" class="font-mono text-[9px] uppercase text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors no-underline">
						VIEW ALL EXPORTS →
					</a>
				{:else}
					<button
						onclick={doExport}
						disabled={selectedIds.size === 0 || exporting}
						class="border-2 border-(--color-fg) px-4 py-1.5 font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors disabled:opacity-40 disabled:pointer-events-none"
					>
						{exporting ? 'EXPORTING...' : `EXPORT ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Filter bar -->
	<div class="flex flex-wrap items-end gap-2 border-2 border-(--color-border) bg-(--color-bg) p-3">
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold self-center mr-1">
			FILTERS {#if activeFilterCount > 0}<span class="text-(--color-fg)">({activeFilterCount})</span>{/if}
		</span>

		<select name="status" value={data.filters.status} onchange={onFilterChange}
			class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg)">
			<option value="">ALL STATUSES</option>
			{#each ['pending','processing','staged','complete','complete_no_sync','failed'] as s (s)}
				<option value={s}>{s.toUpperCase().replace(/_/g, ' ')}</option>
			{/each}
		</select>

		{#if data.categories.length > 0}
			<select name="category" value={data.filters.category} onchange={onFilterChange}
				class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg)">
				<option value="">ALL CATEGORIES</option>
				{#each data.categories as cat (cat)}
					<option value={cat}>{cat}</option>
				{/each}
			</select>
		{/if}

		{#if data.allTags.length > 0}
			<select name="tag" value={data.filters.tag} onchange={onFilterChange}
				class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg)">
				<option value="">ALL TAGS</option>
				{#each data.allTags as t (t)}
					<option value={t}>{t}</option>
				{/each}
			</select>
		{/if}

		<div class="flex items-center gap-1">
			<input type="date" name="dateFrom" value={data.filters.dateFrom} onchange={onDateChange}
				class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg)" />
			<span class="font-mono text-[9px] text-(--color-muted-foreground)">–</span>
			<input type="date" name="dateTo" value={data.filters.dateTo} onchange={onDateChange}
				class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg)" />
		</div>

		<select name="sort" value={data.filters.sort || 'uploaded_desc'} onchange={onFilterChange}
			class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-(--color-fg) ml-auto">
			<option value="uploaded_desc">UPLOADED: NEWEST</option>
			<option value="uploaded_asc">UPLOADED: OLDEST</option>
			<option value="date_desc">DATE: NEWEST</option>
			<option value="date_asc">DATE: OLDEST</option>
			<option value="amount_desc">AMOUNT: HIGH→LOW</option>
			<option value="amount_asc">AMOUNT: LOW→HIGH</option>
			<option value="merchant_asc">MERCHANT: A→Z</option>
		</select>

		{#if activeFilterCount > 0}
			<button onclick={clearAll} class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors">
				CLEAR ALL ✕
			</button>
		{/if}
	</div>

	<Card title="Receipts ({data.total})">
		{#if data.receipts.length === 0}
			<div class="py-12 text-center">
				<p class="font-mono text-xs uppercase text-(--color-muted-foreground)">
					{activeFilterCount > 0 ? 'NO MATCHING RECEIPTS FOUND.' : 'NO RECEIPTS YET. UPLOAD YOUR FIRST RECEIPT TO GET STARTED.'}
				</p>
				{#if activeFilterCount > 0}
					<button onclick={clearAll} class="inline-block mt-4 font-black text-xs uppercase tracking-widest underline text-(--color-fg)">
						Clear Filters
					</button>
				{:else}
					<a href="/dashboard/receipts/upload" class="inline-block mt-4 font-black text-xs uppercase tracking-widest underline text-(--color-fg)">
						Upload Receipt →
					</a>
				{/if}
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#if selecting}
								<th class="pb-2 pr-3 w-8">
									<input
										type="checkbox"
										checked={data.receipts.every(r => selectedIds.has(r.id))}
										onchange={(e) => e.currentTarget.checked ? selectAll() : deselectAll()}
										class="cursor-pointer"
									/>
								</th>
							{/if}
							{#each ['Merchant', 'Date', 'Total', 'Category', 'Tags', 'Status', 'Sync', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.receipts as r (r.id)}
							{@const tags = (() => { try { return JSON.parse(r.tags ?? '[]'); } catch { return []; } })()}
							{@const isSelected = selectedIds.has(r.id)}
							<tr
								class="border-b border-(--color-border) transition-all group {isSelected ? 'bg-(--nav-active-bg)' : 'hover:bg-(--color-muted)'}"
								onclick={selecting ? () => toggleSelect(r.id) : undefined}
								style={selecting ? 'cursor: pointer' : ''}
							>
								{#if selecting}
									<td class="py-3 pr-3">
										<input
											type="checkbox"
											checked={isSelected}
											onchange={() => toggleSelect(r.id)}
											onclick={(e) => e.stopPropagation()}
											class="cursor-pointer"
										/>
									</td>
								{/if}
								<td class="py-3 pr-4 font-bold text-xs text-(--color-fg) max-w-36 truncate">
									{r.merchantName ?? '—'}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
									{r.receiptDate ? new Date(r.receiptDate).toLocaleDateString() : '—'}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
									{r.total ? `${r.total} ${r.currency ?? ''}`.trim() : '—'}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) max-w-28 truncate">
									{r.category ?? '—'}
								</td>
								<td class="py-3 pr-4 max-w-36">
									{#if tags.length > 0}
										<div class="flex flex-wrap gap-1">
											{#each tags.slice(0, 3) as tag (tag)}
												<span class="font-mono text-[8px] border border-(--color-border) px-1 py-0.5 text-(--color-muted-foreground)">{tag}</span>
											{/each}
											{#if tags.length > 3}
												<span class="font-mono text-[8px] text-(--color-muted-foreground)">+{tags.length - 3}</span>
											{/if}
										</div>
									{:else}
										<span class="font-mono text-[10px] text-(--color-muted-foreground)">—</span>
									{/if}
								</td>
								<td class="py-3 pr-4">
									<ReceiptStatusBadge status={r.status} />
								</td>
								<td class="py-3 pr-4">
									{#if r.driveFileId}
										<span class="font-mono text-[9px] text-green-600 uppercase font-bold">
											{r.driveProvider === 'google' ? 'DRIVE' : 'ONEDRIVE'}
										</span>
									{:else}
										<span class="font-mono text-[9px] text-(--color-muted-foreground)">—</span>
									{/if}
								</td>
								<td class="py-3">
									{#if !selecting}
										<a
											href="/dashboard/receipts/{r.id}"
											class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-fg) no-underline opacity-0 group-hover:opacity-100 transition-opacity"
										>
											VIEW →
										</a>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if totalPages > 1}
				<div class="flex items-center justify-between mt-4 pt-4 border-t border-(--color-border)">
					<span class="font-mono text-[10px] text-(--color-muted-foreground) uppercase">
						Page {data.page} of {totalPages} · {data.total} total
					</span>
					<div class="flex gap-2">
						<a href={pageUrl(data.page - 1)}
							class="font-mono text-[10px] uppercase font-black tracking-widest px-3 py-1 border-2 transition-colors {hasPrev ? 'border-(--color-border) text-(--color-fg) hover:border-(--color-fg)' : 'border-(--color-border) text-(--color-muted-foreground) pointer-events-none opacity-40'}"
							aria-disabled={!hasPrev}>← PREV</a>
						<a href={pageUrl(data.page + 1)}
							class="font-mono text-[10px] uppercase font-black tracking-widest px-3 py-1 border-2 transition-colors {hasNext ? 'border-(--color-border) text-(--color-fg) hover:border-(--color-fg)' : 'border-(--color-border) text-(--color-muted-foreground) pointer-events-none opacity-40'}"
							aria-disabled={!hasNext}>NEXT →</a>
					</div>
				</div>
			{/if}
		{/if}
	</Card>
</div>
