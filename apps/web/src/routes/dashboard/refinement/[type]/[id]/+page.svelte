<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	const type      = $derived(data.type);
	const row       = $derived(data.row);
	const locked    = $derived(data.locked);
	const headerTotalField = $derived(type === 'receipt' ? 'total' : 'totalRevenue');
	const headerTotal = $derived(/** @type {any} */ (row)[headerTotalField]);

	let category = $state(row.category ?? '');

	/**
	 * @typedef {{ id?: string|null, description: string|null, total: string|null, primaryCategory: string|null, secondaryCategory: string|null, kind: 'standard'|'tax', aiSuggested: boolean, qty?: string|null, unitPrice?: string|null, unitsSold?: string|null, sellPrice?: string|null }} EditableLine
	 */

	/** @type {EditableLine[]} */
	let lines = $state(data.lineItems.map((/** @type {any} */ li) => ({
		id:                li.id,
		description:       li.description,
		total:             li.total,
		primaryCategory:   li.primaryCategory,
		secondaryCategory: li.secondaryCategory,
		kind:              /** @type {'standard'|'tax'} */ (li.kind ?? 'standard'),
		aiSuggested:       li.aiSuggested === true,
		qty:               li.qty ?? null,
		unitPrice:         li.unitPrice ?? null,
		unitsSold:         li.unitsSold ?? null,
		sellPrice:         li.sellPrice ?? null
	})));

	/** Mark a line as user-confirmed (so the next save re-indexes it as
	 *  training data). Called from each category-select onchange. */
	/** @param {number} i */
	function clearAiFlag(i) {
		if (lines[i].aiSuggested) lines[i].aiSuggested = false;
	}

	let categories = $state(data.categories);
	let saving      = $state(false);
	let saveError   = $state('');
	let saveOk      = $state(false);

	const hasExpected  = $derived(headerTotal != null && headerTotal !== '');
	const expected     = $derived(hasExpected ? Number(headerTotal) : NaN);
	const sumLines     = $derived((lines.reduce((acc, li) => acc + (Number(li.total) || 0), 0)));
	const balanceDelta = $derived(expected - sumLines);
	const balanced     = $derived(!Number.isFinite(expected) || Math.abs(balanceDelta) <= 0.01);

	/** @param {string} primary */
	function secondariesFor(primary) {
		return categories.find((c) => c.primary === primary)?.secondary ?? [];
	}

	function addLine() {
		lines = [...lines, {
			description: '', total: '0.00', primaryCategory: null, secondaryCategory: null, kind: 'standard', aiSuggested: false
		}];
	}

	/** @param {number} i */
	function removeLine(i) {
		const li = lines[i];
		if (li.kind === 'tax' && locked) return;
		lines = lines.filter((_, idx) => idx !== i);
	}

	async function saveHeader() {
		const url = `/api/${type === 'receipt' ? 'receipts' : 'sales'}/${row.id}`;
		const res = await fetch(url, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body:    JSON.stringify({ category: category.trim() || null })
		});
		if (!res.ok) saveError = (await res.json()).message ?? `Header save failed (${res.status})`;
	}

	async function saveLines() {
		const url = `/api/${type === 'receipt' ? 'receipts' : 'sales'}/${row.id}/line-items`;
		const payload = type === 'receipt'
			? lines.map((li) => ({
				id: li.id, description: li.description, qty: li.qty, unitPrice: li.unitPrice,
				total: li.total, primaryCategory: li.primaryCategory, secondaryCategory: li.secondaryCategory, kind: li.kind,
				aiSuggested: li.aiSuggested
			}))
			: lines.map((li) => ({
				id: li.id, description: li.description, unitsSold: li.unitsSold, sellPrice: li.sellPrice,
				total: li.total, primaryCategory: li.primaryCategory, secondaryCategory: li.secondaryCategory, kind: li.kind,
				aiSuggested: li.aiSuggested
			}));
		const res = await fetch(url, {
			method: 'PUT', headers: { 'content-type': 'application/json' },
			body:    JSON.stringify({ lineItems: payload })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			saveError = body?.message ?? `Line-items save failed (${res.status})`;
		}
	}

	async function save() {
		if (hasExpected && !balanced) { saveError = `Lines sum to ${sumLines.toFixed(2)}, expected ${expected.toFixed(2)}`; return; }
		saving = true; saveError = ''; saveOk = false;
		try {
			await saveHeader();
			if (!saveError) await saveLines();
			if (!saveError) { saveOk = true; await invalidateAll(); }
		} finally { saving = false; }
	}

	// ── autofill (embedding-based suggestions) ──────────────────────────
	let autofilling    = $state(false);
	let autofillNote   = $state('');

	/** Replace each existing primary/secondary on `kind='standard'` lines
	 *  with a kNN suggestion if Vectorize returns a confident one. Tax
	 *  lines and rows that already have BOTH categories are left alone. */
	async function autofillCategories() {
		autofillNote = '';
		if (!data.workspaceId) { autofillNote = 'No workspace context — switch to a workspace first.'; return; }

		/** @type {Array<{ idx: number, description: string|null }>} */
		const targets = [];
		for (let i = 0; i < lines.length; i++) {
			const li = lines[i];
			if (li.kind !== 'standard') continue;
			if (li.primaryCategory && li.secondaryCategory) continue;
			targets.push({ idx: i, description: li.description });
		}
		if (targets.length === 0) {
			autofillNote = 'All standard line items are already categorised.';
			return;
		}

		autofilling = true;
		try {
			const merchant = data.type === 'receipt' ? data.row.merchantName : data.row.documentTitle;
			const res = await fetch(`/api/workspaces/${data.workspaceId}/embeddings/suggest`, {
				method:  'POST',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ merchant, lines: targets.map((t) => ({ description: t.description })) })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				autofillNote = body?.message ?? `Autofill failed (${res.status})`;
				return;
			}
			/** @type {{ suggestions: Array<{ primary: string, secondary: string, score?: number, source: 'embeddings' | 'gemini' } | null> }} */
			const { suggestions } = await res.json();

			let filledEmb = 0;
			let filledGem = 0;
			for (let i = 0; i < targets.length; i++) {
				const s = suggestions[i];
				if (!s) continue;
				const li = lines[targets[i].idx];
				if (!li.primaryCategory)   li.primaryCategory   = s.primary;
				if (!li.secondaryCategory) li.secondaryCategory = s.secondary;
				li.aiSuggested = true;
				if (s.source === 'gemini') filledGem++; else filledEmb++;
			}
			const filled = filledEmb + filledGem;
			if (filled > 0) {
				const parts = [];
				if (filledEmb > 0) parts.push(`${filledEmb} via embeddings`);
				if (filledGem > 0) parts.push(`${filledGem} via Gemini`);
				autofillNote = `Suggested ${filled} of ${targets.length} line(s) (${parts.join(', ')}). Confirm or edit, then save.`;
			} else {
				autofillNote = `No confident match for ${targets.length} line(s). Set GEMINI_API_KEY in Worker secrets or fill manually — saves train the embeddings index for next time.`;
			}
		} catch (/** @type {any} */ err) {
			autofillNote = String(err?.message ?? err);
		} finally {
			autofilling = false;
		}
	}

	// ── add-category form ───────────────────────────────────────────────
	let showCatForm   = $state(false);
	let newPrimary    = $state('');
	let newParent     = $state('');
	let newSecondary  = $state('');
	let catError      = $state('');

	async function addCategory() {
		catError = '';
		if (!newPrimary && !(newParent && newSecondary)) { catError = 'Fill primary OR parent+secondary.'; return; }
		const res = await fetch(`/api/workspaces/${data.workspaceId}/categories`, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ primary: newPrimary || undefined, parent: newParent || undefined, secondary: newSecondary || undefined })
		});
		if (!res.ok) { catError = (await res.json()).message ?? `Failed (${res.status})`; return; }
		newPrimary = ''; newParent = ''; newSecondary = ''; showCatForm = false;
		await invalidateAll();
		categories = data.categories;
	}
