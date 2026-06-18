<script>
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let searchQuery = $state('');
	/** @type {Record<string, boolean>} */
	let deleting = $state({});

	const filtered = $derived.by(() => {
		const needle = searchQuery.trim().toLowerCase();
		if (needle === '') return data.snapshots;
		return data.snapshots.filter((s) => {
			const haystack = [s.label, s.expenseFile, s.revenueFile, s.rangeStart, s.rangeEnd]
				.filter(Boolean).join(' ').toLowerCase();
			return haystack.includes(needle);
		});
	});

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';

	/** @param {string} id @param {string} label */
	async function deleteSnapshot(id, label) {
		if (!confirm(`Delete snapshot "${label}"? This removes both the expense and revenue exports + their cached visualizations. Cannot be undone.`)) return;
		deleting[id] = true;
		try {
			const res = await fetch(`/api/visualization-snapshots?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				alert(body?.message ?? `Delete failed (${res.status})`);
				return;
			}
			await invalidateAll();
		} finally {
			deleting[id] = false;
		}
	}
</script>

<svelte:head>
	<title>Visualization | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-6xl mx-auto">
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
					Pick any date range or financial-year preset · split view of expense + revenue · Save Snapshot freezes both sides into a saved entry below
				</div>
			</div>
			<span class="font-mono text-[9px] uppercase tracking-widest">→ Open</span>
		</div>
	</a>

	<Card title="Saved Snapshots ({filtered.length})">
		{#if data.snapshots.length === 0}
			<EmptyState
				message="No snapshots yet"
				submessage="Run a live analysis and hit Save Snapshot — both expense + revenue for that date range will be saved together and appear here."
				ctaLabel="Open Live Analysis"
				ctaHref="/dashboard/visualization/live"
			/>
		{:else}
			<div class="flex gap-2 mb-4">
				<input
					type="text"
					placeholder="SEARCH SNAPSHOTS..."
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
					No snapshots match "{searchQuery}"
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse">
						<thead>
							<tr class="border-b-2 border-(--color-border)">
								{#each ['Range', 'Created', 'Expense', 'Revenue', ''] as col, i (i)}
									<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each filtered as s (s.id)}
								<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all">
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
										{s.rangeStart} → {s.rangeEnd}
									</td>
									<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) whitespace-nowrap">
										{fmtDateTime(s.createdAt)}
									</td>
									<td class="py-3 pr-4 font-mono text-[9px] uppercase tracking-widest">
										{#if s.receiptExportId}
											<span class="text-(--color-accent)">↘ {s.expenseDocCount} docs · {s.expenseRowCount} rows</span>
											{#if s.expenseVizId}
												<span class="text-(--color-muted-foreground) ml-2">· cached {s.expenseNodeCount}n/{s.expenseLinkCount}l</span>
											{/if}
										{:else}
											<span class="text-(--color-muted-foreground)">—</span>
										{/if}
									</td>
									<td class="py-3 pr-4 font-mono text-[9px] uppercase tracking-widest">
										{#if s.saleExportId}
											<span class="text-(--color-success)">↗ {s.revenueDocCount} docs · {s.revenueRowCount} rows</span>
											{#if s.revenueVizId}
												<span class="text-(--color-muted-foreground) ml-2">· cached {s.revenueNodeCount}n/{s.revenueLinkCount}l</span>
											{/if}
										{:else}
											<span class="text-(--color-muted-foreground)">—</span>
										{/if}
									</td>
									<td class="py-3 font-mono text-[10px] text-right whitespace-nowrap">
										<a
											href="/dashboard/visualization/snapshots/{s.id}"
											class="border-2 border-(--color-border) px-3 py-1 hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors uppercase tracking-widest text-[9px] mr-1"
										>
											Open →
										</a>
										<button
											onclick={() => deleteSnapshot(s.id, s.label)}
											disabled={deleting[s.id]}
											class="border-2 border-(--color-danger) text-(--color-danger) px-3 py-1 hover:bg-(--color-danger) hover:text-(--color-bg) transition-colors uppercase tracking-widest text-[9px] disabled:opacity-40"
										>{deleting[s.id] ? 'DELETING…' : 'Delete'}</button>
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
