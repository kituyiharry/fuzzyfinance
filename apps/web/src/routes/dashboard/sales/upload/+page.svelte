<script>
	import Card from '$lib/components/Card.svelte';
	import ReceiptStatusBadge from '$lib/components/ReceiptStatusBadge.svelte';
	import FileUploadDropzone from '$lib/components/FileUploadDropzone.svelte';
	import IntegrationWarningBanner from '$lib/components/IntegrationWarningBanner.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let uploadBlocked = $derived(
		data.integrationStatus === 'none' || data.todayCount >= data.dailyLimit
	);

	/** @type {File | null} */
	let selectedFile = $state(null);

	/** @type {'idle' | 'uploading' | 'processing' | 'complete' | 'failed' | 'not_relevant'} */
	let stage = $state('idle');

	/** @type {string | null} */
	let saleId = $state(null);

	/** @type {string | null} */
	let errorMsg = $state(null);

	/** @type {{ status: string; documentTitle?: string | null; totalRevenue?: string | null; currency?: string | null } | null} */
	let pollData = $state(null);

	/** @type {string | null} */
	let duplicateSaleId = $state(null);

	/** @type {boolean} */
	let forceUpload = $state(false);

	/** @type {ReturnType<typeof setInterval> | null} */
	let pollInterval = $state(null);

	const TERMINAL_STATUSES = new Set(['complete', 'complete_no_sync', 'failed']);

	/** @param {File} file */
	function handleFile(file) {
		if (uploadBlocked) return;
		selectedFile = file;
		stage    = 'idle';
		errorMsg = null;
		pollData = null;
		saleId   = null;
	}

	async function upload() {
		if (!selectedFile || uploadBlocked) return;
		stage    = 'uploading';
		errorMsg = null;
		duplicateSaleId = null;

		const form = new FormData();
		form.append('file', selectedFile);
		if (forceUpload) form.append('force', 'true');

		try {
			const res = await fetch('/api/sales', { method: 'POST', body: form });

			if (res.status === 409) {
				const body = await res.json();
				duplicateSaleId = body.duplicateSaleId ?? null;
				stage = 'idle';
				return;
			}

			if (!res.ok) {
				const body = await res.json().catch(() => ({ message: res.statusText }));
				throw new Error(body.message ?? res.statusText);
			}

			const body = await res.json();
			saleId      = body.saleId;
			stage       = 'processing';
			forceUpload = false;
			startPolling();
		} catch (err) {
			stage    = 'failed';
			errorMsg = String(err);
		}
	}

	function uploadAnyway() {
		duplicateSaleId = null;
		forceUpload = true;
		upload();
	}

	function startPolling() {
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(async () => {
			if (!saleId) return;
			try {
				const res = await fetch(`/api/sales/${saleId}/status`);
				if (!res.ok) return;
				const status = await res.json();
				pollData = status;

				if (TERMINAL_STATUSES.has(status.status)) {
					clearInterval(pollInterval ?? undefined);
					pollInterval = null;
					errorMsg = status.status === 'failed' ? (status.errorMessage ?? 'Processing failed') : null;
					if (errorMsg?.startsWith('NOT_RELEVANT:')) {
						stage = 'not_relevant';
					} else {
						stage = status.status === 'failed' ? 'failed' : 'complete';
					}
				}
			} catch {
				// ignore transient poll errors
			}
		}, 2000);
	}

	function goToSale() {
		if (saleId) goto(resolve(`/dashboard/sales/${saleId}`));
	}

	const STAGE_STEPS = [
		{ key: 'uploading',  label: 'UPLOADING FILE' },
		{ key: 'processing', label: 'AI EXTRACTION' },
		{ key: 'complete',   label: 'COMPLETE' }
	];
</script>

<svelte:head>
	<title>Upload Revenue | FuzzyFinance</title>
</svelte:head>

