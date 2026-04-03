<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { authClient } from '$lib/auth-client';
	import { themeStore } from '$lib/theme.svelte.js';

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

<div class="flex flex-1 overflow-hidden bg-[var(--color-bg)] text-[var(--color-fg)]">
	<!-- Navigation Drawer -->
	<aside class="w-64 border-r-4 border-[var(--color-border)] bg-[var(--header-bg)] flex flex-col">
		<div class="p-6 border-b-2 border-[var(--color-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]">
			<h3 class="text-xs font-black uppercase tracking-widest">Navigation</h3>
		</div>
		
		<nav class="flex-1 p-4">
			<ul class="flex flex-col gap-2">
				<li>
					<a href="/dashboard" class="flex items-center gap-3 p-3 bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] font-bold uppercase text-xs tracking-widest no-underline">
						<span class="w-2 h-2 bg-[var(--nav-active-fg)]"></span>
						Overview
					</a>
				</li>
				<li>
					<a href="/dashboard/reports" class="flex items-center gap-3 p-3 hover:bg-[var(--nav-active-bg)] hover:text-[var(--nav-active-fg)] font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-[var(--color-border)]"></span>
						Financial Reports
					</a>
				</li>
				<li>
					<a href="/dashboard/transactions" class="flex items-center gap-3 p-3 hover:bg-[var(--nav-active-bg)] hover:text-[var(--nav-active-fg)] font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-[var(--color-border)]"></span>
						Transactions
					</a>
				</li>
				<li>
					<a href="/dashboard/settings" class="flex items-center gap-3 p-3 hover:bg-[var(--nav-active-bg)] hover:text-[var(--nav-active-fg)] font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 border border-[var(--color-border)]"></span>
						System Config
					</a>
				</li>
			</ul>
		</nav>

		<!-- Theme Switcher in Sidebar -->
		<div class="p-4 border-t border-[var(--color-border)] flex gap-2 justify-center">
			<button
				onclick={() => themeStore.set('light')}
				class="p-1 px-3 text-[10px] font-bold border border-[var(--color-border)] {themeStore.current === 'light' ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : ''}"
			>
				LIGHT
			</button>
			<button
				onclick={() => themeStore.set('dark')}
				class="p-1 px-3 text-[10px] font-bold border border-[var(--color-border)] {themeStore.current === 'dark' ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : ''}"
			>
				DARK
			</button>
			<button
				onclick={() => themeStore.set('low-contrast')}
				class="p-1 px-3 text-[10px] font-bold border border-[var(--color-border)] {themeStore.current === 'low-contrast' ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : ''}"
			>
				PASTEL
			</button>
		</div>

		<div class="p-4 border-t-2 border-[var(--color-border)]">
			<Button onclick={logout} variant="secondary" class="w-full text-xs font-black">
				TERMINATE SESSION
			</Button>
		</div>
	</aside>

	<!-- Main Content Area -->
	<main class="flex-1 overflow-y-auto p-8 bg-[var(--color-muted)]">
		<header class="mb-8 flex items-end justify-between border-b-4 border-[var(--color-border)] pb-4">
			<div>
				<h1 class="text-4xl font-black uppercase tracking-tighter text-[var(--color-fg)]">Executive Dashboard</h1>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">Global Financial Control Center</p>
			</div>
			<div class="text-right font-mono text-[10px] font-bold uppercase text-[var(--color-fg)]">
				<p>SECURE CHANNEL: ACTIVE</p>
				<p>CLEARANCE: LVL_04</p>
			</div>
		</header>

		<!-- Dashboard Grid -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Metric Card 1 -->
			<Card class="border-l-8 border-l-[var(--color-border)]" title="Current Liquidity">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">$2,485,102.40</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-green-600">
						<span class="bg-green-100 px-1">▲ +12.5%</span>
						<span>Since last quarter</span>
					</div>
				</div>
			</Card>

			<!-- Metric Card 2 -->
			<Card class="border-l-8 border-l-[var(--color-border)]" title="Operational Burn">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">$142,000.00</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-red-600">
						<span class="bg-red-100 px-1">▼ -2.1%</span>
						<span>Target: &lt $150k</span>
					</div>
				</div>
			</Card>

			<!-- Metric Card 3 -->
			<Card class="border-l-8 border-l-[var(--color-border)]" title="Risk Index">
				<div class="flex flex-col gap-2">
					<span class="text-4xl font-black tabular-nums">0.024</span>
					<div class="flex items-center gap-2 text-[10px] font-black uppercase text-[var(--color-muted-foreground)]">
						<span class="bg-[var(--color-muted)] px-1">STABLE</span>
						<span>Within parameters</span>
					</div>
				</div>
			</Card>

			<!-- Spreadsheet Table Placeholder -->
			<div class="lg:col-span-3">
				<Card title="Real-time Transaction Ledger">
					<div class="grid-container w-full font-mono text-xs">
						<!-- Header -->
						<div class="grid grid-cols-5 bg-[var(--color-fg)] text-[var(--color-bg)] font-bold uppercase tracking-widest">
							<div class="grid-cell border-[var(--color-border)]">ID</div>
							<div class="grid-cell border-[var(--color-border)]">Entity</div>
							<div class="grid-cell border-[var(--color-border)]">Amount</div>
							<div class="grid-cell border-[var(--color-border)]">Category</div>
							<div class="grid-cell border-[var(--color-border)]">Status</div>
						</div>
						<!-- Rows -->
						{#each Array(5) as _, i}
							<div class="grid grid-cols-5 hover:bg-[var(--color-muted)] transition-colors text-[var(--color-fg)]">
								<div class="grid-cell border-[var(--grid-color)]">TXN_{1024 + i}</div>
								<div class="grid-cell border-[var(--grid-color)]">GLOBAL_CORP_{i + 1}</div>
								<div class="grid-cell border-[var(--grid-color)] tabular-nums">${(Math.random() * 50000).toFixed(2)}</div>
								<div class="grid-cell border-[var(--grid-color)]">OPERATIONS</div>
								<div class="grid-cell border-[var(--grid-color)]">
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
