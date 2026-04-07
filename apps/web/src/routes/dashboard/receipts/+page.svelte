<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @type {string} */
	let searchQuery = $state('');

	/** @type {Array<Record<string, any>>} */
	let searchResults = $state([]);
	let searching = $state(false);
	let searched  = $state(false);

	async function runSearch() {
		if (!searchQuery.trim()) return;
		searching = true;
		searched  = false;
		try {
			const res = await fetch('/api/receipts/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: searchQuery })
			});
			if (res.ok) {
				searchResults = await res.json();
				searched = true;
			}
		} finally {
			searching = false;
		}
	}

	function clearSearch() {
		searchQuery   = '';
		searchResults = [];
		searched      = false;
	}

	const displayReceipts = $derived(searched ? searchResults : data.receipts);
</script>

<svelte:head>
	<title>Receipts | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
	<!-- Top actions -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex-1 flex gap-2">
			<input
				type="text"
				placeholder="SEARCH RECEIPTS..."
				bind:value={searchQuery}
				onkeydown={(e) => e.key === 'Enter' && runSearch()}
				class="flex-1 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-3 py-2 uppercase tracking-widest placeholder:text-(--color-muted-foreground) focus:outline-none focus:border-(--color-fg)"
			/>
			{#if searched}
				<Button variant="secondary" onclick={clearSearch} class="text-xs font-black uppercase tracking-widest">
					CLEAR
				</Button>
			{:else}
				<Button variant="secondary" onclick={runSearch} class="text-xs font-black uppercase tracking-widest" disabled={searching}>
					{searching ? 'SEARCHING...' : 'SEARCH'}
				</Button>
			{/if}
		</div>
		<a
			href="/dashboard/receipts/upload"
			class="btn-primary text-xs font-black uppercase tracking-widest no-underline px-4 py-2 inline-flex items-center"
		>
			+ UPLOAD RECEIPT
		</a>
	</div>

	{#if searched}
		<p class="font-mono text-[10px] text-(--color-muted-foreground) uppercase">
			{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for "{searchQuery}"
		</p>
	{/if}

	<Card title={searched ? 'Search Results' : 'All Receipts'}>
		{#if displayReceipts.length === 0}
			<div class="py-12 text-center">
				<p class="font-mono text-xs uppercase text-(--color-muted-foreground)">
					{searched ? 'NO MATCHING RECEIPTS FOUND.' : 'NO RECEIPTS YET. UPLOAD YOUR FIRST RECEIPT TO GET STARTED.'}
				</p>
				{#if !searched}
					<a
						href="/dashboard/receipts/upload"
						class="inline-block mt-4 font-black text-xs uppercase tracking-widest underline text-(--color-fg)"
					>
						Upload Receipt →
					</a>
				{/if}
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Merchant', 'Date', 'Total', 'Category', 'Status', 'Sync', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each displayReceipts as r (r.id)}
							<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all group">
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
									<a
										href="/dashboard/receipts/{r.id}"
										class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-fg) no-underline opacity-0 group-hover:opacity-100 transition-opacity"
									>
										VIEW →
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>
