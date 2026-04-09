<script>
	import Card from '$lib/components/Card.svelte';
	import MetricCard from '$lib/components/MetricCard.svelte';
	import SpendingChart from '$lib/components/SpendingChart.svelte';
	import IntegrationWarningBanner from '$lib/components/IntegrationWarningBanner.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @param {number} bytes */
	function formatBytes(bytes) {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
	}

	const limitPct = $derived(Math.min(100, Math.round((data.todayCount / data.dailyLimit) * 100)));
	const limitNearOrReached = $derived(data.todayCount >= data.dailyLimit * 0.8);
	const limitReached       = $derived(data.todayCount >= data.dailyLimit);

	// ── Query interface ──────────────────────────────────────────────────────
	/** @type {Array<{ role: 'user' | 'assistant'; content: string }>} */
	let messages = $state([]);

	/** @type {string} */
	let queryInput = $state('');

	/** @type {boolean} */
	let querying = $state(false);

	/** @type {boolean} */
	let saving = $state(false);

	/** @type {string | null} */
	let saveError = $state(null);

	/** @type {boolean} */
	let rateLimited = $state(false);

	/** @type {string | null} */
	let savedConvoId = $state(null);

	/** @type {HTMLDivElement | null} */
	let bubblesEl = $state(null);

	async function sendQuery() {
		const q = queryInput.trim();
		if (!q || querying) return;

		queryInput   = '';
		savedConvoId = null;
		saveError    = null;
		rateLimited  = false;

		/** @type {{ role: 'user' | 'assistant'; content: string }} */
		const userMsg = { role: 'user', content: q };
		messages = [...messages, userMsg];

		querying = true;
		try {
			const res = await fetch('/api/query', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: q, history: messages.slice(0, -1) }),
			});
			const body = await res.json();
			if (res.status === 429) {
				rateLimited = true;
				messages = [...messages, { role: 'assistant', content: body.message ?? 'Rate limit reached. Please wait a moment.' }];
			} else {
				const answer = res.ok ? (body.answer ?? 'No answer returned.') : (body.message ?? 'Error querying.');
				messages = [...messages, { role: 'assistant', content: answer }];
			}
		} catch {
			messages = [...messages, { role: 'assistant', content: 'Failed to reach the query service. Please try again.' }];
		} finally {
			querying = false;
			// Scroll bubbles to bottom
			setTimeout(() => { if (bubblesEl) bubblesEl.scrollTop = bubblesEl.scrollHeight; }, 50);
		}
	}

	function clearChat() {
		messages     = [];
		queryInput   = '';
		savedConvoId = null;
		saveError    = null;
	}

	async function saveConversation() {
		if (!messages.length || saving) return;
		saving    = true;
		saveError = null;
		try {
			const res = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messages }),
			});
			if (res.ok) {
				const body = await res.json();
				savedConvoId = body.id;
			} else {
				saveError = 'Failed to save conversation.';
			}
		} catch {
			saveError = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendQuery();
		}
	}

	const hasMessages = $derived(messages.length > 0);
</script>

