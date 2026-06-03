<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let receipt    = $derived(data.receipt);
	let lineItems  = $derived(data.lineItems);
	let payable    = $derived(data.payable);
	let categories = $derived(data.categories);
	let unitTypes  = $derived(data.unitTypes);

	let activeTab = $state(/** @type {'info' | 'items' | 'payable'} */ ('info'));

	/** @type {{ open: boolean; message: string; variant: 'default' | 'danger'; resolve: ((v: boolean) => void) | null }} */
	let dialog = $state({ open: false, message: '', variant: 'default', resolve: null });

	/**
	 * @param {string} message
	 * @param {{ variant?: 'default' | 'danger' }} [opts]
	 * @returns {Promise<boolean>}
	 */
	function showConfirm(message, opts = {}) {
		return new Promise(resolve => {
			dialog = { open: true, message, variant: opts.variant ?? 'default', resolve };
		});
	}

	function dialogConfirm() {
		const r = dialog.resolve;
		dialog = { open: false, message: '', variant: 'default', resolve: null };
		r?.(true);
	}

	function dialogCancel() {
		const r = dialog.resolve;
		dialog = { open: false, message: '', variant: 'default', resolve: null };
		r?.(false);
	}

	let retrying       = $state(false);
	let deleting       = $state(false);
	let editing        = $state(false);
	let saving         = $state(false);
	let committing     = $state(false);
	let aborting       = $state(false);
	let saveError      = $state('');
	let reclassifying  = $state(false);
	let reclassifyMsg  = $state('');

	let openingNote     = $state('');
	let updateNote      = $state('');
	let closingNote     = $state('');
	let openingPayable  = $state(false);
	let addingUpdate    = $state(false);
	let closingPayable  = $state(false);
	let deletingPayable = $state(false);
	let payableError    = $state('');
	let showAddUpdate   = $state(false);
	let showCloseForm   = $state(false);

	/**
	 * @typedef {{ id: string; description: string; qty: string; unitPrice: string; total: string; unitSize: string; unitType: string; primaryCategory: string; secondaryCategory: string }} FormLineItem
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
			id:                li.id,
			description:       li.description       ?? '',
			qty:               li.qty               ?? '',
			unitPrice:         li.unitPrice         ?? '',
			total:             li.total             ?? '',
			unitSize:          li.unitSize          ?? '',
			unitType:          li.unitType          ?? '',
			primaryCategory:   li.primaryCategory   ?? '',
			secondaryCategory: li.secondaryCategory ?? ''
		}));
		activeTab = 'info';
		editing = true;
	}

	async function retrySync() {
		retrying = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/retry-sync`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally { retrying = false; }
	}

	async function reclassify() {
		reclassifying = true;
		reclassifyMsg = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/reclassify`, { method: 'POST' });
			if (!res.ok) { reclassifyMsg = await res.text(); return; }
			const result = await res.json();
			reclassifyMsg = `Reclassified ${result.updated} item${result.updated === 1 ? '' : 's'}`;
			await invalidateAll();
		} catch (e) {
			reclassifyMsg = e instanceof Error ? e.message : 'Reclassify failed';
		} finally { reclassifying = false; }
	}

	async function deleteReceipt() {
		if (!await showConfirm('Delete this expense? This cannot be undone.', { variant: 'danger' })) return;
		deleting = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' });
			if (res.ok) goto('/dashboard/receipts');
		} finally { deleting = false; }
	}

	async function saveEdits() {
		saving = true;
		saveError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}`, {
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
		if (!await showConfirm('Commit this expense to cloud storage? This cannot be undone.')) return;
		committing = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/commit`, { method: 'POST' });
			if (res.ok) await invalidateAll();
		} finally { committing = false; }
	}

	async function doAbort() {
		if (!await showConfirm('Discard this expense? It will be permanently deleted.', { variant: 'danger' })) return;
		aborting = true;
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/abort`, { method: 'POST' });
			if (res.ok) goto('/dashboard/receipts');
		} finally { aborting = false; }
	}

	function addLineItem() {
		form.lineItems = [...form.lineItems, {
			id: crypto.randomUUID(),
			description: '', qty: '', unitPrice: '', total: '',
			unitSize: '', unitType: '',
			primaryCategory: '', secondaryCategory: ''
		}];
	}

	/**
	 * @param {string} primary
	 * @returns {string[]}
	 */
	function getSecondaryOptions(primary) {
		if (!primary || primary === 'General') return [];
		const cat = categories.find(c => c.primary === primary);
		return cat?.secondary ?? [];
	}

	let groupedItems = $derived.by(() => {
		const categoryOrder = categories.map(/** @param {{primary:string}} c */ c => c.primary);

		/** @type {Array<{primary: string, sections: Array<{secondary: string, items: any[]}>}>} */
		const groups = [];

		for (const li of lineItems) {
			const primary = li.primaryCategory || 'General';
			const secondary = li.secondaryCategory || '';

			let group = groups.find(g => g.primary === primary);
			if (!group) { group = { primary, sections: [] }; groups.push(group); }

			let section = group.sections.find(s => s.secondary === secondary);
			if (!section) { section = { secondary, items: [] }; group.sections.push(section); }

			section.items.push(li);
		}

		groups.sort((a, b) => {
			if (a.primary === 'General') return 1;
			if (b.primary === 'General') return -1;
			const ai = categoryOrder.indexOf(a.primary);
			const bi = categoryOrder.indexOf(b.primary);
			return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
		});

		for (const group of groups) {
			const cat = categories.find(/** @param {{primary:string}} c */ c => c.primary === group.primary);
			const secOrder = /** @type {string[]} */ (cat?.secondary ?? []);
			group.sections.sort((a, b) => {
				if (!a.secondary && b.secondary) return 1;
				if (a.secondary && !b.secondary) return -1;
				const ai = secOrder.indexOf(a.secondary);
				const bi = secOrder.indexOf(b.secondary);
				if (ai === -1 && bi === -1) return a.secondary.localeCompare(b.secondary);
				if (ai === -1) return 1;
				if (bi === -1) return -1;
				return ai - bi;
			});
		}

		return groups;
	});

	/** @param {string} id */
	function removeLineItem(id) {
		form.lineItems = form.lineItems.filter(li => li.id !== id);
	}

	async function openPayable() {
		openingPayable = true;
		payableError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/payable`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: openingNote.trim() || undefined })
			});
			if (!res.ok) { payableError = await res.text(); return; }
			openingNote = '';
			await invalidateAll();
		} finally { openingPayable = false; }
	}

	async function addPayableUpdate() {
		if (!updateNote.trim()) return;
		addingUpdate = true;
		payableError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/payable/updates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: updateNote.trim() })
			});
			if (!res.ok) { payableError = await res.text(); return; }
			updateNote = '';
			showAddUpdate = false;
			await invalidateAll();
		} finally { addingUpdate = false; }
	}

	async function closePayable() {
		closingPayable = true;
		payableError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/payable`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: closingNote.trim() || undefined })
			});
			if (!res.ok) { payableError = await res.text(); return; }
			closingNote = '';
			showCloseForm = false;
			await invalidateAll();
		} finally { closingPayable = false; }
	}

	async function deletePayable() {
		if (!await showConfirm('Remove this payable? All updates will be deleted.', { variant: 'danger' })) return;
		deletingPayable = true;
		payableError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}/payable`, { method: 'DELETE' });
			if (!res.ok) { payableError = await res.text(); return; }
			await invalidateAll();
		} finally { deletingPayable = false; }
	}

	/** @param {Date | number | null | undefined} d */
	const fmtDate = (d) => d ? new Date(/** @type {any} */ (d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
	/** @param {Date | number | null | undefined} d */
	const fmtDateTime = (d) => d ? new Date(/** @type {any} */ (d)).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

	let driveFileUrl = $derived.by(() => {
		if (!receipt.driveFileId) return null;
		if (receipt.driveProvider === 'google') return `https://drive.google.com/file/d/${receipt.driveFileId}/view`;
		return null;
	});

	let correctedCount = $derived.by(() => {
		if (!receipt.correctedFields) return 0;
		try { return JSON.parse(receipt.correctedFields).length; } catch { return 0; }
	});

	let recovering = $state(false);

	$effect(() => {
		if (receipt.status !== 'processing') return;
		let stopped = false;
		recovering = true;
		(async () => {
			while (!stopped) {
				await new Promise(r => setTimeout(r, 3000));
				if (stopped) break;
				try {
					const res = await fetch(`/api/receipts/${receipt.id}/status`);
					if (!res.ok || stopped) break;
					const body = await res.json();
					if (body.status !== 'processing') {
						await invalidateAll();
						break;
					}
				} catch { break; }
			}
			if (!stopped) recovering = false;
		})();
		return () => { stopped = true; recovering = false; };
	});
