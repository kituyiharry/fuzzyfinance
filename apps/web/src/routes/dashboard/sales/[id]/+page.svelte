<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let sale      = $derived(data.sale);
	let lineItems = $derived(data.lineItems);

	let deleting   = $state(false);
	let editing    = $state(false);
	let saving     = $state(false);
	let committing = $state(false);
	let aborting   = $state(false);
	let saveError  = $state('');

	/**
	 * @typedef {{ id: string; description: string; type: string; unitsSold: string; buyPrice: string; sellPrice: string; margin: string; total: string; totalCost: string }} FormLineItem
	 */

	let form = $state({
		documentTitle: '',
		saleDate:      '',
		totalRevenue:  '',
		totalCost:     '',
		totalMargin:   '',
		currency:      '',
		category:      '',
		notes:         '',
		tags:          '',
		/** @type {FormLineItem[]} */
		lineItems:     []
	});

	function openEdit() {
		form.documentTitle = sale.documentTitle ?? '';
		form.saleDate      = sale.saleDate
			? new Date(sale.saleDate).toISOString().slice(0, 10) : '';
		form.totalRevenue  = sale.totalRevenue  ?? '';
		form.totalCost     = sale.totalCost     ?? '';
		form.totalMargin   = sale.totalMargin   ?? '';
		form.currency      = sale.currency      ?? '';
		form.category      = sale.category      ?? '';
		form.notes         = sale.notes         ?? '';
		form.tags          = (() => { try { return JSON.parse(sale.tags ?? '[]').join(', '); } catch { return ''; } })();
		form.lineItems     = lineItems.map(li => ({
			id:          li.id,
			description: li.description ?? '',
			type:        li.type        ?? '',
			unitsSold:   li.unitsSold   ?? '',
			buyPrice:    li.buyPrice    ?? '',
			sellPrice:   li.sellPrice   ?? '',
			margin:      li.margin      ?? '',
			total:       li.total       ?? '',
			totalCost:   li.totalCost   ?? ''
		}));
		editing = true;
	}

	async function deleteSale() {
		if (!confirm('Delete this sale? This cannot be undone.')) return;
		deleting = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
			if (res.ok) goto('/dashboard/sales');
		} finally {
			deleting = false;
		}
	}

	async function saveEdits() {
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}`, {
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
		if (!confirm('Commit this sale to cloud storage? This cannot be undone.')) return;
		committing = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}/commit`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally {
			committing = false;
		}
	}

	async function doAbort() {
		if (!confirm('Discard this sale? It will be permanently deleted.')) return;
		aborting = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}/abort`, { method: 'POST' });
			if (res.ok) goto('/dashboard/sales');
		} finally {
			aborting = false;
		}
	}

	function addLineItem() {
		form.lineItems = [...form.lineItems, {
			id: crypto.randomUUID(),
			description: '', type: '', unitsSold: '', buyPrice: '', sellPrice: '', margin: '', total: '', totalCost: ''
		}];
	}

	/** @param {string} id */
	function removeLineItem(id) {
		form.lineItems = form.lineItems.filter(li => li.id !== id);
	}

	/** @param {number | null | undefined} ts */
	const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

	let driveFileUrl = $derived.by(() => {
		if (!sale.driveFileId) return null;
		if (sale.driveProvider === 'google') {
			return `https://drive.google.com/file/d/${sale.driveFileId}/view`;
		}
		return null;
	});

	let correctedCount = $derived.by(() => {
		if (!sale.correctedFields) return 0;
		try { return JSON.parse(sale.correctedFields).length; } catch { return 0; }
	});

	/** @param {any} li */
	const marginPct = (li) => {
		if (!li.margin) return null;
		const v = parseFloat(li.margin);
		return isNaN(v) ? null : `${(v * 100).toFixed(1)}%`;
	};
</script>

<svelte:head>
	<title>{sale.documentTitle ?? 'Sale'} | FuzzyFinance</title>
</svelte:head>

