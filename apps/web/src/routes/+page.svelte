<script>
	import { authClient } from '$lib/auth-client';
    import logo from '$lib/images/fuzzyfin.png';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @type {null | 'google' | 'apple'} */
	let loadingProvider = $state(null);

	const loginWithGoogle = async () => {
		loadingProvider = 'google';
		await authClient.signIn.social({
			provider: 'google',
			callbackURL: '/dashboard'
		});
	};

	const loginWithApple = async () => {
		loadingProvider = 'apple';
		await authClient.signIn.social({
			provider: 'apple',
			callbackURL: '/dashboard'
		});
	};

	const STATS = [
		{ label: 'DOCUMENTS PROCESSED',  value: '>10' },
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
				Autonomous expense and revenue intelligence platform.
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

				<div class="flex flex-col gap-3">
					<button
						onclick={loginWithGoogle}
						disabled={loadingProvider !== null}
						class="w-full flex items-center gap-4 px-5 py-4 border-2 border-(--color-border) bg-(--color-fg) text-(--color-bg) font-black text-sm uppercase tracking-widest hover:bg-(--color-bg) hover:text-(--color-fg) transition-all disabled:opacity-50 disabled:pointer-events-none"
					>
						{#if loadingProvider === 'google'}
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

					{#if data.providers.apple}
						<button
							onclick={loginWithApple}
							disabled={loadingProvider !== null}
							class="w-full flex items-center gap-4 px-5 py-4 border-2 border-(--color-border) bg-(--color-bg) text-(--color-fg) font-black text-sm uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-all disabled:opacity-50 disabled:pointer-events-none"
						>
							{#if loadingProvider === 'apple'}
								<span class="w-5 h-5 border-2 border-(--color-fg) border-t-transparent animate-spin flex-shrink-0"></span>
								<span class="flex-1 text-left">AUTHENTICATING...</span>
							{:else}
								<!-- Apple logo per Apple HIG for the "Sign in with Apple" button. -->
								<svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
									<path fill="currentColor" d="M17.05 12.5c-.03-2.96 2.42-4.39 2.53-4.46-1.38-2.02-3.53-2.3-4.29-2.33-1.83-.19-3.57 1.08-4.5 1.08-.94 0-2.37-1.05-3.89-1.02-2 .03-3.85 1.16-4.88 2.95-2.08 3.6-.53 8.93 1.5 11.86 1 1.43 2.18 3.03 3.73 2.97 1.5-.06 2.07-.97 3.88-.97 1.81 0 2.32.97 3.9.94 1.61-.03 2.63-1.45 3.61-2.89 1.14-1.65 1.61-3.26 1.64-3.34-.04-.02-3.14-1.21-3.18-4.79zM14.1 3.6c.83-1.02 1.39-2.42 1.23-3.83-1.19.05-2.65.8-3.51 1.81-.77.9-1.45 2.36-1.27 3.73 1.33.1 2.7-.68 3.55-1.71z"/>
								</svg>
								<span class="flex-1 text-left">Continue with Apple</span>
								<span class="font-mono text-[10px] opacity-60">→</span>
							{/if}
						</button>
					{/if}
				</div>

				<p class="mt-6 text-center font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
					{#if data.providers.apple}
						SSO · Google · Apple (with Private Relay)
					{:else}
						SSO · Google Workspace
					{/if}
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
