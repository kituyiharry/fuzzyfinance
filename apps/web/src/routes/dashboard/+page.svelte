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
</script>

<svelte:head>
	<title>Overview | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">

	{#if data.integrationStatus === 'none'}
		<IntegrationWarningBanner status={data.integrationStatus} />
	{/if}

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
