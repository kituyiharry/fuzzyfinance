<script>
	import Card from '$lib/components/Card.svelte';
	import { themeStore } from '$lib/theme.svelte.js';
</script>

<svelte:head>
	<title>System Settings | FuzzyFinance</title>
</svelte:head>

<div class="max-w-4xl mx-auto flex flex-col gap-8">
	<Card title="Personnel Configuration">
		<div class="flex flex-col gap-6">
			<div>
				<h3 class="text-xs font-black uppercase tracking-widest mb-4">Interface Appearance</h3>
				<p class="text-xs text-[var(--color-muted-foreground)] mb-6 font-mono italic">
					SELECT OPERATIONAL COLOR SCHEME. SETTINGS ARE PERSISTED TO LOCAL STORAGE FOR AUTOMATIC INITIALIZATION.
				</p>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<!-- Light Mode Option -->
					<button
						onclick={() => themeStore.set('light')}
						class="flex flex-col gap-3 p-4 border-2 transition-all {themeStore.current === 'light' ? 'border-[var(--color-fg)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] shadow-[4px_4px_0px_0px_var(--card-shadow)]' : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-fg)]'}"
					>
						<span class="text-xs font-black uppercase tracking-tighter">High Contrast Light</span>
						<div class="h-2 w-full bg-white border border-black"></div>
						<div class="flex gap-1">
							<div class="h-1 w-1/3 bg-black"></div>
							<div class="h-1 w-2/3 bg-gray-200"></div>
						</div>
					</button>

					<!-- Dark Mode Option -->
					<button
						onclick={() => themeStore.set('dark')}
						class="flex flex-col gap-3 p-4 border-2 transition-all {themeStore.current === 'dark' ? 'border-[var(--color-fg)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] shadow-[4px_4px_0px_0px_var(--card-shadow)]' : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-fg)]'}"
					>
						<span class="text-xs font-black uppercase tracking-tighter">High Contrast Dark</span>
						<div class="h-2 w-full bg-black border border-white"></div>
						<div class="flex gap-1">
							<div class="h-1 w-1/3 bg-white"></div>
							<div class="h-1 w-2/3 bg-gray-800"></div>
						</div>
					</button>

					<!-- Pastel Mode Option -->
					<button
						onclick={() => themeStore.set('low-contrast')}
						class="flex flex-col gap-3 p-4 border-2 transition-all {themeStore.current === 'low-contrast' ? 'border-[var(--color-fg)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] shadow-[4px_4px_0px_0px_var(--card-shadow)]' : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg)] hover:border-[var(--color-fg)]'}"
					>
						<span class="text-xs font-black uppercase tracking-tighter">Low Contrast Pastel</span>
						<div class="h-2 w-full bg-[#fdfcf0] border border-[#b4b4b4]"></div>
						<div class="flex gap-1">
							<div class="h-1 w-1/3 bg-[#a8dadc]"></div>
							<div class="h-1 w-2/3 bg-[#f1faee]"></div>
						</div>
					</button>
				</div>
			</div>

			<div class="h-[2px] w-full bg-[var(--color-border)] opacity-10"></div>

			<div>
				<h3 class="text-xs font-black uppercase tracking-widest mb-4">Personnel Information</h3>
				<div class="grid grid-cols-2 gap-4 font-mono text-[10px]">
					<div class="flex flex-col gap-1">
						<span class="text-[var(--color-muted-foreground)]">IDENTIFIER:</span>
						<span class="font-bold">PERSONNEL_ALPHA_001</span>
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-[var(--color-muted-foreground)]">CLEARANCE:</span>
						<span class="font-bold">LEVEL_04_EXECUTIVE</span>
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-[var(--color-muted-foreground)]">MANDATORY_SSL:</span>
						<span class="font-bold text-green-600">ENABLED</span>
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-[var(--color-muted-foreground)]">LAST_ACCESS:</span>
						<span class="font-bold">{new Date().toISOString()}</span>
					</div>
				</div>
			</div>
		</div>
	</Card>

	<Card title="Security Protocols">
		<p class="text-xs font-mono italic text-[var(--color-muted-foreground)] mb-4">
			SESSION TERMINATION PROTOCOL. ALL CACHED OPERATIONAL DATA WILL BE WIPED UPON DE-AUTHORIZATION.
		</p>
		<button class="w-full p-4 border-2 border-red-600 text-red-600 font-black uppercase tracking-[0.2em] text-xs hover:bg-red-600 hover:text-white transition-all">
			Initiate Global Sign-Out
		</button>
	</Card>
</div>
