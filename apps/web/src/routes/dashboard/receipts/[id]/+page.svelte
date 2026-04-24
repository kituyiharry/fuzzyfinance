<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let receipt   = $derived(data.receipt);
	let lineItems = $derived(data.lineItems);

	let retrying   = $state(false);
	let deleting   = $state(false);
	let editing    = $state(false);
	let saving     = $state(false);
	let committing = $state(false);
	let aborting   = $state(false);
	let saveError  = $state('');

	/**
	 * @typedef {{ id: string; description: string; qty: string; unitPrice: string; total: string }} FormLineItem
	 */

	let form = $state({
		merchantName:  '',
		receiptDate:   '',
		total:         '',
		subtotal:      '',
		tax:           '',
		tip:           '',
		currency:      '',
		paymentMethod: '',
		receiptNumber: '',
		invoiceNumber: '',
		category:      '',
		notes:         '',
		/** Comma-separated tags string — transformed to array before PATCH */
		tags:          '',
		/** @type {FormLineItem[]} */
		lineItems:     []
	});

	function openEdit() {
		form.merchantName  = receipt.merchantName  ?? '';
		form.receiptDate   = receipt.receiptDate
			? new Date(receipt.receiptDate).toISOString().slice(0, 10) : '';
		form.total         = receipt.total         ?? '';
		form.subtotal      = receipt.subtotal      ?? '';
		form.tax           = receipt.tax           ?? '';
		form.tip           = receipt.tip           ?? '';
		form.currency      = receipt.currency      ?? '';
		form.paymentMethod = receipt.paymentMethod ?? '';
		form.receiptNumber = receipt.receiptNumber ?? '';
		form.invoiceNumber = receipt.invoiceNumber ?? '';
		form.category      = receipt.category      ?? '';
		form.notes         = receipt.notes         ?? '';
		form.tags          = (() => { try { return JSON.parse(receipt.tags ?? '[]').join(', '); } catch { return ''; } })();
		form.lineItems     = lineItems.map(li => ({
			id:          li.id,
			description: li.description ?? '',
			qty:         li.qty         ?? '',
			unitPrice:   li.unitPrice   ?? '',
			total:       li.total       ?? ''
		}));
		editing = true;
	}

	async function retrySync() {
		retrying = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/retry-sync`, { method: 'POST' });
			if (res.ok) await invalidateAll();
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

	async function saveEdits() {
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...form,
					tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
				})
			});
			if (!res.ok) {
				saveError = await res.text();
				return;
			}
			await invalidateAll();
			editing = false;
		} finally {
			saving = false;
		}
	}

	async function doCommit() {
		if (!confirm('Commit this receipt to cloud storage? This cannot be undone.')) return;
		committing = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/commit`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally {
			committing = false;
		}
	}

	async function doAbort() {
		if (!confirm('Discard this receipt? It will be permanently deleted.')) return;
		aborting = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/abort`, { method: 'POST' });
			if (res.ok) goto('/dashboard/receipts');
		} finally {
			aborting = false;
		}
	}

	function addLineItem() {
		form.lineItems = [...form.lineItems, { id: crypto.randomUUID(), description: '', qty: '', unitPrice: '', total: '' }];
	}

	/** @param {string} id */
	function removeLineItem(id) {
		form.lineItems = form.lineItems.filter(li => li.id !== id);
	}

	/** @param {Date | null | undefined} d */
	const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

	/** Compute a direct link to the receipt file in Drive, if available */
	let driveFileUrl = $derived.by(() => {
		if (!receipt.driveFileId) return null;
		if (receipt.driveProvider === 'google') {
			return `https://drive.google.com/file/d/${receipt.driveFileId}/view`;
		}
		return null; // OneDrive direct URL requires stored webUrl
	});

	let correctedCount = $derived.by(() => {
		if (!receipt.correctedFields) return 0;
		try { return JSON.parse(receipt.correctedFields).length; } catch { return 0; }
	});
</script>

<svelte:head>
	<title>{receipt.merchantName ?? 'Receipt'} | FuzzyFinance</title>
</svelte:head>

