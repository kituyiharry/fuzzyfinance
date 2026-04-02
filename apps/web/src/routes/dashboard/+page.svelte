<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { authClient } from '$lib/auth-client';

	const logout = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = '/';
				}
			}
		});
	};
</script>

<svelte:head>
	<title>Dashboard | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-1 overflow-hidden bg-[#f3f4f6]">
	<!-- Navigation Drawer -->
	<aside class="w-64 border-r-4 border-black bg-white flex flex-col">
		<div class="p-6 border-b-2 border-black bg-black text-white">
			<h3 class="text-xs font-black uppercase tracking-widest">Navigation</h3>
		</div>
		
		<nav class="flex-1 p-4">
			<ul class="flex flex-col gap-2">
				<li>
					<a href="/dashboard" class="flex items-center gap-3 p-3 bg-black text-white font-bold uppercase text-xs tracking-widest no-underline">
						<span class="w-2 h-2 bg-white"></span>
						Overview
					</a>
				</li>
				<li>
					<a href="/dashboard/reports" class="flex items-center gap-3 p-3 hover:bg-black hover:text-white font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-black"></span>
						Financial Reports
					</a>
				</li>
				<li>
					<a href="/dashboard/transactions" class="flex items-center gap-3 p-3 hover:bg-black hover:text-white font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-black"></span>
						Transactions
					</a>
				</li>
				<li>
					<a href="/dashboard/settings" class="flex items-center gap-3 p-3 hover:bg-black hover:text-white font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-black"></span>
						System Config
					</a>
				</li>
			</ul>
		</nav>

		<div class="p-4 border-t-2 border-black">
			<Button onclick={logout} variant="secondary" class="w-full text-xs font-black">
				TERMINATE SESSION
			</Button>
		</div>
	</aside>

	<!-- Main Content Area -->
	<main class="flex-1 overflow-y-auto p-8">
		<header class="mb-8 flex items-end justify-between border-b-4 border-black pb-4">
			<div>
				<h1 class="text-4xl font-black uppercase tracking-tighter">Executive Dashboard</h1>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Global Financial Control Center</p>
			</div>
			<div class="text-right font-mono text-[10px] font-bold uppercase">
				<p>SECURE CHANNEL: ACTIVE</p>
				<p>CLEARANCE: LVL_04</p>
			</div>
		</header>

		<!-- Dashboard Grid -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Metric Card 1 -->
			<Card class="border-l-8 border-l-black" title="Current Liquidity">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">$2,485,102.40</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-green-600">
						<span class="bg-green-100 px-1">▲ +12.5%</span>
						<span>Since last quarter</span>
					</div>
				</div>
			</Card>

			<!-- Metric Card 2 -->
			<Card class="border-l-8 border-l-black" title="Operational Burn">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">$142,000.00</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-red-600">
						<span class="bg-red-100 px-1">▼ -2.1%</span>
						<span>Target: < $150k</span>
					</div>
				</div>
			</Card>

			<!-- Metric Card 3 -->
			<Card class="border-l-8 border-l-black" title="Risk Index">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">0.024</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-gray-500">
						<span class="bg-gray-100 px-1">STABLE</span>
						<span>Within parameters</span>
					</div>
				</div>
			</Card>

			<!-- Spreadsheet Table Placeholder -->
			<div class="lg:col-span-3">
				<Card title="Real-time Transaction Ledger">
					<div class="grid-container w-full font-mono text-xs">
						<!-- Header -->
						<div class="grid grid-cols-5 bg-black text-white font-bold uppercase tracking-widest">
							<div class="grid-cell border-black">ID</div>
							<div class="grid-cell border-black">Entity</div>
							<div class="grid-cell border-black">Amount</div>
							<div class="grid-cell border-black">Category</div>
							<div class="grid-cell border-black">Status</div>
						</div>
						<!-- Rows -->
						{#each Array(5) as _, i}
							<div class="grid grid-cols-5 hover:bg-gray-50 transition-colors">
								<div class="grid-cell">TXN_{1024 + i}</div>
								<div class="grid-cell">GLOBAL_CORP_{i + 1}</div>
								<div class="grid-cell tabular-nums">${(Math.random() * 50000).toFixed(2)}</div>
								<div class="grid-cell">OPERATIONS</div>
								<div class="grid-cell">
									<span class="bg-green-100 px-2 py-0.5 text-[10px] font-black text-green-700">CLEARED</span>
								</div>
							</div>
						{/each}
					</div>
				</Card>
			</div>
		</div>
	</main>
</div>
