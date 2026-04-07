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

	const limitPct = $derived(
		Math.min(100, Math.round((data.todayCount / data.dailyLimit) * 100))
	);

	const limitNearOrReached = $derived(data.todayCount >= data.dailyLimit * 0.8);
</script>

<svelte:head>
	<title>Dashboard | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">

	<!-- Integration warning -->
	{#if data.integrationStatus !== 'ok'}
		<IntegrationWarningBanner status={data.integrationStatus} />
	{/if}

	<!-- Metric cards row -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
		<MetricCard
			label="Processed"
			value={data.successCount}
			sublabel="receipts completed"
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
		<div class="border-2 {limitNearOrReached ? 'border-yellow-500' : 'border-(--color-border)'} p-5 flex flex-col gap-2 bg-(--color-bg)">
			<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold">
				Today's Uploads
			</span>
			<span class="font-black text-3xl tracking-tight leading-none font-mono {limitNearOrReached ? 'text-yellow-600' : 'text-(--color-fg)'}">
				{data.todayCount}<span class="text-lg font-bold text-(--color-muted-foreground)"> / {data.dailyLimit}</span>
			</span>
			<!-- Progress bar -->
			<div class="w-full h-1 bg-(--color-muted) mt-1">
				<div
					class="h-1 transition-all {data.todayCount >= data.dailyLimit ? 'bg-red-500' : limitNearOrReached ? 'bg-yellow-500' : 'bg-(--color-fg)'}"
					style="width: {limitPct}%"
				></div>
			</div>
			<span class="font-mono text-[10px] text-(--color-muted-foreground)">
				{data.todayCount >= data.dailyLimit ? 'limit reached — resets midnight UTC' : `${data.dailyLimit - data.todayCount} remaining today`}
			</span>
		</div>
	</div>

	<!-- Spending charts -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<Card title="Spending by Receipt Date">
			<SpendingChart
				data={data.spendingByReceiptDate}
				label="Amount (receipt date)"
			/>
		</Card>

		<Card title="Spending by Processing Date">
			<SpendingChart
				data={data.spendingByProcessingDate}
				label="Amount (uploaded)"
			/>
		</Card>
	</div>

	<!-- Quick links -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<a
			href="/dashboard/receipts/upload"
			class="border-2 border-(--color-border) p-5 no-underline hover:border-(--color-fg) hover:shadow-[4px_4px_0px_0px_var(--card-shadow)] transition-all group {data.integrationStatus !== 'ok' ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}"
		>
			<p class="font-black text-xs uppercase tracking-widest text-(--color-fg) group-hover:underline">
				Upload Receipt →
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1">
				{data.integrationStatus !== 'ok'
					? 'Connect an integration first'
					: data.todayCount >= data.dailyLimit
						? 'Daily limit reached'
						: `${data.dailyLimit - data.todayCount} uploads remaining today`}
			</p>
		</a>

		<a
			href="/dashboard/receipts"
			class="border-2 border-(--color-border) p-5 no-underline hover:border-(--color-fg) hover:shadow-[4px_4px_0px_0px_var(--card-shadow)] transition-all group"
		>
			<p class="font-black text-xs uppercase tracking-widest text-(--color-fg) group-hover:underline">
				View All Receipts →
			</p>
			<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1">
				{data.successCount} processed · {data.failedCount} failed
			</p>
		</a>
	</div>

</div>
