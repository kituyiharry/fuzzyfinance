<script>
	import Card from '$lib/components/Card.svelte';
	import FileUploadDropzone from '$lib/components/FileUploadDropzone.svelte';
	import IntegrationWarningBanner from '$lib/components/IntegrationWarningBanner.svelte';
	import { resolve } from '$app/paths';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let uploadBlocked = $derived(
		data.integrationStatus === 'none' || data.todayCount >= data.dailyLimit
	);

	/**
	 * @typedef {{
	 *   id:            string;
	 *   file:          File;
	 *   stage:         'queued' | 'uploading' | 'processing' | 'complete' | 'failed' | 'not_relevant' | 'duplicate';
	 *   docId:         string | null;
	 *   pollData:      { status: string; merchantName?: string|null; total?: string|null; currency?: string|null; duplicateOf?: string|null } | null;
	 *   error:         string | null;
	 *   duplicateId:   string | null;
	 *   semanticDupId: string | null;
	 *   forced:        boolean;
	 * }} QueueItem
	 */

	/** @type {QueueItem[]} */
	let queue = $state([]);
	let running = $state(false);
	let truncatedCount = $state(0);

	// Items that have consumed or will consume a daily slot (excludes duplicates rejected by server)
	const submittedCount = $derived(queue.filter(q => q.stage !== 'duplicate').length);
	const remaining = $derived(Math.max(0, data.dailyLimit - data.todayCount - submittedCount));

	const completedCount = $derived(
		queue.filter(q => ['complete', 'failed', 'not_relevant', 'duplicate'].includes(q.stage)).length
	);
	const successCount = $derived(queue.filter(q => q.stage === 'complete').length);
	const progress = $derived(queue.length > 0 ? Math.round(completedCount / queue.length * 100) : 0);
	const allDone = $derived(queue.length > 0 && completedCount === queue.length);
	const hasActive = $derived(queue.some(q => q.stage === 'uploading' || q.stage === 'processing'));
	const hasQueued = $derived(queue.some(q => q.stage === 'queued'));

	$effect(() => {
		if (!hasActive) return;
		/** @param {BeforeUnloadEvent} e */
		const handler = (e) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	const TERMINAL = new Set(['complete', 'complete_no_sync', 'staged', 'failed']);

	/** @param {number} ms */
	const sleep = (ms) => new Promise(r => setTimeout(r, ms));

	/** @param {string} id @param {Partial<QueueItem>} updates */
	function patchItem(id, updates) {
		const idx = queue.findIndex(q => q.id === id);
		if (idx !== -1) queue[idx] = { ...queue[idx], ...updates };
	}

	/** @param {File[]} files */
	function addFiles(files) {
		if (uploadBlocked) return;
		const slots = remaining;
		const accepted = files.slice(0, slots);
		truncatedCount = files.length - accepted.length;
		if (!accepted.length) return;
		/** @type {QueueItem[]} */
		const items = accepted.map(f => ({
			id: crypto.randomUUID(),
			file: f,
			stage: 'queued',
			docId: null,
			pollData: null,
			error: null,
			duplicateId: null,
			semanticDupId: null,
			forced: false
		}));
		queue = [...queue, ...items];
	}

	/** @returns {Promise<boolean>} false means stop the queue */
	async function runQueue() {
		running = true;
		try {
			let next;
			while ((next = queue.find(q => q.stage === 'queued'))) {
				const ok = await processOne(next.id, next.file, next.forced);
				if (!ok) break;
			}
		} finally {
			running = false;
		}
	}

	/**
	 * @param {string} id
	 * @param {File} file
	 * @param {boolean} forced
	 * @returns {Promise<boolean>} false means the queue should stop
	 */
	async function processOne(id, file, forced) {
		patchItem(id, { stage: 'uploading' });

		const form = new FormData();
		form.append('file', file);
		if (forced) form.append('force', 'true');

		try {
			const res = await fetch('/api/receipts', { method: 'POST', body: form });

			if (res.status === 429) {
				patchItem(id, { error: 'Daily upload limit reached. Try again tomorrow.', stage: 'failed' });
				return false;
			}

			if (res.status === 409) {
				const body = await res.json();
				patchItem(id, { stage: 'duplicate', duplicateId: body.duplicateReceiptId ?? null });
				return true;
			}

			if (!res.ok) {
				const body = await res.json().catch(() => ({ message: res.statusText }));
				patchItem(id, { error: body.message ?? res.statusText, stage: 'failed' });
				return true;
			}

			const body = await res.json();
			const docId = body.receiptId;
			patchItem(id, { docId, stage: 'processing' });
			await pollOne(id, docId);
			return true;
		} catch (err) {
			patchItem(id, { error: String(err), stage: 'failed' });
			return true;
		}
	}

	/**
	 * @param {string} id
	 * @param {string} docId
	 */
	async function pollOne(id, docId) {
		while (true) {
			await sleep(2000);
			try {
				const res = await fetch(`/api/receipts/${docId}/status`);
				if (!res.ok) continue;
				const status = await res.json();
				patchItem(id, { pollData: status });

				if (TERMINAL.has(status.status)) {
					const notRelevant = status.status === 'failed' && status.errorMessage?.startsWith('NOT_RELEVANT:');
					patchItem(id, {
						error: status.status === 'failed' && !notRelevant ? (status.errorMessage ?? 'Processing failed') : null,
						stage: notRelevant ? 'not_relevant' : status.status === 'failed' ? 'failed' : 'complete',
						semanticDupId: status.duplicateOf ?? null
					});
					return;
				}
			} catch { /* ignore transient errors */ }
		}
	}

	/** @param {string} itemId */
	async function forceUpload(itemId) {
		const item = queue.find(q => q.id === itemId);
		if (!item) return;
		patchItem(itemId, { forced: true, duplicateId: null, stage: 'queued' });
		if (!running) runQueue();
	}

	function clearQueue() {
		if (hasActive) return;
		queue = [];
		truncatedCount = 0;
	}
</script>

<svelte:head>
	<title>Upload Expense | FuzzyFinance</title>
</svelte:head>

<div class="max-w-2xl mx-auto flex flex-col gap-6">

	{#if data.integrationStatus === 'none'}
		<IntegrationWarningBanner status={data.integrationStatus} />
	{:else if data.todayCount >= data.dailyLimit}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DAILY LIMIT REACHED</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				You have uploaded {data.todayCount} of {data.dailyLimit} expense documents today. The limit resets at midnight UTC.
			</p>
		</div>
	{:else if data.todayCount >= data.dailyLimit * 0.8}
		<div class="border-2 border-(--color-border) bg-(--color-bg) p-3 flex items-center gap-2">
			<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
			<span class="font-mono text-[10px] text-(--color-muted-foreground)">{data.todayCount} / {data.dailyLimit} uploads used today</span>
		</div>
	{/if}

	{#if hasActive}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-3 flex items-center gap-2">
			<span class="w-1.5 h-1.5 bg-(--color-warning-border) shrink-0 animate-pulse"></span>
			<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">PROCESSING IN PROGRESS — DO NOT CLOSE OR LEAVE THIS PAGE</span>
		</div>
	{/if}

	<Card title="Upload Expense Documents">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			UPLOAD ONE OR MORE IMAGES, SCREENSHOTS OR PDFS OF YOUR EXPENSE DOCUMENTS. EACH FILE IS PROCESSED BY AI TO EXTRACT FINANCIAL DATA AND SYNCED TO YOUR CONNECTED CLOUD INTEGRATIONS.
		</p>

		<FileUploadDropzone onfiles={addFiles} multiple={true} disabled={uploadBlocked || remaining === 0} />

		<div class="mt-3 flex items-center justify-between gap-3">
			<span class="font-mono text-[10px] uppercase tracking-widest {remaining === 0 ? 'text-(--color-warning)' : 'text-(--color-muted-foreground)'}">
				{remaining} / {data.dailyLimit} UPLOADS REMAINING TODAY
			</span>
			{#if queue.length > 0}
				<span class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground)">
					{queue.length} FILE{queue.length !== 1 ? 'S' : ''} ADDED
				</span>
			{/if}
		</div>

		{#if truncatedCount > 0}
			<div class="mt-2 flex items-center gap-2 border border-(--color-warning-border) bg-(--color-warning-muted) px-3 py-2">
				<span class="w-1.5 h-1.5 bg-(--color-warning-border) shrink-0"></span>
				<p class="font-mono text-[10px] text-(--color-warning) font-bold uppercase">
					{truncatedCount} FILE{truncatedCount !== 1 ? 'S' : ''} SKIPPED — DAILY LIMIT WOULD BE EXCEEDED
				</p>
			</div>
		{/if}

		{#if queue.length > 0}
			{#if hasQueued && !running}
				<div class="mt-3 flex justify-end">
					<button
						onclick={runQueue}
						class="font-mono text-[10px] font-black uppercase tracking-widest px-4 py-1.5 bg-(--color-fg) text-(--color-bg) hover:opacity-90 transition-opacity"
					>START PROCESSING →</button>
				</div>
			{/if}

			<!-- Progress bar -->
			<div class="mt-6 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
						{completedCount} / {queue.length} PROCESSED
					</span>
					{#if allDone}
						<button
							onclick={clearQueue}
							class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors border-0 bg-transparent"
						>CLEAR ✕</button>
					{/if}
				</div>
				<div class="w-full h-1.5 bg-(--color-muted)">
					<div
						class="h-1.5 transition-all duration-500 {allDone ? 'bg-(--color-success)' : 'bg-(--color-fg)'}"
						style="width: {progress}%"
					></div>
				</div>
			</div>

			<!-- File rows -->
			<div class="mt-4 flex flex-col gap-2">
				{#each queue as item (item.id)}
					{@const borderColor = item.stage === 'complete'
						? 'border-(--color-success-border)'
						: item.stage === 'failed'
							? 'border-(--color-danger-border)'
							: item.stage === 'not_relevant' || item.stage === 'duplicate'
								? 'border-(--color-warning-border)'
								: 'border-(--color-border)'}
					<div class="border-2 {borderColor} p-3 flex flex-col gap-2">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2 min-w-0">
								<div class="w-2 h-2 shrink-0
									{item.stage === 'queued' ? 'border border-(--color-border)' : ''}
									{item.stage === 'uploading' || item.stage === 'processing' ? 'bg-(--color-fg) animate-pulse' : ''}
									{item.stage === 'complete' ? 'bg-(--color-success)' : ''}
									{item.stage === 'failed' ? 'bg-(--color-danger-border)' : ''}
									{item.stage === 'not_relevant' || item.stage === 'duplicate' ? 'bg-(--color-warning-border)' : ''}
								"></div>
								<span class="font-mono text-[10px] font-black text-(--color-fg) truncate">{item.file.name}</span>
							</div>
							<div class="flex items-center gap-3 shrink-0">
								<span class="font-mono text-[9px] text-(--color-muted-foreground)">{(item.file.size / 1024).toFixed(0)} KB</span>
								<span class="font-mono text-[9px] font-black uppercase tracking-widest
									{item.stage === 'queued' ? 'text-(--color-muted-foreground)' : ''}
									{item.stage === 'uploading' || item.stage === 'processing' ? 'text-(--color-fg)' : ''}
									{item.stage === 'complete' ? 'text-(--color-success)' : ''}
									{item.stage === 'failed' ? 'text-(--color-danger)' : ''}
									{item.stage === 'not_relevant' || item.stage === 'duplicate' ? 'text-(--color-warning)' : ''}
								">
									{item.stage === 'queued' ? 'QUEUED' :
									 item.stage === 'uploading' ? 'UPLOADING...' :
									 item.stage === 'processing' ? 'EXTRACTING...' :
									 item.stage === 'complete' ? '✓ DONE' :
									 item.stage === 'failed' ? '✕ FAILED' :
									 item.stage === 'not_relevant' ? 'NOT RECOGNISED' :
									 'DUPLICATE'}
								</span>
							</div>
						</div>

						{#if item.stage === 'complete' && item.pollData}
							<div class="pl-4 flex gap-4 flex-wrap items-center">
								{#if item.pollData.merchantName}
									<span class="font-mono text-[9px] text-(--color-muted-foreground)">
										MERCHANT: <span class="text-(--color-fg) font-black">{item.pollData.merchantName}</span>
									</span>
								{/if}
								{#if item.pollData.total}
									<span class="font-mono text-[9px] text-(--color-muted-foreground)">
										TOTAL: <span class="text-(--color-fg) font-black">{item.pollData.total} {item.pollData.currency ?? ''}</span>
									</span>
								{/if}
								{#if item.docId}
									<a href="/dashboard/receipts/{item.docId}"
										class="font-mono text-[9px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid no-underline">
										VIEW →
									</a>
								{/if}
							</div>
							{#if item.semanticDupId}
								<div class="pl-4 font-mono text-[9px] text-(--color-warning)">
									POSSIBLE DUPLICATE ·
									<a href="/dashboard/receipts/{item.semanticDupId}" class="underline decoration-dotted hover:decoration-solid">VIEW →</a>
								</div>
							{/if}
						{/if}

						{#if item.stage === 'failed' && item.error}
							<p class="pl-4 font-mono text-[9px] text-(--color-danger) uppercase">{item.error}</p>
						{/if}

						{#if item.stage === 'not_relevant'}
							<p class="pl-4 font-mono text-[9px] text-(--color-warning)">
								{item.error?.replace('NOT_RELEVANT:', '').trim() ?? 'Document not recognised as an expense.'}
							</p>
						{/if}

						{#if item.stage === 'duplicate'}
							<div class="pl-4 flex gap-3 items-center flex-wrap">
								<span class="font-mono text-[9px] text-(--color-warning) uppercase">File already exists</span>
								{#if item.duplicateId}
									<a href="/dashboard/receipts/{item.duplicateId}"
										class="font-mono text-[9px] font-black uppercase text-(--color-fg) underline decoration-dotted hover:decoration-solid no-underline">
										VIEW EXISTING →
									</a>
								{/if}
								<button
									onclick={() => forceUpload(item.id)}
									class="font-mono text-[9px] uppercase text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors border-0 bg-transparent"
								>UPLOAD ANYWAY</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if allDone}
				<div class="mt-4 flex items-center gap-4 flex-wrap">
					<span class="font-mono text-[10px] text-(--color-muted-foreground) uppercase">
						{successCount} complete · {queue.length - successCount} other
					</span>
					<a href={resolve('/dashboard/receipts')}
						class="font-mono text-[9px] font-black uppercase tracking-widest text-(--color-fg) underline decoration-dotted hover:decoration-solid no-underline">
						VIEW ALL EXPENSES →
					</a>
				</div>
			{/if}
		{/if}
	</Card>
</div>