<div class="max-w-3xl mx-auto flex flex-col gap-6">
	<!-- Header row -->
	<div class="flex items-center justify-between gap-4 flex-wrap">
		<a href="/dashboard/sales" class="font-mono text-[10px] uppercase font-black text-(--color-muted-foreground) no-underline hover:text-(--color-fg) transition-colors">
			← ALL SALES
		</a>
		<div class="flex items-center gap-3 flex-wrap">
			<ReceiptStatusBadge status={sale.status} />

			{#if sale.status !== 'staged' && correctedCount > 0}
				<span class="font-mono text-[9px] border border-(--color-warning-border) text-(--color-warning) bg-(--color-warning-muted) px-2 py-0.5 font-bold uppercase">
					EDITED · {correctedCount} FIELD{correctedCount === 1 ? '' : 'S'}
				</span>
			{/if}

			{#if sale.status === 'staged'}
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
				<Button variant="danger" onclick={deleteSale} class="text-xs font-black uppercase tracking-widest" disabled={deleting}>
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

	{#if sale.errorMessage?.startsWith('NOT_RELEVANT:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DOCUMENT NOT RECOGNISED AS A SALES RECORD</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				{sale.errorMessage.replace('NOT_RELEVANT:', '').trim()}
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				Please upload a sales invoice, sales order, revenue report, or similar financial document.
			</p>
		</div>
	{/if}

	<!-- Main fields -->
	<Card title={editing ? 'Edit Sale' : (sale.documentTitle ?? 'Sale Document')}>
		{#if editing && sale.status === 'staged'}
			<div class="grid grid-cols-2 gap-x-8 gap-y-4">
				{#each [
					{ key: 'documentTitle', label: 'DOCUMENT TITLE' },
					{ key: 'totalRevenue',  label: 'TOTAL REVENUE' },
					{ key: 'totalCost',     label: 'TOTAL COST' },
					{ key: 'totalMargin',   label: 'TOTAL MARGIN' },
					{ key: 'currency',      label: 'CURRENCY' },
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
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SALE DATE</span>
					<input
						type="date"
						class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-bold text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
						bind:value={form.saleDate}
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
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS <span class="normal-case tracking-normal font-normal">(comma-separated)</span></span>
				<input
					type="text"
					placeholder="e.g. q1-sales, products, bulk"
					class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
					bind:value={form.tags}
				/>
			</div>
		{:else}
			{@const saleTags = (() => { try { return JSON.parse(sale.tags ?? '[]'); } catch { return []; } })()}
			<div class="grid grid-cols-2 gap-x-8 gap-y-4">
				{#each [
					['DOCUMENT TITLE', sale.documentTitle],
					['DATE',           fmtDate(sale.saleDate)],
					['TOTAL REVENUE',  sale.totalRevenue ? `${sale.totalRevenue} ${sale.currency ?? ''}`.trim() : null],
					['TOTAL COST',     sale.totalCost    ? `${sale.totalCost} ${sale.currency ?? ''}`.trim()    : null],
					['TOTAL MARGIN',   sale.totalMargin  ? `${sale.totalMargin} ${sale.currency ?? ''}`.trim()  : null],
					['CURRENCY',       sale.currency],
					['CATEGORY',       sale.category]
				] as [label, value] (label)}
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">{label}</span>
						<span class="font-bold text-xs text-(--color-fg)">{value ?? '—'}</span>
					</div>
				{/each}

				{#if saleTags.length > 0}
					<div class="flex flex-col gap-1 col-span-2">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS</span>
						<div class="flex flex-wrap gap-1">
							{#each saleTags as tag (tag)}
								<Badge label={tag} size="xs" />
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">FILE</span>
					{#if driveFileUrl}
						<a href={driveFileUrl} target="_blank" rel="noopener noreferrer"
							class="font-bold text-xs text-(--color-fg) underline decoration-dotted hover:decoration-solid"
						>{sale.rawFileName ?? '—'}</a>
					{:else}
						<span class="font-bold text-xs text-(--color-fg)">{sale.rawFileName ?? '—'}</span>
					{/if}
				</div>
			</div>

			{#if sale.notes}
				<div class="mt-6 border-t border-(--color-border) pt-4">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground) block mb-2">NOTES</span>
					<p class="font-mono text-xs text-(--color-fg)">{sale.notes}</p>
				</div>
			{/if}
		{/if}
	</Card>

	<!-- Line items -->
	{#if editing && sale.status === 'staged'}
		<Card title="Line Items">
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse text-xs">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Description', 'Type', 'Units', 'Buy Price', 'Sell Price', 'Total', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-3 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each form.lineItems as li (li.id)}
							<tr class="border-b border-(--color-border)">
								<td class="py-1 pr-2">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.description} />
								</td>
								<td class="py-1 pr-2 w-24">
									<select class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none" bind:value={li.type}>
										<option value="">—</option>
										<option value="product">Product</option>
										<option value="service">Service</option>
									</select>
								</td>
								<td class="py-1 pr-2 w-16">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.unitsSold} />
								</td>
								<td class="py-1 pr-2 w-20">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.buyPrice} />
								</td>
								<td class="py-1 pr-2 w-20">
									<input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.sellPrice} />
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
		<Card title="Line Items ({lineItems.length})">
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Description', 'Type', 'Units', 'Buy Price', 'Sell Price', 'Margin', 'Total', 'Total Cost'] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each lineItems as li (li.id)}
							<tr class="border-b border-(--color-border)">
								<td class="py-2 pr-4 text-xs text-(--color-fg) max-w-48 truncate">{li.description ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[9px] uppercase text-(--color-muted-foreground)">{li.type ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.unitsSold ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.buyPrice ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.sellPrice ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{marginPct(li) ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] font-bold text-(--color-fg)">{li.total ?? '—'}</td>
								<td class="py-2 pr-4 font-mono text-[10px] text-(--color-fg)">{li.totalCost ?? '—'}</td>
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
			<div class="border-2 {sale.driveFileId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">CLOUD STORAGE</span>
				{#if sale.driveFileId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{sale.driveProvider === 'google' ? 'GOOGLE DRIVE' : 'ONEDRIVE'}</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">UPLOADED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">{sale.status === 'staged' ? 'PENDING COMMIT' : 'NOT SYNCED'}</span>
				{/if}
			</div>

			<div class="border-2 {sale.sheetId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SPREADSHEET</span>
				{#if sale.sheetId}
					<span class="font-black text-xs text-(--color-fg) uppercase">{sale.sheetProvider === 'google' ? 'GOOGLE SHEETS' : 'EXCEL'}</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">ROW APPENDED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">{sale.status === 'staged' ? 'PENDING COMMIT' : 'NOT SYNCED'}</span>
				{/if}
			</div>

			<div class="border-2 {sale.vectorId ? 'border-(--color-fg)' : 'border-(--color-border)'} p-4 flex flex-col gap-2">
				<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">SEMANTIC INDEX</span>
				{#if sale.vectorId}
					<span class="font-black text-xs text-(--color-fg) uppercase">VECTORIZE</span>
					<span class="font-mono text-[9px] text-(--color-success) uppercase font-bold">INDEXED</span>
				{:else}
					<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase">NOT INDEXED</span>
				{/if}
			</div>
		</div>

		{#if sale.errorMessage}
			<div class="mt-4 border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-3 font-mono text-[10px] text-(--color-danger) uppercase">
				LAST ERROR: {sale.errorMessage}
			</div>
		{/if}
	</Card>
</div>
