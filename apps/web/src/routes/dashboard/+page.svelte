<script>
	import Card from '$lib/components/Card.svelte';
</script>

<!-- Dashboard Grid -->
<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<!-- Metric Card 1 -->
	<Card class="border-l-8 border-l-(--color-border)" title="Current Liquidity">
		<div class="flex flex-col gap-2">
			<span class="text-4xl font-black tabular-nums">$2,485,102.40</span>
			<div class="flex items-center gap-2 text-[10px] font-black uppercase text-green-600">
				<span class="bg-green-100 px-1">▲ +12.5%</span>
				<span>Since last quarter</span>
			</div>
		</div>
	</Card>

	<!-- Metric Card 2 -->
	<Card class="border-l-8 border-l-(--color-border)" title="Operational Burn">
		<div class="flex flex-col gap-2">
			<span class="text-4xl font-black tabular-nums">$142,000.00</span>
			<div class="flex items-center gap-2 text-[10px] font-black uppercase text-red-600">
				<span class="bg-red-100 px-1">▼ -2.1%</span>
				<span>Target: &lt $150k</span>
			</div>
		</div>
	</Card>

	<!-- Metric Card 3 -->
	<Card class="border-l-8 border-l-(--color-border)" title="Risk Index">
		<div class="flex flex-col gap-2">
			<span class="text-4xl font-black tabular-nums">0.024</span>
			<div class="flex items-center gap-2 text-[10px] font-black uppercase text-(--color-muted-foreground)">
				<span class="bg-(--color-muted) px-1">STABLE</span>
				<span>Within parameters</span>
			</div>
		</div>
	</Card>

	<!-- Spreadsheet Table Placeholder -->
	<div class="lg:col-span-3">
		<Card title="Real-time Transaction Ledger">
			<div class="grid-container w-full font-mono text-xs">
				<!-- Header -->
				<div class="grid grid-cols-5 bg-(--color-fg) text-(--color-bg) font-bold uppercase tracking-widest">
					<div class="grid-cell border-(--color-border)">ID</div>
					<div class="grid-cell border-(--color-border)">Entity</div>
					<div class="grid-cell border-(--color-border)">Amount</div>
					<div class="grid-cell border-(--color-border)">Category</div>
					<div class="grid-cell border-(--color-border)">Status</div>
				</div>
				<!-- Rows -->
				{#each Array(5) as _, i (i)}
					<div class="grid grid-cols-5 hover:bg-(--color-muted) transition-colors text-(--color-fg)">
						<div class="grid-cell border-(--grid-color)">TXN_{1024 + i}</div>
						<div class="grid-cell border-(--grid-color)">GLOBAL_CORP_{i + 1}</div>
						<div class="grid-cell border-(--grid-color) tabular-nums">${(Math.random() * 50000).toFixed(2)}</div>
						<div class="grid-cell border-(--grid-color)">OPERATIONS</div>
						<div class="grid-cell border-(--grid-color)">
							<span class="bg-green-100 px-2 py-0.5 text-[10px] font-black text-green-700">CLEARED</span>
						</div>
					</div>
				{/each}
			</div>
		</Card>
	</div>
</div>