<div class="max-w-3xl mx-auto flex flex-col gap-6">
	<!-- Header row -->
	<div class="flex items-center justify-between gap-4 flex-wrap">
		<a href="/dashboard/receipts" class="font-mono text-[10px] uppercase font-black text-(--color-muted-foreground) no-underline hover:text-(--color-fg) transition-colors">
			← ALL RECEIPTS
		</a>
		<div class="flex items-center gap-3 flex-wrap">
			<ReceiptStatusBadge status={receipt.status} />

			{#if receipt.status !== 'staged' && correctedCount > 0}
				<span class="font-mono text-[9px] border border-(--color-warning-border) text-(--color-warning) bg-(--color-warning-muted) px-2 py-0.5 font-bold uppercase">
					EDITED · {correctedCount} FIELD{correctedCount === 1 ? '' : 'S'}
				</span>
			{/if}

			{#if receipt.status === 'staged'}
				{#if editing}
					<Button variant="secondary" onclick={saveEdits} class="text-xs font-black uppercase tracking-widest" disabled={saving}>
						{saving ? 'SAVING...' : 'SAVE EDITS'}
					</Button>
					<Button variant="secondary" onclick={() => { editing = false; saveError = ''; }} class="text-xs font-black uppercase tracking-widest" disabled={saving}>
						CANCEL
					</Button>
				{:else}
					<Button variant="secondary" onclick={openEdit} class="text-xs font-black uppercase tracking-widest">
						EDIT
					</Button>
				{/if}
				<Button variant="secondary" onclick={doCommit} class="text-xs font-black uppercase tracking-widest" disabled={committing || editing}>
					{committing ? 'COMMITTING...' : 'COMMIT'}
				</Button>
				<Button variant="danger" onclick={doAbort} class="text-xs font-black uppercase tracking-widest" disabled={aborting}>
					{aborting ? 'ABORTING...' : 'ABORT'}
				</Button>
			{:else}
				{#if receipt.status === 'complete_no_sync' || receipt.status === 'failed'}
					<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
						{retrying ? 'RETRYING...' : 'RETRY SYNC'}
					</Button>
				{/if}
				<Button variant="danger" onclick={deleteReceipt} class="text-xs font-black uppercase tracking-widest" disabled={deleting}>
					{deleting ? 'DELETING...' : 'DELETE'}
				</Button>
			{/if}
		</div>
	</div>

	{#if saveError}
		<div class="border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-3 font-mono text-[10px] text-(--color-danger) uppercase">
			SAVE ERROR: {saveError}
		</div>
	{/if}

	{#if receipt.errorMessage?.startsWith('AUTH_REQUIRED:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">CLOUD SYNC FAILED — RE-AUTHENTICATION REQUIRED</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				Your Google or Microsoft connection has expired or been revoked. Re-connect your account and then retry the sync.
			</p>
			<div class="pl-4 mt-1 flex items-center gap-4">
				<a
					href="/dashboard/integrations"
					class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid"
				>
					MANAGE INTEGRATIONS →
				</a>
				{#if receipt.status === 'complete_no_sync'}
					<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
						{retrying ? 'RETRYING...' : 'RETRY SYNC'}
					</Button>
				{/if}
			</div>
		</div>
	{:else if receipt.errorMessage?.startsWith('NOT_RELEVANT:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DOCUMENT NOT RECOGNISED AS A RECEIPT</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				{receipt.errorMessage.replace('NOT_RELEVANT:', '').trim()}
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				Please upload a receipt, invoice, bill, or similar expense document.
			</p>
		</div>
	{/if}

	{#if receipt.duplicateOf}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">POSSIBLE DUPLICATE RECEIPT</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				This receipt may be a duplicate — it shares a receipt or invoice number with an existing entry.
			</p>
			<div class="pl-4 mt-1">
				<a
					href="/dashboard/receipts/{receipt.duplicateOf}"
					class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid"
				>
					VIEW SUSPECTED DUPLICATE →
				</a>
			</div>
		</div>
	{/if}

	<!-- Main fields -->
	<Card title={editing ? 'Edit Receipt' : (receipt.merchantName ?? 'Receipt')}>
		{#if editing && receipt.status === 'staged'}
			<div class="grid grid-cols-2 gap-x-8 gap-y-4">
				{#each [
					{ key: 'merchantName',  label: 'MERCHANT' },
					{ key: 'total',         label: 'TOTAL' },
					{ key: 'subtotal',      label: 'SUBTOTAL' },
					{ key: 'tax',           label: 'TAX' },
					{ key: 'tip',           label: 'TIP' },
					{ key: 'currency',      label: 'CURRENCY' },
					{ key: 'paymentMethod', label: 'PAYMENT METHOD' },
					{ key: 'receiptNumber', label: 'RECEIPT NO.' },
					{ key: 'invoiceNumber', label: 'INVOICE NO.' },
					{ key: 'category',      label: 'CATEGORY' }
				] as field (field.key)}
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">{field.label}</span>
						<input
							class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-bold text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
							bind:value={form[field.key]}
						/>
					</div>
				{/each}

				<div class="flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">DATE</span>
					<input
						type="date"
						class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-bold text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
						bind:value={form.receiptDate}
					/>
				</div>
			</div>

			<div class="mt-4 flex flex-col gap-1">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">NOTES</span>
				<textarea
					rows="3"
					class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
					bind:value={form.notes}
				></textarea>
			</div>

			<div class="mt-4 flex flex-col gap-1">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS <span class="normal-case tracking-normal font-normal text-(--color-muted-foreground)">(comma-separated)</span></span>
				<input
					type="text"
					placeholder="e.g. business-meal, transport, recurring"
					class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
					bind:value={form.tags}
				/>
			</div>
		{:else}
			<!-- TAGS -->
			{@const receiptTags = (() => { try { return JSON.parse(receipt.tags ?? '[]'); } catch { return []; } })()}
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
					['RECEIPT NO.',     receipt.receiptNumber],
					['INVOICE NO.',     receipt.invoiceNumber],
					['CATEGORY',        receipt.category]
				] as [label, value] (label)}
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">{label}</span>
						<span class="font-bold text-xs text-(--color-fg)">{value ?? '—'}</span>
					</div>
				{/each}

				{#if receiptTags.length > 0}
					<div class="flex flex-col gap-1 col-span-2">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS</span>
						<div class="flex flex-wrap gap-1">
							{#each receiptTags as tag (tag)}
								<Badge label={tag} size="xs" />
							{/each}
						</div>
					</div>
				{/if}

				<!-- FILE — links to Drive when committed -->
				<div class="flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">FILE</span>
					{#if driveFileUrl}
						<a
							href={driveFileUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="font-bold text-xs text-(--color-fg) underline decoration-dotted hover:decoration-solid"
						>{receipt.rawFileName ?? '—'}</a>
					{:else}
						<span class="font-bold text-xs text-(--color-fg)">{receipt.rawFileName ?? '—'}</span>
					{/if}
				</div>
			</div>

			{#if receipt.notes}
				<div class="mt-6 border-t border-(--color-border) pt-4">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground) block mb-2">NOTES</span>
					<p class="font-mono text-xs text-(--color-fg)">{receipt.notes}</p>
				</div>
			{/if}
		{/if}
	</Card>

	<!-- Line items -->
	{#if editing && receipt.status === 'staged'}
		<Card title="Line Items">
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Description', 'Qty', 'Unit Price', 'Total', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each form.lineItems as li (li.id)}
							<tr class="border-b border-(--color-border)">
								<td class="py-1 pr-2">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.description} />
								</td>
								<td class="py-1 pr-2 w-16">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.qty} />
								</td>
								<td class="py-1 pr-2 w-20">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.unitPrice} />
								</td>
								<td class="py-1 pr-2 w-20">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.total} />
								</td>
								<td class="py-1 w-8">
									<button
										onclick={() => removeLineItem(li.id)}
										class="font-mono text-[10px] text-(--color-danger) hover:opacity-70 font-black"
										type="button"
									>×</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button
				onclick={addLineItem}
				type="button"
				class="mt-3 font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) border border-dashed border-(--color-border) px-3 py-1 transition-colors"
			>
				+ ADD ROW
			</button>
		</Card>
	{:else if lineItems.length > 0}
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
			<div class="border-2 {receipt.driveFileId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">CLOUD STORAGE</span>
				{#if receipt.driveFileId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{receipt.driveProvider === 'google' ? 'GOOGLE DRIVE' : 'ONEDRIVE'}</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">UPLOADED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">{receipt.status === 'staged' ? 'PENDING COMMIT' : 'NOT SYNCED'}</span>
				{/if}
			</div>

			<div class="border-2 {receipt.sheetId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SPREADSHEET</span>
				{#if receipt.sheetId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{receipt.sheetProvider === 'google' ? 'GOOGLE SHEETS' : 'EXCEL'}</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">ROW APPENDED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">{receipt.status === 'staged' ? 'PENDING COMMIT' : 'NOT SYNCED'}</span>
				{/if}
			</div>

			<div class="border-2 {receipt.vectorId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SEMANTIC INDEX</span>
				{#if receipt.vectorId}
					<span class="font-black text-xs text-(--color-fg) uppercase">VECTORIZE</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">INDEXED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">NOT INDEXED</span>
				{/if}
			</div>
		</div>

		{#if receipt.errorMessage}
			<div class="mt-4 border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-3 font-mono text-[10px] text-(--color-danger) uppercase">
				LAST ERROR: {receipt.errorMessage}
			</div>
		{/if}
	</Card>
</div>
