<script>
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let searchQuery = $state('');

	const filtered = $derived(
		searchQuery.trim() === ''
			? data.exports
			: data.exports.filter((ex) =>
				ex.fileName.toLowerCase().includes(searchQuery.trim().toLowerCase())
			)
	);

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';
</script>

<svelte:head>
	<title>Visualization | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
	<!-- Live analysis CTA -->
	<a
		href="/dashboard/visualization/live"
		class="block border-2 border-(--color-border) p-4 hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors group"
	>
		<div class="flex items-center justify-between gap-4">
			<div>
				<div class="font-mono text-xs font-black uppercase tracking-widest">
					Live Analysis <span class="ml-2 text-(--color-accent) group-hover:text-(--color-bg)">▸</span>
				</div>
				<div class="font-mono text-[10px] text-(--color-muted-foreground) group-hover:text-(--color-bg) mt-1">
					Pick any date range or financial-year preset · query straight from line items · no export saved
				</div>
			</div>
			<span class="font-mono text-[9px] uppercase tracking-widest">→ Open</span>
		</div>
	</a>

	<Card title="Receipt Export Visualizations ({filtered.length})">
		{#if data.exports.length === 0}
			<EmptyState
				message="No receipt exports to visualize"
				submessage="Generate an export from the Expenses page first, then return here to view its Sankey diagram."
				ctaLabel="Go to Expenses"
				ctaHref="/dashboard/receipts"
			/>
		{:else}
			<div class="flex gap-2 mb-4">
				<input
					type="text"
					placeholder="SEARCH EXPORTS..."
					bind:value={searchQuery}
					class="flex-1 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-3 py-2"
				/>
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="border-2 border-(--color-border) px-4 py-2 font-mono text-[10px] uppercase"
					>Clear</button>
				{/if}
			</div>

			{#if filtered.length === 0}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
					No exports match "{searchQuery}"
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse">
						<thead>
							<tr class="border-b-2 border-(--color-border)">
								{#each ['Created', 'File', 'Expenses', 'Rows', 'Status', ''] as col, i (i)}
									<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each filtered as ex (ex.id)}
								<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all">
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
										{fmtDateTime(ex.createdAt)}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) max-w-64 truncate">
										{ex.fileName}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) text-center">
										{ex.receiptCount}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) text-center">
										{ex.rowCount}
									</td>
									<td class="py-3 pr-4 font-mono text-[9px] uppercase tracking-widest">
										{#if ex.vizId}
											<span class="text-(--color-accent)">✓ {ex.nodeCount}n / {ex.linkCount}l</span>
										{:else}
											<span class="text-(--color-muted-foreground)">— generate on open</span>
										{/if}
									</td>
									<td class="py-3 font-mono text-[10px] text-right">
										<a
											href="/dashboard/visualization/{ex.id}"
											class="border-2 border-(--color-border) px-3 py-1 hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors uppercase tracking-widest text-[9px]"
										>
											Visualize →
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</Card>
</div>