<div class="max-w-2xl mx-auto flex flex-col gap-6">

	{#if data.integrationStatus === 'none'}
		<IntegrationWarningBanner status={data.integrationStatus} />
	{:else if data.todayCount >= data.dailyLimit}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">
					DAILY LIMIT REACHED
				</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				You have uploaded {data.todayCount} of {data.dailyLimit} revenue documents today. The limit resets at midnight UTC.
			</p>
		</div>
	{:else if data.todayCount >= data.dailyLimit * 0.8}
		<div class="border-2 border-(--color-border) bg-(--color-bg) p-3 flex items-center gap-2">
			<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
			<span class="font-mono text-[10px] text-(--color-muted-foreground)">
				{data.todayCount} / {data.dailyLimit} uploads used today
			</span>
		</div>
	{/if}

	{#if duplicateSaleId && stage === 'idle'}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">FILE ALREADY UPLOADED</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				This exact file or a similar file has already been uploaded. View the existing revenue document or upload anyway.
			</p>
			<div class="pl-4 flex gap-3 mt-1">
				<a
					href="/dashboard/sales/{duplicateSaleId}"
					class="btn-secondary text-[10px] font-black uppercase tracking-widest no-underline inline-flex items-center px-3 py-1.5"
				>
					VIEW EXISTING →
				</a>
				<button
					onclick={uploadAnyway}
					class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) border border-dashed border-(--color-border) px-3 py-1.5 transition-colors"
				>
					UPLOAD ANYWAY
				</button>
			</div>
		</div>
	{/if}

	<Card title="Upload Revenue Document">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			UPLOAD AN IMAGE, SCREENSHOT OR PDF OF YOUR REVENUE DOCUMENT. THE DOCUMENT WILL BE PROCESSED BY AI TO EXTRACT FINANCIAL DATA AND SYNCED TO YOUR CONNECTED CLOUD INTEGRATIONS.
		</p>

		{#if stage === 'idle' || stage === 'uploading'}
			<FileUploadDropzone onfile={handleFile} disabled={uploadBlocked || stage === 'uploading'} />

			{#if selectedFile && !uploadBlocked}
				<div class="mt-4 border-2 border-(--color-border) p-4 flex items-center justify-between gap-4">
					<div class="flex flex-col gap-1">
						<span class="font-bold text-xs text-(--color-fg) truncate max-w-xs">{selectedFile.name}</span>
						<span class="font-mono text-[10px] text-(--color-muted-foreground)">
							{selectedFile.type} · {(selectedFile.size / 1024).toFixed(1)} KB
						</span>
					</div>
					<button
						onclick={upload}
						disabled={uploadBlocked || stage === 'uploading'}
						class="btn-primary text-xs font-black uppercase tracking-widest disabled:opacity-50"
					>
						{stage === 'uploading' ? 'UPLOADING...' : 'PROCESS REVENUE DOC'}
					</button>
				</div>
			{/if}
		{/if}

		{#if stage === 'not_relevant'}
		<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-5 flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 bg-(--color-warning-border) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">DOCUMENT NOT RECOGNISED AS A SALES RECORD</span>
			</div>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				{errorMsg?.replace('NOT_RELEVANT:', '').trim() ?? 'The uploaded document does not appear to be a revenue record, invoice, or income document.'}
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
				Please upload a revenue document, sales invoice, income report, or similar financial document.
			</p>
			<div class="pl-4 flex gap-3 mt-1">
				<button
					onclick={() => { stage = 'idle'; selectedFile = null; errorMsg = null; }}
					class="btn-primary text-[10px] font-black uppercase tracking-widest px-3 py-1.5"
				>
					TRY ANOTHER FILE
				</button>
			</div>
		</div>
	{/if}

	{#if stage === 'processing' || stage === 'complete' || stage === 'failed'}
			<div class="flex flex-col gap-2 mb-6">
				{#each STAGE_STEPS as step, i (step.key)}
					{@const isDone = stage === 'complete' || (stage !== 'uploading' && i === 0)}
					{@const isActive = (step.key === 'processing' && stage === 'processing') || (step.key === 'complete' && stage === 'complete')}
					<div class="flex items-center gap-3">
						<div class="w-5 h-5 border-2 {isDone || isActive ? 'border-(--color-fg) bg-(--nav-active-bg)' : 'border-(--color-border)'} flex items-center justify-center shrink-0">
							{#if isDone && step.key !== 'processing'}
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

			{#if pollData}
				<div class="border-2 border-(--color-border) p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-mono text-[10px] uppercase text-(--color-muted-foreground)">STATUS</span>
						<ReceiptStatusBadge status={pollData.status} />
					</div>
					{#if pollData.documentTitle}
						<div class="flex gap-2 font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">DOCUMENT:</span>
							<span class="font-bold text-(--color-fg)">{pollData.documentTitle}</span>
						</div>
					{/if}
					{#if pollData.totalRevenue}
						<div class="flex gap-2 font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">REVENUE:</span>
							<span class="font-bold text-(--color-fg)">{pollData.totalRevenue} {pollData.currency ?? ''}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="border-2 border-(--color-border) p-4 font-mono text-[10px] text-(--color-muted-foreground) uppercase animate-pulse">
					AWAITING EXTRACTION...
				</div>
			{/if}

			{#if stage === 'failed'}
				<div class="mt-4 border-2 border-(--color-danger-border) bg-(--color-danger-muted) p-4 font-mono text-[10px] text-(--color-danger) uppercase">
					PROCESSING FAILED: {errorMsg}
				</div>
			{/if}

			{#if stage === 'complete'}
				<div class="mt-4 flex gap-3">
					<button onclick={goToSale} class="btn-primary text-xs font-black uppercase tracking-widest">
						VIEW SALE →
					</button>
					<a
						href={resolve("/dashboard/sales/upload")}
						class="btn-secondary text-xs font-black uppercase tracking-widest no-underline inline-flex items-center px-4 py-2"
					>
						UPLOAD ANOTHER
					</a>
				</div>
			{/if}
		{/if}
	</Card>
</div>
