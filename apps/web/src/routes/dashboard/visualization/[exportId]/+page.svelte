<script>
	import Card from '$lib/components/Card.svelte';
	import SankeyDiagram from '$lib/components/SankeyDiagram.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

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

		{#if data.alluvial.nodes.length === 0}
			<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
				No line items with price + unit data to visualize in this export.
			</p>
		{:else}
			<SankeyDiagram data={data.alluvial} />
		{/if}
	</Card>
</div>
