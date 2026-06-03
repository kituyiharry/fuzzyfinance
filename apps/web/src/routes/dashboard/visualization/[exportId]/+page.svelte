<script>
	import Card from '$lib/components/Card.svelte';
	import SankeyDiagram from '$lib/components/SankeyDiagram.svelte';
	import TrendlineChart from '$lib/components/TrendlineChart.svelte';
	import TreemapDiagram from '$lib/components/TreemapDiagram.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @type {'sankey' | 'trendlines' | 'treemap'} */
	let activeTab = $state('sankey');

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';
</script>

<svelte:head>
	<title>{data.exportMeta.fileName} | Visualization | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-6xl mx-auto">
	<div class="flex items-center justify-between">
		<a
			href="/dashboard/visualization"
			class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)"
		>← Back to list</a>
		<div class="font-mono text-[10px] text-(--color-muted-foreground)">
			Generated {fmtDateTime(data.viz.generatedAt)} · {data.viz.nodeCount} nodes · {data.viz.linkCount} links
		</div>
	</div>

	<Card title={data.exportMeta.fileName}>
		<div class="font-mono text-[10px] text-(--color-muted-foreground) mb-4">
			{data.exportMeta.receiptCount} receipts · {data.exportMeta.rowCount} line items · created {fmtDateTime(data.exportMeta.createdAt)}
		</div>

		<!-- Tab bar -->
		<div class="flex border-b-2 border-(--color-border) mb-4">
			{#each /** @type {const} */ ([
				{ id: 'sankey',     label: 'Sankey' },
				{ id: 'trendlines', label: 'Trendlines' },
				{ id: 'treemap',    label: 'Treemap' },
			]) as tab (tab.id)}
				<button
					onclick={() => (activeTab = tab.id)}
					class="px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black transition-colors {activeTab === tab.id ? 'text-(--color-fg) border-b-2 border-(--color-fg) -mb-[2px]' : 'text-(--color-muted-foreground) hover:text-(--color-fg)'}"
				>{tab.label}</button>
			{/each}
		</div>

		{#if activeTab === 'sankey'}
			{#if data.alluvial.nodes.length === 0}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
					No line items with price + unit data to visualize in this export.
				</p>
			{:else}
				<SankeyDiagram data={data.alluvial} />
			{/if}
		{:else if activeTab === 'trendlines'}
			{#if !data.trendline}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
					Trendline data not available for this export. Bump VIZ_ANALYZER_VERSION to regenerate, or open a newer export.
				</p>
			{:else}
				<TrendlineChart data={data.trendline} />
			{/if}
		{:else if activeTab === 'treemap'}
			{#if data.alluvial.nodes.length === 0}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
					No line items with price + category data to build a treemap.
				</p>
			{:else}
				<TreemapDiagram data={data.alluvial} />
			{/if}
		{/if}
	</Card>
</div>