</script>

<svelte:head>
	<title>{receipt.merchantName ?? 'Expense'} | FuzzyFinance</title>
</svelte:head>

<div class="max-w-3xl mx-auto flex flex-col gap-6">
	<!-- Header row -->
	<div class="flex items-center justify-between gap-4 flex-wrap">
		<a href="/dashboard/receipts" class="font-mono text-[10px] uppercase font-black text-(--color-muted-foreground) no-underline hover:text-(--color-fg) transition-colors">
			← ALL EXPENSES
		</a>
		<div class="flex items-center gap-3 flex-wrap">
			<ReceiptStatusBadge status={receipt.status} />

			{#if recovering}
				<span class="font-mono text-[9px] text-(--color-muted-foreground) uppercase animate-pulse">
					AUTO-CHECKING...
				</span>
			{/if}

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

	<!-- Alert banners -->
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
				<a href="/dashboard/integrations" class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid">
					MANAGE INTEGRATIONS →
				</a>
				{#if receipt.status === 'complete_no_sync'}
					<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
						{retrying ? 'RETRYING...' : 'RETRY SYNC'}
					</Button>
				{/if}
			</div>
		</div>
	{:else if receipt.status === 'complete_no_sync'}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">CLOUD SYNC FAILED</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				This expense could not be synced to your cloud integration. Re-authorizing your integration may resolve the issue.
			</p>
			<div class="pl-4 mt-1 flex items-center gap-4">
				<a href="/dashboard/integrations" class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid">
					RE-AUTHORIZE INTEGRATION →
				</a>
				<Button variant="secondary" onclick={retrySync} class="text-xs font-black uppercase tracking-widest" disabled={retrying}>
					{retrying ? 'RETRYING...' : 'RETRY SYNC'}
				</Button>
			</div>
		</div>
	{:else if receipt.errorMessage?.startsWith('NOT_RELEVANT:')}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DOCUMENT NOT RECOGNISED AS AN EXPENSE DOCUMENT</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				{receipt.errorMessage.replace('NOT_RELEVANT:', '').trim()}
			</p>
		</div>
	{/if}

	{#if receipt.authenticityRisk === 'high' || receipt.authenticityRisk === 'medium'}
		{@const authSignals = (() => { try { return JSON.parse(receipt.authenticitySignals ?? '[]'); } catch { return []; } })()}
		<div class="border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-danger-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-danger)">
					AUTHENTICITY {receipt.authenticityRisk === 'high' ? 'WARNING' : 'CONCERN'} — {receipt.authenticityRisk?.toUpperCase()} RISK
				</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				This expense document shows signals that may indicate it was digitally generated or altered. Please verify before committing.
			</p>
			{#if authSignals.length}
				<ul class="pl-4 flex flex-col gap-0.5">
					{#each authSignals as signal (signal)}
						<li class="font-mono text-[10px] text-(--color-danger) before:content-['•'] before:mr-1.5">{signal}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if receipt.duplicateOf}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">POSSIBLE DUPLICATE EXPENSE</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				This expense may be a duplicate — it shares an expense or invoice number with an existing entry.
			</p>
			<div class="pl-4 mt-1">
				<a href="/dashboard/receipts/{receipt.duplicateOf}"
					class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid">
					VIEW SUSPECTED DUPLICATE →
				</a>
			</div>
		</div>
	{/if}

	<!-- Tab bar -->
	<div class="flex border-b-2 border-(--color-border)">
		{#each [
			{ id: 'info',    label: 'INFO' },
			{ id: 'items',   label: lineItems.length > 0 ? `LINE ITEMS (${lineItems.length})` : 'LINE ITEMS' },
			{ id: 'payable', label: payable ? `PAYABLE · ${payable.status.toUpperCase()}` : 'PAYABLE' }
		] as tab (tab.id)}
			<button
				onclick={() => activeTab = /** @type {'info' | 'items' | 'payable'} */ (tab.id)}
				class="px-4 py-2 font-mono text-[10px] uppercase tracking-widest font-black transition-colors {activeTab === tab.id ? 'text-(--color-fg) border-b-2 border-(--color-fg) -mb-[2px]' : 'text-(--color-muted-foreground) hover:text-(--color-fg)'}"
			>{tab.label}</button>
		{/each}
	</div>

	<!-- INFO tab -->
	{#if activeTab === 'info'}
		<Card title={editing ? 'Edit Expense' : (receipt.merchantName ?? 'Expense')}>
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
						<input type="date"
							class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-bold text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
							bind:value={form.receiptDate}
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
					<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">TAGS <span class="normal-case tracking-normal font-normal text-(--color-muted-foreground)">(comma-separated)</span></span>
					<input type="text" placeholder="e.g. business-meal, transport, recurring"
						class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg)"
						bind:value={form.tags}
					/>
				</div>
			{:else}
				{@const receiptTags = (() => { try { return JSON.parse(receipt.tags ?? '[]'); } catch { return []; } })()}
				<div class="grid grid-cols-2 gap-x-8 gap-y-4">
					{#each [
						['MERCHANT',       receipt.merchantName],
						['DATE',           fmtDate(receipt.receiptDate)],
						['TOTAL',          receipt.total ? `${receipt.total} ${receipt.currency ?? ''}`.trim() : null],
						['SUBTOTAL',       receipt.subtotal],
						['TAX',            receipt.tax],
						['TIP',            receipt.tip],
						['CURRENCY',       receipt.currency],
						['PAYMENT METHOD', receipt.paymentMethod],
						['RECEIPT NO.',    receipt.receiptNumber],
						['INVOICE NO.',    receipt.invoiceNumber],
						['CATEGORY',       receipt.category]
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

					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">FILE</span>
						{#if driveFileUrl}
							<a href={driveFileUrl} target="_blank" rel="noopener noreferrer"
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

		<!-- Sync Status -->
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
	{/if}

	<!-- LINE ITEMS tab -->
	{#if activeTab === 'items'}
		{#if editing && receipt.status === 'staged'}
			<!-- Edit mode: flat list with category selects per item -->
			<Card title="Line Items">
				<div class="flex flex-col divide-y divide-(--color-border)">
					{#each form.lineItems as li (li.id)}
						<div class="py-2 first:pt-0">
							<!-- Numeric fields row -->
							<div class="flex gap-2 items-center">
								<div class="flex-1 min-w-0">
									<input
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) text-xs px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										placeholder="Description"
										bind:value={li.description}
									/>
								</div>
								<div class="w-12 shrink-0">
									<input
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										placeholder="Qty"
										bind:value={li.qty}
									/>
								</div>
								<div class="w-20 shrink-0">
									<input
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										placeholder="Unit"
										bind:value={li.unitPrice}
									/>
								</div>
								<div class="w-20 shrink-0">
									<input
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										placeholder="Total"
										bind:value={li.total}
									/>
								</div>
								<button
									onclick={() => removeLineItem(li.id)}
									class="font-mono text-[10px] text-(--color-danger) hover:opacity-70 font-black shrink-0"
									type="button"
								>×</button>
							</div>
							<!-- Unit size / type row -->
							<div class="flex gap-2 mt-1 items-center">
								<div class="w-20 shrink-0">
									<input
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										placeholder="Size (e.g. 2)"
										bind:value={li.unitSize}
									/>
								</div>
								<div class="w-28 shrink-0">
									<select
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[10px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
										bind:value={li.unitType}
									>
										<option value="">— unit —</option>
										{#each unitTypes as group (group.group)}
											<optgroup label={group.group}>
												{#each group.types as t (t)}
													<option value={t}>{t}</option>
												{/each}
											</optgroup>
										{/each}
									</select>
								</div>
							</div>
							<!-- Category selects row -->
							<div class="flex gap-2 mt-1.5">
								<div class="flex-1 min-w-0">
									<select
										class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[9px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg) uppercase"
										bind:value={li.primaryCategory}
										oninput={() => { li.secondaryCategory = ''; }}
									>
										<option value="">— PRIMARY —</option>
										<option value="General">General</option>
										{#each categories as cat (cat.primary)}
											<option value={cat.primary}>{cat.primary}</option>
										{/each}
									</select>
								</div>
								<div class="flex-1 min-w-0">
									{#if getSecondaryOptions(li.primaryCategory).length > 0}
										<select
											class="border border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-[9px] px-1 py-0.5 w-full focus:outline-none focus:border-(--color-fg)"
											bind:value={li.secondaryCategory}
										>
											<option value="">— SECONDARY —</option>
											{#each getSecondaryOptions(li.primaryCategory) as sec (sec)}
												<option value={sec}>{sec}</option>
											{/each}
										</select>
									{:else}
										<select
											class="border border-(--color-border) bg-(--color-bg) text-(--color-muted-foreground) font-mono text-[9px] px-1 py-0.5 w-full"
											disabled
										>
											<option>— N/A —</option>
										</select>
									{/if}
								</div>
							</div>
						</div>
					{/each}
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
			<!-- Read-only: grouped tree view -->
			<Card title="Line Items ({lineItems.length})">
				<!-- Reclassify action -->
				<div class="flex items-center justify-end gap-3 mb-2">
					{#if reclassifyMsg}
						<span class="font-mono text-[10px] text-(--color-muted-foreground)">{reclassifyMsg}</span>
					{/if}
					<button
						onclick={reclassify}
						disabled={reclassifying}
						class="border-2 border-(--color-border) px-3 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors disabled:opacity-50 disabled:cursor-wait"
						title="Send line items to Gemini for re-categorisation"
					>
						{reclassifying ? 'RECLASSIFYING…' : 'RECLASSIFY ↻'}
					</button>
				</div>

				<!-- Column legend -->
				<div class="flex gap-3 pb-2 mb-1 border-b-2 border-(--color-border)" style="padding-left: 1rem">
					<span class="flex-1 font-mono text-[8px] uppercase text-(--color-muted-foreground)">Description</span>
					<span class="w-8 shrink-0 text-right font-mono text-[8px] uppercase text-(--color-muted-foreground)">Qty</span>
					<span class="w-16 shrink-0 text-right font-mono text-[8px] uppercase text-(--color-muted-foreground)">Unit</span>
					<span class="w-16 shrink-0 text-right font-mono text-[8px] uppercase text-(--color-muted-foreground)">Total</span>
				</div>

				{#each groupedItems as group (group.primary)}
					<div class="mt-3 first:mt-0">
						<!-- Primary category header -->
						<div class="py-1 border-b border-(--color-border)">
							<span class="font-mono text-[9px] font-black uppercase tracking-widest text-(--color-fg)">{group.primary}</span>
						</div>

						{#each group.sections as section (section.secondary)}
							{#if section.secondary}
								<!-- Secondary sub-header -->
								<div class="pt-1.5 pb-0.5" style="padding-left: 1rem">
									<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">{section.secondary}</span>
								</div>
							{/if}

							<!-- Item rows -->
							{#each section.items as li (li.id)}
								<div
									class="flex gap-3 py-1.5 border-b border-(--color-border) items-baseline"
									style="padding-left: {section.secondary ? '2rem' : '1rem'}"
								>
									<span class="flex-1 min-w-0">
										<span class="block text-xs text-(--color-fg) break-words">{li.description ?? '—'}</span>
										{#if li.unitSize}
											<span class="font-mono text-[9px] text-(--color-muted-foreground)">{li.unitSize}{li.unitType ? ' ' + li.unitType : ''}</span>
										{/if}
									</span>
									<span class="w-8 shrink-0 text-right font-mono text-[10px] text-(--color-muted-foreground)">{li.qty ?? '—'}</span>
									<span class="w-16 shrink-0 text-right font-mono text-[10px] text-(--color-fg)">{li.unitPrice ?? '—'}</span>
									<span class="w-16 shrink-0 text-right font-mono text-[10px] font-bold text-(--color-fg)">{li.total ?? '—'}</span>
								</div>
							{/each}
						{/each}
					</div>
				{/each}
			</Card>
		{:else}
			<Card title="Line Items">
				<p class="font-mono text-xs text-(--color-muted-foreground) uppercase py-4 text-center">NO LINE ITEMS</p>
			</Card>
		{/if}
	{/if}

	<Dialog
		open={dialog.open}
		message={dialog.message}
		variant={dialog.variant}
		onconfirm={dialogConfirm}
		oncancel={dialogCancel}
	/>

	<!-- PAYABLE tab -->
	{#if activeTab === 'payable'}
		<Card title="Payable">
			{#if payable === null}
				<p class="font-mono text-xs text-(--color-muted-foreground) mb-4">
					No payable open for this receipt. Open one to track an outstanding payment.
				</p>
				<div class="flex flex-col gap-3 max-w-md">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">OPENING NOTE <span class="normal-case font-normal">(optional)</span></span>
						<textarea rows="3" bind:value={openingNote} placeholder="e.g. Invoice sent to client..."
							class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
						></textarea>
					</div>
					{#if payableError}
						<p class="font-mono text-[10px] text-(--color-danger)">{payableError}</p>
					{/if}
					<div>
						<Button onclick={openPayable} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={openingPayable}>
							{openingPayable ? 'OPENING...' : 'OPEN PAYABLE'}
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
							<span class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-muted-foreground)">OPENED · {fmtDateTime(payable.openedAt)}</span>
						</div>
					</div>

					<!-- Update entries -->
					{#each payable.updates as update, i (update.id)}
						{@const isLast = i === payable.updates.length - 1}
						<div class="flex gap-3">
							<div class="flex flex-col items-center">
								<div class="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 border-2 {isLast && payable.status === 'closed' ? 'bg-(--color-fg) border-(--color-fg)' : 'bg-(--color-bg) border-(--color-border)'}"></div>
								{#if !(isLast && payable.status === 'closed')}
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
					{#if payable.status === 'closed'}
						<div class="flex gap-3">
							<div class="flex flex-col items-center">
								<div class="w-2.5 h-2.5 rounded-full bg-(--color-success) shrink-0 mt-0.5 border-2 border-(--color-success)"></div>
							</div>
							<div class="pb-2 flex-1">
								<span class="font-mono text-[9px] uppercase tracking-widest font-black text-(--color-success)">CLOSED · {fmtDateTime(payable.closedAt)}</span>
							</div>
						</div>
					{/if}
				</div>

				{#if payableError}
					<p class="font-mono text-[10px] text-(--color-danger) mb-3">{payableError}</p>
				{/if}

				<!-- Actions -->
				{#if payable.status === 'open'}
					{#if showAddUpdate}
						<div class="flex flex-col gap-2 max-w-md border-t border-(--color-border) pt-4">
							<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">ADD UPDATE</span>
							<textarea rows="2" bind:value={updateNote} placeholder="Add a note..."
								class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
							></textarea>
							<div class="flex gap-2">
								<Button onclick={addPayableUpdate} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={addingUpdate || !updateNote.trim()}>
									{addingUpdate ? 'SAVING...' : 'SAVE UPDATE'}
								</Button>
								<Button onclick={() => { showAddUpdate = false; updateNote = ''; }} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={addingUpdate}>
									CANCEL
								</Button>
							</div>
						</div>
					{:else if showCloseForm}
						<div class="flex flex-col gap-2 max-w-md border-t border-(--color-border) pt-4">
							<span class="font-mono text-[9px] uppercase text-(--color-muted-foreground)">CLOSE PAYABLE — OPTIONAL NOTE</span>
							<textarea rows="2" bind:value={closingNote} placeholder="e.g. Payment received..."
								class="border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-(--color-fg) resize-y"
							></textarea>
							<div class="flex gap-2">
								<Button onclick={closePayable} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={closingPayable}>
									{closingPayable ? 'CLOSING...' : 'CONFIRM CLOSE'}
								</Button>
								<Button onclick={() => { showCloseForm = false; closingNote = ''; }} variant="secondary" class="text-xs font-black uppercase tracking-widest" disabled={closingPayable}>
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
								CLOSE PAYABLE
							</Button>
							<Button onclick={deletePayable} variant="danger" class="text-xs font-black uppercase tracking-widest" disabled={deletingPayable}>
								{deletingPayable ? 'REMOVING...' : 'REMOVE'}
							</Button>
						</div>
					{/if}
				{:else}
					<div class="flex gap-2 border-t border-(--color-border) pt-4">
						<Button onclick={deletePayable} variant="danger" class="text-xs font-black uppercase tracking-widest" disabled={deletingPayable}>
							{deletingPayable ? 'REMOVING...' : 'REMOVE PAYABLE'}
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
