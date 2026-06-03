<script>
	import Card from '$lib/components/Card.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** Human-readable descriptions for the standard + custom scopes. */
	const SCOPE_DESCRIPTIONS = {
		'openid':          'Confirm your identity',
		'profile':         'Read your basic profile (name, picture)',
		'email':           'Read your email address',
		'offline_access':  'Stay connected without you needing to sign in again',
		'receipts.read':   'Read your receipts and search your receipt history',
		'receipts.write':  'Add and update receipts on your behalf',
	};

	/** @param {string} s */
	const describe = (s) => SCOPE_DESCRIPTIONS[s] ?? s;

	let submitting = $state(false);

	/** @param {boolean} accept */
	async function decide(accept) {
		submitting = true;
		try {
			const res = await fetch('/api/auth/oauth2/consent', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accept, consent_code: data.consentCode }),
			});
			if (res.ok) {
				const body = await res.json().catch(() => /** @type {any} */ ({}));
				if (body?.redirectURI || body?.redirectUri || body?.redirect_uri) {
					window.location.href = body.redirectURI ?? body.redirectUri ?? body.redirect_uri;
					return;
				}
			}
			// If no redirect was returned, send the user back to the dashboard.
			window.location.href = '/dashboard';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Authorise {data.appName} | FuzzyFinance</title>
</svelte:head>

<div class="max-w-md mx-auto mt-24 px-4">
	<Card title="Authorise {data.appName}">
		<p class="font-mono text-xs text-(--color-fg) mb-4">
			<span class="font-black">{data.appName}</span> wants to:
		</p>

		<ul class="space-y-2 mb-6">
			{#each data.scopes as s (s)}
				<li class="flex gap-2 font-mono text-[11px] text-(--color-fg)">
					<span class="text-(--color-accent)">▸</span>
					<span>{describe(s)}</span>
				</li>
			{/each}
		</ul>

		<p class="font-mono text-[10px] text-(--color-muted-foreground) mb-6">
			You can revoke this access any time from <a href="/dashboard/settings/developer" class="underline">Settings → Developer</a>.
		</p>

		<div class="flex gap-2">
			<button
				onclick={() => decide(true)}
				disabled={submitting}
				class="flex-1 border-2 border-(--color-border) bg-(--color-fg) text-(--color-bg) px-4 py-2 font-mono text-xs uppercase tracking-widest font-black hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-wait"
			>{submitting ? 'Authorising…' : 'Allow'}</button>
			<button
				onclick={() => decide(false)}
				disabled={submitting}
				class="flex-1 border-2 border-(--color-border) px-4 py-2 font-mono text-xs uppercase tracking-widest hover:bg-(--color-muted) transition-colors disabled:opacity-50"
			>Cancel</button>
		</div>
	</Card>
</div>