</script>

<svelte:head><title>Refine · {row.id.slice(0, 8)} | FuzzyFinance</title></svelte:head>

<div class="max-w-5xl mx-auto flex flex-col gap-4">
	<a href="/dashboard/refinement" class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)">← Back to queue</a>

	<Card title="Refine {type.toUpperCase()} · {(data.type === 'receipt' ? data.row.merchantName : data.row.documentTitle) ?? data.row.id.slice(0, 8)}">
		<!-- Header summary -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 font-mono text-[10px]">
			<div><span class="text-(--color-muted-foreground) uppercase">Source:</span> <span class="font-black ml-1">{row.externalSource ?? 'Manual'}</span></div>
			<div><span class="text-(--color-muted-foreground) uppercase">Total:</span> <span class="font-black ml-1">{headerTotal ?? '—'} {row.currency ?? ''}</span> {#if locked}<span class="text-(--color-muted-foreground) ml-1">🔒</span>{/if}</div>
			<div><span class="text-(--color-muted-foreground) uppercase">Date:</span> <span class="font-black ml-1">{data.type === 'receipt' ? data.row.receiptDate : data.row.saleDate}</span></div>
			<div><span class="text-(--color-muted-foreground) uppercase">Status:</span> <span class="font-black ml-1">{row.status}</span></div>
		</div>

		<!-- Header category -->
		<div class="flex items-center gap-2 mb-4">
			<label class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground)" for="hdrcat">Document category:</label>
			<input id="hdrcat" type="text" bind:value={category} placeholder="e.g. Operating expenses"
				class="flex-1 font-mono text-[10px] px-3 py-1.5 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) focus:outline-none focus:border-(--color-fg)" />
		</div>
	</Card>

	<Card title="Line Items">
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mb-3">
			Categorise each line. Tax lines (sourced from {row.externalSource ?? 'Xero'}) keep their amount locked — only their category is editable.
			{#if locked}<br/>Header total is locked at {expected.toFixed(2)}. Lines must balance to this total.{/if}
		</p>

		<table class="w-full font-mono text-[10px]">
			<thead class="border-b-2 border-(--color-border) text-(--color-muted-foreground) uppercase tracking-widest">
				<tr>
					<th class="text-left py-2 pr-2">Description</th>
					<th class="text-right py-2 pr-2 w-24">Total</th>
					<th class="text-left py-2 pr-2 w-40">Primary</th>
					<th class="text-left py-2 pr-2 w-40">Secondary</th>
					<th class="text-left py-2 pr-2 w-16">Kind</th>
					<th class="py-2 w-8"></th>
				</tr>
			</thead>
			<tbody>
				{#each lines as li, i (i)}
					{@const taxLocked = li.kind === 'tax' && locked}
					<tr class="border-b border-(--color-border)">
						<td class="py-1.5 pr-2">
							<input type="text" bind:value={li.description}
								class="w-full font-mono text-[10px] px-2 py-1 border border-(--color-border) bg-(--color-bg)" />
						</td>
						<td class="py-1.5 pr-2">
							<input type="text" bind:value={li.total} readonly={taxLocked}
								class="w-full text-right font-mono text-[10px] px-2 py-1 border border-(--color-border) {taxLocked ? 'bg-(--color-muted) text-(--color-muted-foreground)' : 'bg-(--color-bg)'}" />
						</td>
						<td class="py-1.5 pr-2">
							<div class="flex items-center gap-1">
								<select bind:value={li.primaryCategory} onchange={() => clearAiFlag(i)}
									class="flex-1 font-mono text-[10px] px-2 py-1 border border-(--color-border) {li.aiSuggested ? 'bg-(--color-accent-soft) border-(--color-accent)' : 'bg-(--color-bg)'}">
									<option value={null}>— none —</option>
									<!-- Render the stored value as a "legacy" option when it isn't
									     in the current taxonomy. Without this the <select> can't
									     bind to it and silently shows blank, leaving the user
									     thinking the category disappeared. -->
									{#if li.primaryCategory && !categories.find((c) => c.primary === li.primaryCategory)}
										<option value={li.primaryCategory}>{li.primaryCategory} (legacy)</option>
									{/if}
									{#each categories as c (c.primary)}
										<option value={c.primary}>{c.primary}{c.custom ? ' *' : ''}</option>
									{/each}
								</select>
								{#if li.aiSuggested}
									<span title="Auto-suggested — edit to confirm" class="font-mono text-[9px] font-black uppercase tracking-wider px-1 py-0.5 border border-(--color-accent) text-(--color-accent)">AI</span>
								{/if}
							</div>
						</td>
						<td class="py-1.5 pr-2">
							<select bind:value={li.secondaryCategory} onchange={() => clearAiFlag(i)}
								class="w-full font-mono text-[10px] px-2 py-1 border border-(--color-border) {li.aiSuggested ? 'bg-(--color-accent-soft) border-(--color-accent)' : 'bg-(--color-bg)'}">
								<option value={null}>— none —</option>
								{#if li.secondaryCategory && !secondariesFor(li.primaryCategory ?? '').includes(li.secondaryCategory)}
									<option value={li.secondaryCategory}>{li.secondaryCategory} (legacy)</option>
								{/if}
								{#each secondariesFor(li.primaryCategory ?? '') as s (s)}
									<option value={s}>{s}</option>
								{/each}
							</select>
						</td>
						<td class="py-1.5 pr-2 font-bold uppercase {li.kind === 'tax' ? 'text-(--color-warning)' : ''}">{li.kind}</td>
						<td class="py-1.5">
							{#if !taxLocked}
								<button onclick={() => removeLine(i)} title="Remove line" class="text-(--color-danger) hover:opacity-70">✕</button>
							{:else}
								<span class="text-(--color-muted-foreground)">🔒</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-(--color-border) font-black">
					<td class="py-2 pr-2 uppercase text-(--color-muted-foreground)">Sum</td>
					<td class="py-2 pr-2 text-right">{sumLines.toFixed(2)}</td>
					<td colspan="4" class="py-2 pl-2">
						{#if !hasExpected}
							<span class="text-(--color-muted-foreground) uppercase">No header total recorded — saving as-is</span>
						{:else if !balanced}
							<span class="text-(--color-danger) uppercase">Off by {Math.abs(balanceDelta).toFixed(2)} — expected {expected.toFixed(2)}</span>
						{:else}
							<span class="text-(--color-success) uppercase">Balanced</span>
						{/if}
					</td>
				</tr>
			</tfoot>
		</table>

		<div class="flex gap-2 mt-3 flex-wrap items-center">
			<Button variant="secondary" onclick={addLine} class="text-xs font-black uppercase tracking-widest">+ ADD LINE</Button>
			<Button variant="secondary" onclick={autofillCategories} disabled={autofilling} class="text-xs font-black uppercase tracking-widest">
				{autofilling ? 'AUTOFILLING…' : '✨ AUTOFILL CATEGORIES'}
			</Button>
			{#if autofillNote}
				<span class="font-mono text-[10px] text-(--color-muted-foreground) uppercase tracking-widest">{autofillNote}</span>
			{/if}
		</div>
	</Card>

	<Card title="Manage Categories">
		{#if !showCatForm}
			<Button variant="secondary" onclick={() => (showCatForm = true)} class="text-xs font-black uppercase tracking-widest">+ NEW CATEGORY</Button>
		{:else}
			<div class="flex flex-col gap-2">
				<p class="font-mono text-[10px] text-(--color-muted-foreground)">Add a new primary OR a sub-category under an existing primary.</p>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
					<input type="text" bind:value={newPrimary} placeholder="New primary"
						class="font-mono text-[10px] px-3 py-2 border-2 border-(--color-border) bg-(--color-bg)" />
					<select bind:value={newParent} class="font-mono text-[10px] px-3 py-2 border-2 border-(--color-border) bg-(--color-bg)">
						<option value="">— pick parent —</option>
						{#each categories as c (c.primary)}
							<option value={c.primary}>{c.primary}</option>
						{/each}
					</select>
					<input type="text" bind:value={newSecondary} placeholder="New sub-category"
						class="font-mono text-[10px] px-3 py-2 border-2 border-(--color-border) bg-(--color-bg)" />
				</div>
				{#if catError}<p class="font-mono text-[10px] text-(--color-danger)">{catError}</p>{/if}
				<div class="flex gap-2">
					<Button variant="primary" onclick={addCategory} class="text-xs font-black uppercase tracking-widest">SAVE CATEGORY</Button>
					<Button variant="secondary" onclick={() => (showCatForm = false)} class="text-xs font-black uppercase tracking-widest">CANCEL</Button>
				</div>
			</div>
		{/if}
	</Card>

	<!-- Save bar -->
	<div class="border-2 border-(--color-fg) bg-(--color-bg) p-4 flex items-center justify-between sticky bottom-4">
		<div class="font-mono text-[10px]">
			{#if saveError}<span class="text-(--color-danger)">{saveError}</span>
			{:else if saveOk}<span class="text-(--color-success) uppercase">Saved</span>
			{:else}<span class="text-(--color-muted-foreground) uppercase">{lines.length} line(s), sum {sumLines.toFixed(2)}</span>{/if}
		</div>
		<Button variant="primary" onclick={save} disabled={saving || !balanced} class="text-xs font-black uppercase tracking-widest">
			{saving ? 'SAVING…' : 'SAVE CHANGES'}
		</Button>
	</div>
</div>
