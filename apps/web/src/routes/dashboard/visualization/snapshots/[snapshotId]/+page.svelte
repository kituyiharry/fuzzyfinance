<script>
	import { untrack } from 'svelte';
	import Card from '$lib/components/Card.svelte';
	import SankeyDiagram from '$lib/components/SankeyDiagram.svelte';
	import TrendlineChart from '$lib/components/TrendlineChart.svelte';
	import TreemapDiagram from '$lib/components/TreemapDiagram.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @type {'sankey' | 'trendlines' | 'treemap'} */
	let activeTab = $state('sankey');

	// Defaults to whichever side has data — expense first when both do.
	// `untrack` because this is an initial-only choice; once the user
	// toggles, the state should stick.
	/** @type {'expense' | 'revenue'} */
	let activeSide = $state(untrack(() => data.expense ? 'expense' : 'revenue'));

	const current = $derived(activeSide === 'expense' ? data.expense : data.revenue);
	const sideColorClass = $derived(activeSide === 'expense' ? 'text-(--color-accent)' : 'text-(--color-success)');
	const sideGlyph      = $derived(activeSide === 'expense' ? '↘' : '↗');
	const sideLabel      = $derived(activeSide === 'expense' ? 'Expense' : 'Revenue');
	const docNoun        = $derived(activeSide === 'expense' ? 'receipts' : 'sales');

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';
</script>

<svelte:head>
	<title>{data.snapshot.label} | Snapshot | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-6xl mx-auto">
	<div class="flex items-center justify-between flex-wrap gap-3">
		<a
			href="/dashboard/visualization"
			class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)"
		>← Back to snapshots</a>
		<div class="font-mono text-[10px] text-(--color-muted-foreground)">
			Saved {fmtDateTime(data.snapshot.createdAt)}
		</div>
	</div>

	<Card title={`Snapshot · ${data.snapshot.rangeStart} → ${data.snapshot.rangeEnd}`}>
		{#if data.baselineCurrency}
			<div class="border-2 border-(--color-border) bg-(--color-bg) p-3 mb-3 flex items-start gap-3">
				<span class="font-mono text-[9px] font-black uppercase tracking-widest text-(--color-fg) shrink-0 mt-0.5">{data.baselineCurrency} ONLY</span>
				<p class="font-mono text-[10px] text-(--color-muted-foreground) leading-relaxed">
					Analysis assumes a single baseline currency ({data.baselineCurrency}). Documents in other currencies were excluded at save time.
				</p>
			</div>
		{/if}

		<!-- Side toggle -->
		<div class="inline-flex border-2 border-(--color-border) mb-3">
			{#each /** @type {const} */ ([
				{ id: 'expense', label: 'Expense', present: !!data.expense },
				{ id: 'revenue', label: 'Revenue', present: !!data.revenue },
			]) as opt (opt.id)}
				<button
					onclick={() => (activeSide = opt.id)}
					disabled={!opt.present}
					aria-pressed={activeSide === opt.id}
					title={!opt.present ? `No ${opt.label.toLowerCase()} side saved for this snapshot` : ''}
					class="px-4 py-1.5 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
						{activeSide === opt.id
							? 'bg-(--color-fg) text-(--color-bg)'
							: 'text-(--color-muted-foreground) hover:text-(--color-fg)'}
						disabled:opacity-30 disabled:cursor-not-allowed"
				>{activeSide === opt.id ? '● ' : ''}{opt.label}</button>
			{/each}
		</div>

		{#if !current}
			<p class="font-mono text-[11px] text-(--color-muted-foreground) py-10 text-center">
				No {sideLabel.toLowerCase()} side saved for this snapshot.
			</p>
		{:else if current.error}
			<p class="font-mono text-[11px] text-(--color-danger) py-4 text-center">{current.error}</p>
		{:else}
			<div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
				<p class="font-mono text-[10px] text-(--color-muted-foreground)">
					<span class={sideColorClass}>{sideGlyph} {sideLabel}</span>
					· {current.meta?.docCount} {docNoun}
					· {current.meta?.rowCount} line items
					· {current.alluvial.nodes.length} nodes · {current.alluvial.links.length} links
				</p>
			</div>

			<!-- Chart-type tabs -->
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
				{#if current.alluvial.nodes.length === 0}
					<p class="font-mono text-[11px] text-(--color-muted-foreground) py-10 text-center">No nodes.</p>
				{:else}
					<SankeyDiagram data={current.alluvial} />
				{/if}
			{:else if activeTab === 'trendlines'}
				{#if !current.trendline}
					<p class="font-mono text-[11px] text-(--color-muted-foreground) py-10 text-center">No trendline data.</p>
				{:else}
					<TrendlineChart data={current.trendline} />
				{/if}
			{:else if activeTab === 'treemap'}
				{#if current.alluvial.nodes.length === 0}
					<p class="font-mono text-[11px] text-(--color-muted-foreground) py-10 text-center">No nodes.</p>
				{:else}
					<TreemapDiagram data={current.alluvial} />
				{/if}
			{/if}
		{/if}
	</Card>
</div>
