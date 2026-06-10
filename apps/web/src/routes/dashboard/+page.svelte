<script>
	import Card from '$lib/components/Card.svelte';
	import SpendingChart from '$lib/components/SpendingChart.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();
</script>

<svelte:head>
	<title>Overview | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">

	<!-- Spending charts -->
	<div>
		<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold mb-2">Spending — Expenses</p>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<Card title="Spending by Expense Date">
				<SpendingChart data={data.spendingByReceiptDate} label="Amount (expense date)" />
			</Card>
			<Card title="Spending by Upload Date">
				<SpendingChart data={data.spendingByProcessingDate} label="Amount (uploaded)" />
			</Card>
		</div>
	</div>

	<!-- Revenue charts -->
	<div>
		<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold mb-2">Revenue</p>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<Card title="Revenue by Document Date">
				<SpendingChart data={data.revenueByDate} label="Revenue (document date)" />
			</Card>
			<Card title="Revenue by Upload Date">
				<SpendingChart data={data.revenueByProcessingDate} label="Revenue (uploaded)" />
			</Card>
		</div>
	</div>

</div>