<svelte:head>
	<title>Overview | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">

	{#if data.integrationStatus === 'none'}
		<IntegrationWarningBanner status={data.integrationStatus} />
	{/if}

	<!-- Query interface -->
	<div class="border-2 border-(--color-border) bg-(--color-bg)">
		<div class="px-5 py-3 border-b-2 border-(--color-border) flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<span class="w-1.5 h-1.5 bg-(--color-fg) shrink-0"></span>
				<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg)">
					Query your receipts
				</span>
			</div>
			{#if hasMessages}
				<div class="flex items-center gap-2">
					{#if savedConvoId}
						<a
							href="/dashboard/conversations"
							class="font-mono text-[9px] uppercase tracking-widest text-(--color-success) no-underline"
						>
							SAVED ✓ VIEW →
						</a>
					{:else}
						<button
							onclick={saveConversation}
							disabled={saving}
							class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) border border-(--color-border) px-2.5 py-1 transition-colors disabled:opacity-50"
						>
							{saving ? 'SAVING...' : 'SAVE'}
						</button>
					{/if}
					<button
						onclick={clearChat}
						class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-danger) border border-(--color-border) hover:border-(--color-danger-border) px-2.5 py-1 transition-colors"
					>
						CLEAR
					</button>
				</div>
			{/if}
		</div>

		<!-- Chat bubbles -->
		{#if hasMessages}
			<div
				bind:this={bubblesEl}
				class="px-5 py-4 flex flex-col gap-3 max-h-72 overflow-y-auto"
			>
				{#each messages as msg (msg)}
					<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div class="max-w-[78%] {msg.role === 'user'
							? 'bg-(--color-fg) text-(--color-bg)'
							: 'bg-(--color-muted) text-(--color-fg) border-2 border-(--color-border)'} px-4 py-3">
							<p class="font-mono text-[9px] uppercase tracking-widest font-black mb-1.5 opacity-50">
								{msg.role === 'user' ? 'YOU' : 'ASSISTANT'}
							</p>
							<p class="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
								{msg.content}
							</p>
						</div>
					</div>
				{/each}

				{#if querying}
					<div class="flex justify-start">
						<div class="bg-(--color-muted) border-2 border-(--color-border) px-4 py-3">
							<p class="font-mono text-[9px] uppercase tracking-widest font-black mb-1.5 opacity-50">ASSISTANT</p>
							<span class="font-mono text-[11px] text-(--color-muted-foreground) animate-pulse">Thinking...</span>
						</div>
					</div>
				{/if}
			</div>
			<div class="border-t border-(--color-border-subtle)"></div>
		{/if}

		{#if rateLimited}
			<div class="px-5 py-2 border-t border-(--color-warning-border) bg-(--color-warning-muted) flex items-center justify-between gap-2">
				<span class="font-mono text-[9px] text-(--color-warning) uppercase tracking-widest">
					RATE LIMIT — wait a moment before querying again
				</span>
				<button onclick={() => (rateLimited = false)} class="font-mono text-[9px] text-(--color-muted-foreground) hover:text-(--color-fg) shrink-0">✕</button>
			</div>
		{/if}

		{#if saveError}
			<div class="px-5 py-2 font-mono text-[9px] text-(--color-danger) uppercase tracking-widest">
				{saveError}
			</div>
		{/if}

		<!-- Input row -->
		<div class="flex gap-0 p-3">
			<textarea
				bind:value={queryInput}
				onkeydown={handleKeydown}
				rows={2}
				placeholder="Ask anything about your receipts — e.g. 'How much did I spend at coffee shops last month?'"
				class="flex-1 resize-none border-2 border-(--color-border) border-r-0 bg-(--color-bg) text-(--color-fg) font-mono text-[11px] px-4 py-3 placeholder:text-(--color-muted-foreground) focus:outline-none focus:border-(--color-fg) transition-colors"
				disabled={querying}
			></textarea>
			<button
				onclick={sendQuery}
				disabled={querying || !queryInput.trim()}
				class="font-mono text-[10px] font-black uppercase tracking-widest px-5 py-3 border-2 border-(--color-fg) bg-(--color-fg) text-(--color-bg) hover:bg-(--color-muted) hover:text-(--color-fg) hover:border-(--color-fg) transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
			>
				{querying ? '...' : 'ASK →'}
			</button>
		</div>

		<p class="px-5 pb-3 font-mono text-[9px] text-(--color-muted-foreground)">
			Press Enter to send · Shift+Enter for new line
		</p>
	</div>

	<!-- Primary metrics -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		<MetricCard
			label="Completed"
			value={data.successCount}
			sublabel="receipts synced"
			accent={data.successCount > 0}
		/>
		<MetricCard
			label="Failed"
			value={data.failedCount}
			sublabel={data.failedCount === 0 ? 'no errors' : 'need attention'}
		/>
		<MetricCard
			label="Storage Used"
			value={formatBytes(data.totalStorageBytes)}
			sublabel="across all uploads"
		/>

		<!-- Daily limit card — uses semantic warning tokens instead of hardcoded yellow -->
		<div class="border-2 {limitNearOrReached ? 'border-(--color-warning-border)' : 'border-(--color-border)'} p-5 flex flex-col gap-2 bg-(--color-bg)">
			<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold leading-none">
				Today's Uploads
			</span>
			<span class="font-black text-3xl tracking-tight leading-none tabular-nums {limitNearOrReached ? 'text-(--color-warning)' : 'text-(--color-fg)'}" style="font-family: var(--font-mono)">
				{data.todayCount}<span class="text-lg font-bold text-(--color-muted-foreground)"> / {data.dailyLimit}</span>
			</span>
			<div class="w-full h-1 bg-(--color-muted) mt-1">
				<div
					class="h-1 transition-all {limitReached ? 'bg-(--color-danger-border)' : limitNearOrReached ? 'bg-(--color-warning-border)' : 'bg-(--color-fg)'}"
					style="width: {limitPct}%"
				></div>
			</div>
			<span class="font-mono text-[10px] text-(--color-muted-foreground)">
				{limitReached ? 'Limit reached — resets midnight UTC' : `${data.dailyLimit - data.todayCount} remaining today`}
			</span>
		</div>
	</div>

	<!-- Staging panel — only shown when relevant -->
	{#if data.stagedCount > 0 || data.editedCount > 0}
		<div>
			<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold mb-2">Pending Review</p>
			<div class="grid grid-cols-3 gap-3">
				<MetricCard label="Staged"    value={data.stagedCount}    sublabel="awaiting review"     accent={data.stagedCount > 0} />
				<MetricCard label="Edited"    value={data.editedCount}    sublabel="AI corrections made" />
				<MetricCard label="Committed" value={data.committedCount} sublabel="synced to cloud"     accent={data.committedCount > 0} />
			</div>
		</div>
	{/if}

	<!-- Spending charts -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<Card title="Spending by Receipt Date">
			<SpendingChart data={data.spendingByReceiptDate} label="Amount (receipt date)" />
		</Card>
		<Card title="Spending by Upload Date">
			<SpendingChart data={data.spendingByProcessingDate} label="Amount (uploaded)" />
		</Card>
	</div>

	<!-- Quick actions -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
		<a
			href="/dashboard/receipts/upload"
			class="border-2 border-(--color-border) p-5 no-underline group transition-all hover:border-(--color-fg) hover:shadow-(--shadow-sm)
				{data.integrationStatus === 'none' ? 'opacity-50 pointer-events-none' : ''}"
		>
			<p class="font-black text-xs uppercase tracking-widest text-(--color-fg)">
				Upload Receipt →
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1.5">
				{data.integrationStatus === 'none'
					? 'Connect an integration first'
					: limitReached
						? 'Daily limit reached'
						: `${data.dailyLimit - data.todayCount} uploads remaining today`}
			</p>
		</a>

		<a
			href="/dashboard/receipts"
			class="border-2 border-(--color-border) p-5 no-underline group transition-all hover:border-(--color-fg) hover:shadow-(--shadow-sm)"
		>
			<p class="font-black text-xs uppercase tracking-widest text-(--color-fg)">
				View All Receipts →
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1.5">
				{data.successCount} committed · {data.stagedCount} staged · {data.failedCount} failed
			</p>
		</a>
	</div>

</div>
