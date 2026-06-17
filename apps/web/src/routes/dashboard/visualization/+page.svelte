<script>
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let searchQuery = $state('');
	/** @type {'all' | 'expense' | 'revenue'} */
	let sideFilter = $state('all');

	const filtered = $derived(() => {
		const needle = searchQuery.trim().toLowerCase();
		return data.exports
			.filter((ex) => sideFilter === 'all' || ex.side === sideFilter)
			.filter((ex) => needle === '' || ex.fileName.toLowerCase().includes(needle));
	});

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';

	const SIDE_TABS = /** @type {const} */ ([
		{ id: 'all',     label: 'All' },
		{ id: 'expense', label: 'Expense' },
		{ id: 'revenue', label: 'Revenue' }
	]);
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

	<Card title="Saved Visualizations ({filtered().length})">
		{#if data.exports.length === 0}
			<EmptyState
				message="No exports to visualize yet"
				submessage="Connect an accounting tool to pull in expense + revenue data, then return here to view their Sankey diagrams."
				ctaLabel="Manage Integrations"
				ctaHref="/dashboard/integrations"
			/>
		{:else}
			<!-- Side filter tabs -->
			<div class="flex gap-2 mb-3 flex-wrap">
				{#each SIDE_TABS as tab (tab.id)}
					{@const count = tab.id === 'all'
						? data.exports.length
						: data.exports.filter((ex) => ex.side === tab.id).length}
					<button
						onclick={() => (sideFilter = tab.id)}
						aria-pressed={sideFilter === tab.id}
						class="px-3 py-1.5 border-2 font-mono text-[10px] font-black uppercase tracking-widest transition-colors
							{sideFilter === tab.id
								? 'border-(--color-fg) bg-(--color-fg) text-(--color-bg)'
								: 'border-(--color-border) text-(--color-muted-foreground) hover:border-(--color-fg)'}"
					>{sideFilter === tab.id ? '● ' : ''}{tab.label} ({count})</button>
				{/each}
			</div>

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

			{#if filtered().length === 0}
				<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
					No exports match the current filter.
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse">
						<thead>
							<tr class="border-b-2 border-(--color-border)">
								{#each ['Side', 'Created', 'File', 'Docs', 'Rows', 'Status', ''] as col, i (i)}
									<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each filtered() as ex (ex.side + ':' + ex.id)}
								<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all">
									<td class="py-3 pr-4 font-mono text-[9px] uppercase tracking-widest font-black">
										<span class={ex.side === 'revenue'
											? 'text-(--color-success)'
											: 'text-(--color-accent)'}>
											{ex.side === 'revenue' ? '↗ Revenue' : '↘ Expense'}
										</span>
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
										{fmtDateTime(ex.createdAt)}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) max-w-64 truncate">
										{ex.fileName}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) text-center">
										{ex.docCount}
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
											href="/dashboard/visualization/{ex.id}?side={ex.side}"
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
