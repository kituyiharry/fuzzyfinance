<script>
	import Card from '$lib/components/Card.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import FileUploadDropzone from '$lib/components/FileUploadDropzone.svelte';
	import { goto } from '$app/navigation';

	/** @type {File | null} */
	let selectedFile = $state(null);

	/** @type {'idle' | 'uploading' | 'processing' | 'complete' | 'failed'} */
	let stage = $state('idle');

	/** @type {string | null} */
	let receiptId = $state(null);

	/** @type {string | null} */
	let errorMsg = $state(null);

	/** @type {{ status: string; merchantName?: string | null; total?: string | null; currency?: string | null } | null} */
	let pollData = $state(null);

	/** @type {ReturnType<typeof setInterval> | null} */
	let pollInterval = $state(null);

	const TERMINAL_STATUSES = new Set(['complete', 'complete_no_sync', 'failed']);

	/** @param {File} file */
	function handleFile(file) {
		selectedFile = file;
		stage    = 'idle';
		errorMsg = null;
		pollData = null;
		receiptId = null;
	}

	async function upload() {
		if (!selectedFile) return;
		stage    = 'uploading';
		errorMsg = null;

		const form = new FormData();
		form.append('file', selectedFile);

		try {
			const res = await fetch('/api/receipts', { method: 'POST', body: form });
			if (!res.ok) {
				const { message } = await res.json().catch(() => ({ message: res.statusText }));
				throw new Error(message);
			}
			const body = await res.json();
			receiptId = body.receiptId;
			stage = 'processing';
			startPolling();
		} catch (err) {
			stage    = 'failed';
			errorMsg = String(err);
		}
	}

	function startPolling() {
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(async () => {
			if (!receiptId) return;
			try {
				const res = await fetch(`/api/receipts/${receiptId}/status`);
				if (!res.ok) return;
				const data = await res.json();
				pollData = data;

				if (TERMINAL_STATUSES.has(data.status)) {
					clearInterval(pollInterval ?? undefined);
					pollInterval = null;
					stage = data.status === 'failed' ? 'failed' : 'complete';
					if (data.status === 'failed') errorMsg = data.errorMessage ?? 'Processing failed';
				}
			} catch {
				// ignore transient errors
			}
		}, 2000);
	}

	function goToReceipt() {
		if (receiptId) goto(`/dashboard/receipts/${receiptId}`);
	}

	const STAGE_STEPS = [
		{ key: 'uploading',  label: 'UPLOADING FILE' },
		{ key: 'processing', label: 'AI EXTRACTION' },
		{ key: 'complete',   label: 'COMPLETE' }
	];
</script>

<svelte:head>
	<title>Upload Receipt | FuzzyFinance</title>
</svelte:head>

<div class="max-w-2xl mx-auto flex flex-col gap-6">
	<Card title="Upload Receipt Document">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			UPLOAD AN IMAGE OR PDF OF YOUR RECEIPT. THE DOCUMENT WILL BE PROCESSED BY AI TO EXTRACT
			FINANCIAL DATA AND SYNCED TO YOUR CONNECTED CLOUD INTEGRATIONS.
		</p>

		{#if stage === 'idle' || stage === 'uploading'}
			<FileUploadDropzone onfile={handleFile} disabled={stage === 'uploading'} />

			{#if selectedFile}
				<div class="mt-4 border-2 border-(--color-border) p-4 flex items-center justify-between gap-4">
					<div class="flex flex-col gap-1">
						<span class="font-bold text-xs text-(--color-fg) truncate max-w-xs">{selectedFile.name}</span>
						<span class="font-mono text-[10px] text-(--color-muted-foreground)">
							{selectedFile.type} · {(selectedFile.size / 1024).toFixed(1)} KB
						</span>
					</div>
					<button
						onclick={upload}
						disabled={stage === 'uploading'}
						class="btn-primary text-xs font-black uppercase tracking-widest disabled:opacity-50"
					>
						{stage === 'uploading' ? 'UPLOADING...' : 'PROCESS RECEIPT'}
					</button>
				</div>
			{/if}
		{/if}

		{#if stage === 'processing' || stage === 'complete' || stage === 'failed'}
			<!-- Progress steps -->
			<div class="flex flex-col gap-2 mb-6">
				{#each STAGE_STEPS as step, i (step.key)}
					{@const isDone = (stage === 'complete' && true) || (stage === 'processing' && i < 1) || (i === 0 && stage !== 'uploading')}
					{@const isActive = (step.key === 'processing' && stage === 'processing') || (step.key === 'complete' && stage === 'complete')}
					<div class="flex items-center gap-3">
						<div class="w-5 h-5 border-2 {isDone || isActive ? 'border-(--color-fg) bg-(--nav-active-bg)' : 'border-(--color-border)'} flex items-center justify-center shrink-0">
							{#if isDone && step.key !== 'processing' || stage === 'complete'}
								<span class="text-[9px] font-black text-(--nav-active-fg)">✓</span>
							{:else if isActive && stage === 'processing'}
								<span class="text-[9px] font-black text-(--nav-active-fg) animate-pulse">·</span>
							{/if}
						</div>
						<span class="font-mono text-[10px] uppercase tracking-widest {isActive ? 'font-black text-(--color-fg)' : 'text-(--color-muted-foreground)'}">
							{step.label}
						</span>
					</div>
				{/each}
			</div>

			<!-- Status display -->
			{#if pollData}
				<div class="border-2 border-(--color-border) p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-mono text-[10px] uppercase text-(--color-muted-foreground)">STATUS</span>
						<ReceiptStatusBadge status={pollData.status} />
					</div>
					{#if pollData.merchantName}
						<div class="flex gap-2 font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">MERCHANT:</span>
							<span class="font-bold text-(--color-fg)">{pollData.merchantName}</span>
						</div>
					{/if}
					{#if pollData.total}
						<div class="flex gap-2 font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">TOTAL:</span>
							<span class="font-bold text-(--color-fg)">{pollData.total} {pollData.currency ?? ''}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="border-2 border-(--color-border) p-4 font-mono text-[10px] text-(--color-muted-foreground) uppercase animate-pulse">
					AWAITING EXTRACTION...
				</div>
			{/if}

			{#if stage === 'failed'}
				<div class="mt-4 border-2 border-red-600 p-4 font-mono text-[10px] text-red-600 uppercase">
					PROCESSING FAILED: {errorMsg}
				</div>
			{/if}

			{#if stage === 'complete'}
				<div class="mt-4 flex gap-3">
					<button onclick={goToReceipt} class="btn-primary text-xs font-black uppercase tracking-widest">
						VIEW RECEIPT →
					</button>
					<a href="/dashboard/receipts/upload" class="btn-secondary text-xs font-black uppercase tracking-widest no-underline inline-flex items-center px-4 py-2">
						UPLOAD ANOTHER
					</a>
				</div>
			{/if}
		{/if}
	</Card>
</div>
