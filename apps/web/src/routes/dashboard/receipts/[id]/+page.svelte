<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let receipt   = $derived(data.receipt);
	let lineItems = $derived(data.lineItems);

	let retrying  = $state(false);
	let deleting  = $state(false);

	async function retrySync() {
		retrying = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/retry-sync`, { method: 'POST' });
			if (res.ok) {
				await invalidateAll();
			}
		} finally {
			retrying = false;
		}
	}

	async function deleteReceipt() {
		if (!confirm('Delete this receipt? This cannot be undone.')) return;
		deleting = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' });
			if (res.ok) goto('/dashboard/receipts');
		} finally {
			deleting = false;
		}
	}

	/** @param {Date | null | undefined} d */
	const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
</script>

<svelte:head>
	<title>{receipt.merchantName ?? 'Receipt'} | FuzzyFinance</title>
</svelte:head>

<div class="max-w-3xl mx-auto flex flex-col gap-6">
	<!-- Header row -->
	<div class="flex items-center justify-between gap-4">
		<a href="/dashboard/receipts" class="font-mono text-[10px] uppercase font-black text-(--color-muted-foreground) no-underline hover:text-(--color-fg) transition-colors">
			← ALL RECEIPTS
		</a>
		<div class="flex items-center gap-3">
			<ReceiptStatusBadge status={receipt.status} />
			{#if receipt.status === 'complete_no_sync' || receipt.status === 'failed'}
				<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
					{retrying ? 'RETRYING...' : 'RETRY SYNC'}
				</Button>
			{/if}
			<Button variant="secondary" onclick={deleteReceipt} class="text-xs font-black uppercase tracking-widest border-red-600 text-red-600 hover:bg-red-600 hover:text-white" disabled={deleting}>
				{deleting ? 'DELETING...' : 'DELETE'}
			</Button>
		</div>
	</div>

	<!-- Main fields -->
	<Card title={receipt.merchantName ?? 'Receipt'}>
		<div class="grid grid-cols-2 gap-x-8 gap-y-4">
			{#each [
				['MERCHANT',        receipt.merchantName],
				['DATE',            fmtDate(receipt.receiptDate)],
				['TOTAL',           receipt.total ? `${receipt.total} ${receipt.currency ?? ''}`.trim() : null],
				['SUBTOTAL',        receipt.subtotal],
				['TAX',             receipt.tax],
				['TIP',             receipt.tip],
				['CURRENCY',        receipt.currency],
				['PAYMENT METHOD',  receipt.paymentMethod],
				['CATEGORY',        receipt.category],
				['FILE',            receipt.rawFileName]
			] as [label, value] (label)}
				<div class="flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">{label}</span>
					<span class="font-bold text-xs text-(--color-fg)">{value ?? '—'}</span>
				</div>
			{/each}
		</div>

		{#if receipt.notes}
			<div class="mt-6 border-t border-(--color-border) pt-4">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground) block mb-2">NOTES</span>
				<p class="font-mono text-xs text-(--color-fg)">{receipt.notes}</p>
			</div>
		{/if}
	</Card>

	<!-- Line items -->
	{#if lineItems.length > 0}
		<Card title="Line Items">
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Description', 'Qty', 'Unit Price', 'Total'] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each lineItems as li (li.id)}
							<tr class="border-b border-(--color-border)">
								<td class="py-2 pr-4 text-xs text-(--color-fg)">{li.description ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.qty ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.unitPrice ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.total ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}

	<!-- Cloud sync status -->
	<Card title="Sync Status">
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<!-- Drive -->
			<div class="border-2 {receipt.driveFileId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">CLOUD STORAGE</span>
				{#if receipt.driveFileId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{receipt.driveProvider === 'google' ? 'GOOGLE DRIVE' : 'ONEDRIVE'}</span>
					<span class="font-mono text-[9px] text-green-600 uppercase font-bold">UPLOADED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">NOT SYNCED</span>
				{/if}
			</div>

			<!-- Sheet -->
			<div class="border-2 {receipt.sheetId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SPREADSHEET</span>
				{#if receipt.sheetId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{receipt.sheetProvider === 'google' ? 'GOOGLE SHEETS' : 'EXCEL'}</span>
					<span class="font-mono text-[9px] text-green-600 uppercase font-bold">ROW APPENDED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">NOT SYNCED</span>
				{/if}
			</div>

			<!-- Vector -->
			<div class="border-2 {receipt.vectorId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SEMANTIC INDEX</span>
				{#if receipt.vectorId}
					<span class="font-black text-xs text-(--color-fg) uppercase">VECTORIZE</span>
					<span class="font-mono text-[9px] text-green-600 uppercase font-bold">INDEXED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">NOT INDEXED</span>
				{/if}
			</div>
		</div>

		{#if receipt.errorMessage}
			<div class="mt-4 border-2 border-red-600 p-3 font-mono text-[10px] text-red-600 uppercase">
				LAST ERROR: {receipt.errorMessage}
			</div>
		{/if}
	</Card>
</div>
