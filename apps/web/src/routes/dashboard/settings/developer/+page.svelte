<script>
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @param {string | null | undefined} iso */
	const fmt = (iso) => iso
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
		: '—';
</script>

<svelte:head>
	<title>Developer | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-3xl mx-auto">
	<a
		href="/dashboard/settings"
		class="font-mono text-[10px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)"
	>← Back to Settings</a>

	<Card title="Connected Apps ({data.apps.length})">
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mb-4">
			Third-party applications you've authorised to access your receipts via OAuth (ChatGPT, mobile, etc.). Revoking removes all tokens — the app will need you to sign in again.
		</p>

		{#if data.apps.length === 0}
			<EmptyState
				message="No apps connected"
				submessage="Authorise an app via OAuth (e.g. FuzzyFinance for ChatGPT) and it will appear here."
			/>
		{:else}
			<div class="flex flex-col gap-3">
				{#each data.apps as app (app.clientId)}
					<div class="border-2 border-(--color-border) p-3">
						<div class="flex items-start justify-between gap-3 mb-2">
							<div>
								<div class="font-mono text-xs font-black uppercase tracking-widest text-(--color-fg)">
									{app.name}
								</div>
								<div class="font-mono text-[9px] text-(--color-muted-foreground)">
									client_id: {app.clientId} · last issued {fmt(app.lastIssued)} · {app.tokenIds.length} active token{app.tokenIds.length === 1 ? '' : 's'}
								</div>
							</div>
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="clientId" value={app.clientId} />
								<button
									type="submit"
									class="border-2 border-(--color-border) px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-(--color-danger) hover:bg-(--color-danger) hover:text-(--color-bg) transition-colors"
								>Revoke</button>
							</form>
						</div>
						<div class="flex flex-wrap gap-1">
							{#each app.scopes as scope (scope)}
								<span class="border border-(--color-border) px-1.5 py-0.5 font-mono text-[9px] text-(--color-fg)">{scope}</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<Card title="API Reference">
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mb-3">
			The FuzzyFinance API exposes receipts to authenticated third-party clients via OAuth 2.0 (Authorization Code + PKCE).
		</p>
		<ul class="font-mono text-[10px] text-(--color-fg) space-y-1.5">
			<li><span class="text-(--color-muted-foreground)">OpenAPI spec:</span> <a class="underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a></li>
			<li><span class="text-(--color-muted-foreground)">Discovery:</span> <a class="underline" href="/api/auth/.well-known/openid-configuration">/api/auth/.well-known/openid-configuration</a></li>
			<li><span class="text-(--color-muted-foreground)">Authorize:</span> /api/auth/oauth2/authorize</li>
			<li><span class="text-(--color-muted-foreground)">Token:</span> /api/auth/oauth2/token</li>
			<li><span class="text-(--color-muted-foreground)">Scopes:</span> receipts.read, receipts.write, offline_access</li>
		</ul>
	</Card>
</div>
