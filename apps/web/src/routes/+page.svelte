<script>
	import { authClient } from '$lib/auth-client';
    import logo from '$lib/images/fuzzyfin.png';

	let loading = $state(false);

	const loginWithGoogle = async () => {
		loading = true;
		await authClient.signIn.social({
			provider: 'google',
			callbackURL: '/dashboard'
		});
	};

	const STATS = [
		{ label: 'RECEIPTS PROCESSED',  value: '>10' },
		{ label: 'TOTAL TRACKED',       value: '>2000'  },
		{ label: 'EXPORTS GENERATED',   value: '>3'  },
		{ label: 'UPTIME',              value: '99.9%'  },
	];
</script>

<svelte:head>
	<title>FuzzyFinance — Login</title>
</svelte:head>

<div class="min-h-screen flex bg-(--color-bg) text-(--color-fg)">

	<!-- Left panel: branding (desktop only) -->
	<div class="hidden lg:flex flex-col justify-between w-[52%] border-r-4 border-(--color-border) p-12 bg-(--color-fg) text-(--color-bg) relative overflow-hidden">

		<!-- Background grid decoration -->
		<div class="absolute inset-0 opacity-[0.07]" aria-hidden="true"
			style="background-image: repeating-linear-gradient(0deg, currentColor 0, currentColor 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 40px);">
		</div>

		<!-- Wordmark -->
		<div class="relative z-10">
			<div class="flex items-center gap-3 mb-2">
				<div class="w-2 h-2 bg-(--color-bg)"></div>
				<span class="font-mono text-[9px] font-black uppercase tracking-[0.3em] opacity-60">SYSTEM V2.0 · CLEARANCE LVL_04</span>
			</div>
			<h1 class="font-black text-7xl uppercase tracking-tighter leading-none mt-6">
				Fuzzy<br/>Finance
			</h1>
			<p class="font-mono text-xs mt-5 opacity-60 max-w-xs leading-relaxed uppercase tracking-wider">
				Autonomous receipt intelligence and financial operations platform.
			</p>
		</div>

		<!-- Stat grid -->
		<div class="relative z-10 grid grid-cols-2 gap-px border-2 border-(--color-bg) border-opacity-20">
			{#each STATS as stat (stat.label)}
				<div class="p-5 border border-(--color-bg) border-opacity-10 flex flex-col gap-1">
					<span class="font-mono text-[9px] uppercase tracking-widest opacity-50">{stat.label}</span>
					<span class="font-black text-3xl tabular-nums">{stat.value}</span>
				</div>
			{/each}
		</div>

		<!-- Status bar -->
		<div class="relative z-10">
			<div class="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest opacity-50 mb-3">
				<span>SECURE CHANNEL: ACTIVE</span>
				<span>ENCRYPTION: AES-256</span>
			</div>
			<div class="h-px w-full bg-(--color-bg) opacity-20 mb-3"></div>
			<div class="flex items-center gap-2">
				<div class="w-1.5 h-1.5 bg-green-400 animate-pulse"></div>
				<span class="font-mono text-[9px] uppercase tracking-widest opacity-60">ALL SYSTEMS OPERATIONAL</span>
			</div>
		</div>
	</div>

	<!-- Right panel: auth -->
	<div style="background-image: url({logo}); background-size: cover; background-repeat: no-repeat; background-position: center; " class="flex-1 flex flex-col items-center justify-center p-8 lg:p-16">

		<!-- Mobile wordmark -->
		<div class="lg:hidden mb-10 text-center">
			<h1 class="font-black text-4xl uppercase tracking-tighter text-(--color-fg)">FuzzyFinance</h1>
			<p class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) mt-1">Financial Operations Platform</p>
		</div>

		<div class="w-full max-w-sm" >
			<!-- Auth card -->
			<div class="border-4 border-(--color-border) bg-(--color-bg) p-8 shadow-[8px_8px_0px_0px_var(--card-shadow)]">

				<div class="mb-8">
					<div class="flex items-center gap-2 mb-4">
						<div class="w-2 h-2 bg-(--color-fg)"></div>
						<span class="font-mono text-[9px] uppercase tracking-[0.25em] text-(--color-muted-foreground)">AUTHENTICATION REQUIRED</span>
					</div>
					<h2 class="font-black text-2xl uppercase tracking-tight text-(--color-fg)">Sign In</h2>
					<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-2 leading-relaxed uppercase">
						Authorised personnel only. All access is logged and monitored.
					</p>
				</div>

				<div class="border-t-2 border-(--color-border) mb-8"></div>

				<button
					onclick={loginWithGoogle}
					disabled={loading}
					class="w-full flex items-center gap-4 px-5 py-4 border-2 border-(--color-border) bg-(--color-fg) text-(--color-bg) font-black text-sm uppercase tracking-widest hover:bg-(--color-bg) hover:text-(--color-fg) transition-all disabled:opacity-50 disabled:pointer-events-none"
				>
					{#if loading}
						<span class="w-5 h-5 border-2 border-(--color-bg) border-t-transparent animate-spin flex-shrink-0"></span>
						<span class="flex-1 text-left">AUTHENTICATING...</span>
					{:else}
						<svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
							<path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.162-1.9 4.162-1.228 1.228-3.14 2.56-6.42 2.56-5.14 0-9.2-4.16-9.2-9.2s4.06-9.2 9.2-9.2c2.78 0 4.86 1.08 6.36 2.52l2.308-2.308C18.6 1.08 15.86 0 12.48 0 6.2 0 1.1 5.1 1.1 11.3s5.1 11.3 11.3 11.3c3.42 0 6.02-1.12 8.04-3.2 2.08-2.08 2.74-4.98 2.74-7.34 0-.72-.06-1.42-.18-2.06H12.48z"/>
						</svg>
						<span class="flex-1 text-left">Continue with Google</span>
						<span class="font-mono text-[10px] opacity-60">→</span>
					{/if}
				</button>

				<p class="mt-6 text-center font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
					SSO · Google Workspace
				</p>
			</div>

			<div class="mt-5 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
				<span>FuzzyFinance © 2026</span>
				<div class="flex items-center gap-1.5">
					<div class="w-1.5 h-1.5 bg-green-500"></div>
					<span>Secure</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		display: block;
	}
</style>
