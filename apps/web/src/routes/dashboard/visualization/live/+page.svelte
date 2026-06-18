<script>
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/Card.svelte';
	import SankeyDiagram from '$lib/components/SankeyDiagram.svelte';
	import TrendlineChart from '$lib/components/TrendlineChart.svelte';
	import TreemapDiagram from '$lib/components/TreemapDiagram.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @type {'sankey' | 'trendlines' | 'treemap'} */
	let activeTab = $state('sankey');

	/** @type {'expense' | 'revenue'} */
	let activeSide = $state('expense');

	const current = $derived(activeSide === 'expense' ? data.expense : data.revenue);
	const sideColorClass = $derived(activeSide === 'expense' ? 'text-(--color-accent)' : 'text-(--color-success)');
	const sideGlyph      = $derived(activeSide === 'expense' ? '↘' : '↗');
	const sideLabel      = $derived(activeSide === 'expense' ? 'Expense' : 'Revenue');
	const docNoun        = $derived(activeSide === 'expense' ? 'receipts' : 'sales');

	let startInput = $state(untrack(() => data.range?.start ?? ''));
	let endInput   = $state(untrack(() => data.range?.end   ?? ''));

	/** @param {Date} d */
	const iso = (d) => d.toISOString().slice(0, 10);

	function fyBounds(d) {
		const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
		return { start: new Date(y, 6, 1), end: new Date(y + 1, 5, 30) };
	}

	function calQuarterBounds(d) {
		const q = Math.floor(d.getMonth() / 3);
		return { start: new Date(d.getFullYear(), q * 3, 1), end: new Date(d.getFullYear(), q * 3 + 3, 0) };
	}

	const PRESETS = [
		{ label: 'MTD', range: (n) => ({ start: new Date(n.getFullYear(), n.getMonth(), 1), end: n }) },
		{ label: 'Last Month', range: (n) => ({
			start: new Date(n.getFullYear(), n.getMonth() - 1, 1),
			end:   new Date(n.getFullYear(), n.getMonth(),     0),
		}) },
		{ label: 'This Q', range: (n) => { const q = calQuarterBounds(n); return { start: q.start, end: n < q.end ? n : q.end }; } },
		{ label: 'Last Q', range: (n) => {
			const q = Math.floor(n.getMonth() / 3) - 1;
			const y = q < 0 ? n.getFullYear() - 1 : n.getFullYear();
			const qi = (q + 4) % 4;
			return { start: new Date(y, qi * 3, 1), end: new Date(y, qi * 3 + 3, 0) };
		} },
		{ label: 'YTD', range: (n) => ({ start: new Date(n.getFullYear(), 0, 1), end: n }) },
		{ label: 'Last Year', range: (n) => ({
			start: new Date(n.getFullYear() - 1, 0, 1),
			end:   new Date(n.getFullYear() - 1, 11, 31),
		}) },
		{ label: 'This FY', range: (n) => { const fy = fyBounds(n); return { start: fy.start, end: n < fy.end ? n : fy.end }; } },
		{ label: 'Last FY', range: (n) => {
			const fy = fyBounds(n);
			const prevStart = new Date(fy.start.getFullYear() - 1, 6, 1);
			const prevEnd   = new Date(fy.start.getFullYear(), 5, 30);
			return { start: prevStart, end: prevEnd };
		} },
	];

	const FY_QUARTERS = [
		{ label: 'FY Q1', monthStart: 6,  monthEnd: 8,  yearOffset: 0 },
		{ label: 'FY Q2', monthStart: 9,  monthEnd: 11, yearOffset: 0 },
		{ label: 'FY Q3', monthStart: 0,  monthEnd: 2,  yearOffset: 1 },
		{ label: 'FY Q4', monthStart: 3,  monthEnd: 5,  yearOffset: 1 },
	];

	/** @param {(n: Date) => { start: Date; end: Date }} rangeFn */
	function apply(rangeFn) {
		const now = new Date();
		const { start, end } = rangeFn(now);
		startInput = iso(start);
		endInput   = iso(end);
	}

	/** @param {typeof FY_QUARTERS[number]} q */
	function applyFyQuarter(q) {
		const now = new Date();
		const fyStartYear = fyBounds(now).start.getFullYear();
		const start = new Date(fyStartYear + q.yearOffset, q.monthStart, 1);
		const end   = new Date(fyStartYear + q.yearOffset, q.monthEnd + 1, 0);
		startInput = iso(start);
		endInput   = iso(end);
	}

	function generate() {
		if (!startInput || !endInput) return;
		const params = new URLSearchParams({ start: startInput, end: endInput });
		goto(`/dashboard/visualization/live?${params.toString()}`, { invalidateAll: true });
	}

	let saving = $state(false);
	/** @type {{ kind: 'success' | 'error', text: string, links: Array<{ href: string, label: string }> } | null} */
	let saveStatus = $state(null);

	async function saveSnapshot() {
		const range = data.range;
		if (!range || saving) return;
		saving = true;
		saveStatus = null;
		try {
			const res = await fetch('/api/visualization-snapshots', {
				method:  'POST',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ start: range.start, end: range.end })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				saveStatus = { kind: 'error', text: body?.message ?? `Save failed (${res.status})`, links: [] };
				return;
			}
			/** @type {Array<{ href: string, label: string }>} */
			const links = [];
			const parts = [];
			if (body.expense?.id) parts.push(`expense (${body.expense.docCount} receipts)`);
			else if (body.expense?.skipped) parts.push(`expense (skipped: ${body.expense.skipped})`);
			if (body.revenue?.id) parts.push(`revenue (${body.revenue.docCount} sales)`);
			else if (body.revenue?.skipped) parts.push(`revenue (skipped: ${body.revenue.skipped})`);
			if (body.snapshotId) {
				links.push({ href: `/dashboard/visualization/snapshots/${body.snapshotId}`, label: 'Open snapshot →' });
			}
			saveStatus = {
				kind:  body.snapshotId ? 'success' : 'error',
				text:  `Snapshot ${range.start} → ${range.end}: ${parts.join(', ')}`,
				links
			};
		} catch (/** @type {any} */ err) {
			saveStatus = { kind: 'error', text: String(err?.message ?? err), links: [] };
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Live Visualization | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-4 max-w-6xl mx-auto">
	<a
		href="/dashboard/visualization"
		class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)"
	>← Back to saved snapshots</a>

	<Card title="Live Analysis">
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mb-3">
			Pull receipts (expense) and sales (revenue) within a date range and visualise them on-the-fly. Not saved — refresh re-runs the analysis. Hit <strong>Save Snapshot</strong> to freeze the pair.
		</p>

		<!-- Side toggle: expense ↔ revenue. Mirrors the snapshot viewer. -->
		<div class="inline-flex border-2 border-(--color-border) mb-3">
			{#each /** @type {const} */ ([
				{ id: 'expense', label: 'Expense' },
				{ id: 'revenue', label: 'Revenue' },
			]) as opt (opt.id)}
				<button
					onclick={() => (activeSide = opt.id)}
					aria-pressed={activeSide === opt.id}
					class="px-4 py-1.5 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{activeSide === opt.id
							? 'bg-(--color-fg) text-(--color-bg)'
							: 'text-(--color-muted-foreground) hover:text-(--color-fg)'}"
				>{activeSide === opt.id ? '● ' : ''}{opt.label}</button>
			{/each}
		</div>

		{#if data.baselineCurrency}
			<div class="border-2 border-(--color-border) bg-(--color-bg) p-3 mb-3 flex items-start gap-3">
				<span class="font-mono text-[9px] font-black uppercase tracking-widest text-(--color-fg) shrink-0 mt-0.5">{data.baselineCurrency} ONLY</span>
				<p class="font-mono text-[10px] text-(--color-muted-foreground) leading-relaxed">
					Only documents in your baseline currency ({data.baselineCurrency}) are included. Change it in
					<a href="/dashboard/settings" class="underline decoration-dotted hover:decoration-solid text-(--color-fg)">Settings</a>.
				</p>
			</div>
		{/if}

		<div class="flex flex-wrap items-end gap-3 mb-4">
			<div class="flex flex-col gap-1">
				<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">Start</span>
				<input
					type="date"
					bind:value={startInput}
					class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">End</span>
				<input
					type="date"
					bind:value={endInput}
					class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1"
				/>
			</div>
			<button
				onclick={generate}
				disabled={!startInput || !endInput}
				class="border-2 border-(--color-border) px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>Generate</button>
		</div>

		<div class="flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) min-w-16">Quick</span>
				{#each PRESETS as p (p.label)}
					<button
						onclick={() => apply(p.range)}
						class="border border-(--color-border) px-2 py-1 font-mono text-[9px] uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors"
					>{p.label}</button>
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) min-w-16">FY (current)</span>
				{#each FY_QUARTERS as q (q.label)}
					<button
						onclick={() => applyFyQuarter(q)}
						class="border border-(--color-border) px-2 py-1 font-mono text-[9px] uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors"
					>{q.label}</button>
				{/each}
			</div>
		</div>
	</Card>

	{#if data.range}
		<Card title={`${sideLabel} Analysis: ${data.range.start} → ${data.range.end}`}>
			<div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
				<p class="font-mono text-[10px] text-(--color-muted-foreground)">
					<span class={sideColorClass}>{sideGlyph} {sideLabel}</span>
					{#if current.meta}
						· {current.meta.docCount} {docNoun}
						· {current.meta.rowCount} line items
						{#if current.alluvial}
							· {current.alluvial.nodes.length} nodes · {current.alluvial.links.length} links
						{/if}
						{#if current.meta.excludedCount > 0}
							<span class="text-(--color-warning) ml-2">· {current.meta.excludedCount} excluded (currency ≠ {data.baselineCurrency})</span>
						{/if}
					{/if}
				</p>
				<button
					onclick={saveSnapshot}
					disabled={saving}
					title="Save both expense + revenue exports for this date range"
					class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{saving
							? 'border-(--color-border) text-(--color-muted-foreground) cursor-wait'
							: 'border-(--color-fg) bg-(--color-fg) text-(--color-bg) hover:bg-(--color-bg) hover:text-(--color-fg)'}"
				>{saving ? 'SAVING…' : 'SAVE SNAPSHOT'}</button>
			</div>

			{#if saveStatus}
				<div class="font-mono text-[10px] uppercase tracking-widest mb-3 flex flex-wrap items-center gap-x-3 gap-y-1
					{saveStatus.kind === 'success' ? 'text-(--color-success)' : 'text-(--color-warning)'}">
					<span>{saveStatus.text}</span>
					{#each saveStatus.links as link, i (i)}
						<a href={link.href} class="underline hover:no-underline">{link.label}</a>
					{/each}
				</div>
			{/if}

			{#if current.errorMessage}
				<p class="font-mono text-[11px] text-(--color-danger) py-2">{current.errorMessage}</p>
			{:else if !current.alluvial}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-6 text-center">No data.</p>
			{:else}
				<div class="flex border-b-2 border-(--color-border) mb-4">
					{#each /** @type {const} */ ([
						{ id: 'sankey',     label: 'Sankey' },
						{ id: 'trendlines', label: 'Trendlines' },
						{ id: 'treemap',    label: 'Treemap' },
					]) as tab (tab.id)}
						<button
							onclick={() => (activeTab = tab.id)}
							aria-pressed={activeTab === tab.id}
							class="px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black transition-colors
								{activeTab === tab.id
									? 'text-(--color-fg) border-b-2 border-(--color-fg) -mb-[2px]'
									: 'text-(--color-muted-foreground) hover:text-(--color-fg)'}"
						>{tab.label}</button>
					{/each}
				</div>

				{#if activeTab === 'sankey'}
					<SankeyDiagram data={current.alluvial} />
				{:else if activeTab === 'trendlines'}
					{#if current.trendline}
						<TrendlineChart data={current.trendline} />
					{:else}
						<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">No trendline data.</p>
					{/if}
				{:else if activeTab === 'treemap'}
					<TreemapDiagram data={current.alluvial} />
				{/if}
			{/if}
		</Card>
	{/if}
</div>
