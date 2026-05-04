<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let sale       = $derived(data.sale);
	let lineItems  = $derived(data.lineItems);
	let receivable = $derived(data.receivable);

	let activeTab = $state(/** @type {'info' | 'items' | 'receivable'} */ ('info'));

	let retrying   = $state(false);
	let deleting   = $state(false);
	let editing    = $state(false);
	let saving     = $state(false);
	let committing = $state(false);
	let aborting   = $state(false);
	let saveError  = $state('');

	let openingNote        = $state('');
	let updateNote         = $state('');
	let closingNote        = $state('');
	let openingReceivable  = $state(false);
	let addingUpdate       = $state(false);
	let closingReceivable  = $state(false);
	let deletingReceivable = $state(false);
	let receivableError    = $state('');
	let showAddUpdate      = $state(false);
	let showCloseForm      = $state(false);

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
		form.saleDate      = sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : '';
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
		activeTab = 'info';
		editing = true;
	}

	async function retrySync() {
		retrying = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}/retry-sync`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally { retrying = false; }
	}

	async function deleteSale() {
		if (!confirm('Delete this sale? This cannot be undone.')) return;
		deleting = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
			if (res.ok) goto('/dashboard/sales');
		} finally { deleting = false; }
	}

	async function saveEdits() {
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) })
			});
			if (!res.ok) { saveError = await res.text(); return; }
			await invalidateAll();
			editing = false;
		} finally { saving = false; }
	}

	async function doCommit() {
		if (!confirm('Commit this sale to cloud storage? This cannot be undone.')) return;
		committing = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}/commit`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally { committing = false; }
	}

	async function doAbort() {
		if (!confirm('Discard this sale? It will be permanently deleted.')) return;
		aborting = true;
		try {
			const res = await fetch(`/api/sales/${sale.id}/abort`, { method: 'POST' });
			if (res.ok) goto('/dashboard/sales');
		} finally { aborting = false; }
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

	async function openReceivable() {
		openingReceivable = true;
		receivableError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}/receivable`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: openingNote.trim() || undefined })
			});
			if (!res.ok) { receivableError = await res.text(); return; }
			openingNote = '';
			await invalidateAll();
		} finally { openingReceivable = false; }
	}

	async function addReceivableUpdate() {
		if (!updateNote.trim()) return;
		addingUpdate = true;
		receivableError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}/receivable/updates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: updateNote.trim() })
			});
			if (!res.ok) { receivableError = await res.text(); return; }
			updateNote = '';
			showAddUpdate = false;
			await invalidateAll();
		} finally { addingUpdate = false; }
	}

	async function closeReceivable() {
		closingReceivable = true;
		receivableError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}/receivable`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: closingNote.trim() || undefined })
			});
			if (!res.ok) { receivableError = await res.text(); return; }
			closingNote = '';
			showCloseForm = false;
			await invalidateAll();
		} finally { closingReceivable = false; }
	}

	async function deleteReceivable() {
		if (!confirm('Remove this receivable? All updates will be deleted.')) return;
		deletingReceivable = true;
		receivableError = '';
		try {
			const res = await fetch(`/api/sales/${sale.id}/receivable`, { method: 'DELETE' });
			if (!res.ok) { receivableError = await res.text(); return; }
			await invalidateAll();
		} finally { deletingReceivable = false; }
	}

	/** @param {Date | number | null | undefined} d */
	const fmtDate = (d) => d ? new Date(/** @type {any} */ (d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
	/** @param {Date | number | null | undefined} d */
	const fmtDateTime = (d) => d ? new Date(/** @type {any} */ (d)).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

	let driveFileUrl = $derived.by(() => {
		if (!sale.driveFileId) return null;
		if (sale.driveProvider === 'google') return `https://drive.google.com/file/d/${sale.driveFileId}/view`;
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
				{#if sale.status === 'complete_no_sync' || sale.status === 'failed'}
					<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
						{retrying ? 'RETRYING...' : 'RETRY SYNC'}
					</Button>
				{/if}
				<Button variant="danger" onclick={deleteSale} class="text-xs font-black uppercase tracking-widest" disabled={deleting}>
					{deleting ? 'DELETING...' : 'DELETE'}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Alert banners -->
	{#if saveError}
		<div class="border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-3 font-mono text-[10px] text-(--color-danger) uppercase">
			SAVE ERROR: {saveError}
		</div>
	{/if}

	{#if sale.errorMessage?.startsWith('AUTH_REQUIRED:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">CLOUD SYNC FAILED — RE-AUTHENTICATION REQUIRED</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				Your Google or Microsoft connection has expired or been revoked. Re-connect your account and then retry the sync.
			</p>
			<div class="pl-4 mt-1 flex items-center gap-4">
				<a href="/dashboard/integrations" class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid">
					MANAGE INTEGRATIONS →
				</a>
				{#if sale.status === 'complete_no_sync'}
					<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
						{retrying ? 'RETRYING...' : 'RETRY SYNC'}
					</Button>
				{/if}
			</div>
		</div>
	{:else if sale.errorMessage?.startsWith('NOT_RELEVANT:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DOCUMENT NOT RECOGNISED AS A SALES RECORD</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				{sale.errorMessage.replace('NOT_RELEVANT:', '').trim()}
			</p>
		</div>
	{/if}

	<!-- Tab bar -->
	<div class="flex border-b-2 border-(--color-border)">
		{#each [
			{ id: 'info',       label: 'INFO' },
			{ id: 'items',      label: lineItems.length > 0 ? `LINE ITEMS (${lineItems.length})` : 'LINE ITEMS' },
			{ id: 'receivable', label: receivable ? `RECEIVABLE · ${receivable.status.toUpperCase()}` : 'RECEIVABLE' }
		] as tab (tab.id)}
			<button
				onclick={() => activeTab = /** @type {'info' | 'items' | 'receivable'} */ (tab.id)}
				class="px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black transition-colors {activeTab === tab.id ? 'text-(--color-fg) border-b-2 border-(--color-fg) -mb-[2px]' : 'text-(--color-muted-foreground) hover:text-(--color-fg)'}"
			>{tab.label}</button>
		{/each}
	</div>

	<!-- INFO tab -->
	{#if activeTab === 'info'}
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
						<input type="date"
							class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-bold text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
							bind:value={form.saleDate}
						/>
					</div>
				</div>
				<div class="mt-4 flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">NOTES</span>
					<textarea rows="3"
						class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
						bind:value={form.notes}
					></textarea>
				</div>
				<div class="mt-4 flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS <span class="normal-case tracking-normal font-normal">(comma-separated)</span></span>
					<input type="text" placeholder="e.g. q1-sales, products, bulk"
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

		<!-- Sync Status -->
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
	{/if}

	<!-- LINE ITEMS tab -->
	{#if activeTab === 'items'}
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
									<td class="py-1 pr-2"><input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.description} /></td>
									<td class="py-1 pr-2 w-24">
										<select class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none" bind:value={li.type}>
											<option value="">—</option>
											<option value="product">Product</option>
											<option value="service">Service</option>
										</select>
									</td>
									<td class="py-1 pr-2 w-16"><input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.unitsSold} /></td>
									<td class="py-1 pr-2 w-20"><input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.buyPrice} /></td>
									<td class="py-1 pr-2 w-20"><input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.sellPrice} /></td>
									<td class="py-1 pr-2 w-20"><input class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)" bind:value={li.total} /></td>
									<td class="py-1 w-8">
										<button onclick={() => removeLineItem(li.id)} class="font-mono text-[10px] text-(--color-danger) hover:opacity-70 font-black" type="button">×</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<button onclick={addLineItem} type="button" class="mt-3 font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) border border-dashed border-(--color-border) px-3 py-1 transition-colors">
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
		{:else}
			<Card title="Line Items">
				<p class="font-mono text-xs text-(--color-muted-foreground) uppercase py-4 text-center">NO LINE ITEMS</p>
			</Card>
		{/if}
	{/if}

	<!-- RECEIVABLE tab -->
	{#if activeTab === 'receivable'}
		<Card title="Receivable">
			{#if receivable === null}
				<p class="font-mono text-xs text-(--color-muted-foreground) mb-4">
					No receivable open for this sale. Open one to track an outstanding payment owed to you.
				</p>
				<div class="flex flex-col gap-3 max-w-md">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">OPENING NOTE <span class="normal-case font-normal">(optional)</span></span>
						<textarea rows="3" bind:value={openingNote} placeholder="e.g. Invoice sent on May 2, payment due May 30..."
							class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
						></textarea>
					</div>
					{#if receivableError}
						<p class="font-mono text-[10px] text-(--color-danger)">{receivableError}</p>
					{/if}
					<div>
						<Button onclick={openReceivable} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={openingReceivable}>
							{openingReceivable ? 'OPENING...' : 'OPEN RECEIVABLE'}
						</Button>
					</div>
				</div>
			{:else}
				<!-- Timeline -->
				<div class="flex flex-col mb-4">
					<!-- Opened -->
					<div class="flex gap-3">
						<div class="flex flex-col items-center">
							<div class="w-2.5 h-2.5 rounded-full bg-(--color-fg) shrink-0 mt-0.5 border-2 border-(--color-fg)"></div>
							<div class="w-px flex-1 bg-(--color-border) min-h-[24px]"></div>
						</div>
						<div class="pb-5 flex-1">
							<span class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-muted-foreground)">OPENED · {fmtDateTime(receivable.openedAt)}</span>
						</div>
					</div>

					<!-- Update entries -->
					{#each receivable.updates as update, i (update.id)}
						{@const isLast = i === receivable.updates.length - 1}
						<div class="flex gap-3">
							<div class="flex flex-col items-center">
								<div class="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 border-2 {isLast && receivable.status === 'closed' ? 'bg-(--color-fg) border-(--color-fg)' : 'bg-(--color-bg) border-(--color-border)'}"></div>
								{#if !(isLast && receivable.status === 'closed')}
									<div class="w-px flex-1 bg-(--color-border) min-h-[24px]"></div>
								{/if}
							</div>
							<div class="pb-5 flex-1">
								<span class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-muted-foreground)">UPDATE · {fmtDateTime(update.createdAt)}</span>
								<p class="font-mono text-xs text-(--color-fg) mt-1">{update.note}</p>
							</div>
						</div>
					{/each}

					<!-- Closed marker -->
					{#if receivable.status === 'closed'}
						<div class="flex gap-3">
							<div class="flex flex-col items-center">
								<div class="w-2.5 h-2.5 rounded-full bg-(--color-success) shrink-0 mt-0.5 border-2 border-(--color-success)"></div>
							</div>
							<div class="pb-2 flex-1">
								<span class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-success)">CLOSED · {fmtDateTime(receivable.closedAt)}</span>
							</div>
						</div>
					{/if}
				</div>

				{#if receivableError}
					<p class="font-mono text-[10px] text-(--color-danger) mb-3">{receivableError}</p>
				{/if}

				<!-- Actions -->
				{#if receivable.status === 'open'}
					{#if showAddUpdate}
						<div class="flex flex-col gap-2 max-w-md border-t border-(--color-border) pt-4">
							<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">ADD UPDATE</span>
							<textarea rows="2" bind:value={updateNote} placeholder="Add a note..."
								class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
							></textarea>
							<div class="flex gap-2">
								<Button onclick={addReceivableUpdate} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={addingUpdate || !updateNote.trim()}>
									{addingUpdate ? 'SAVING...' : 'SAVE UPDATE'}
								</Button>
								<Button onclick={() => { showAddUpdate = false; updateNote = ''; }} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={addingUpdate}>
									CANCEL
								</Button>
							</div>
						</div>
					{:else if showCloseForm}
						<div class="flex flex-col gap-2 max-w-md border-t border-(--color-border) pt-4">
							<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">CLOSE RECEIVABLE — OPTIONAL NOTE</span>
							<textarea rows="2" bind:value={closingNote} placeholder="e.g. Payment received in full..."
								class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
							></textarea>
							<div class="flex gap-2">
								<Button onclick={closeReceivable} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={closingReceivable}>
									{closingReceivable ? 'CLOSING...' : 'CONFIRM CLOSE'}
								</Button>
								<Button onclick={() => { showCloseForm = false; closingNote = ''; }} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={closingReceivable}>
									CANCEL
								</Button>
							</div>
						</div>
					{:else}
						<div class="flex gap-2 flex-wrap border-t border-(--color-border) pt-4">
							<Button onclick={() => showAddUpdate = true} variant="secondary" class="text-xs font-black uppercase tracking-widest">
								+ ADD UPDATE
							</Button>
							<Button onclick={() => showCloseForm = true} variant="secondary" class="text-xs font-black uppercase tracking-widest">
								CLOSE RECEIVABLE
							</Button>
							<Button onclick={deleteReceivable} variant="danger" class="text-xs font-black uppercase tracking-widest" disabled={deletingReceivable}>
								{deletingReceivable ? 'REMOVING...' : 'REMOVE'}
							</Button>
						</div>
					{/if}
				{:else}
					<div class="flex gap-2 border-t border-(--color-border) pt-4">
						<Button onclick={deleteReceivable} variant="danger" class="text-xs font-black uppercase tracking-widest" disabled={deletingReceivable}>
							{deletingReceivable ? 'REMOVING...' : 'REMOVE RECEIVABLE'}
						</Button>
					</div>
				{/if}
			{/if}

			<!-- Disclaimer -->
			<div class="mt-6 pt-4 border-t border-(--color-border)">
				<p class="font-mono text-[9px] text-(--color-muted-foreground)">
					This tool is for reference tracking only and is not intended for use in accounting. Consult a qualified accountant for financial reporting.
				</p>
			</div>
		</Card>
	{/if}
</div>
