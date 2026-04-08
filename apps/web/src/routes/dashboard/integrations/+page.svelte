<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	// Track dismissal separately so flash derives reactively from data
	let dismissed = $state(false);
	let flash = $derived(dismissed ? null : data.flash);

	$effect(() => {
		if (flash) {
			const t = setTimeout(() => {
				dismissed = true;
			}, 4000);
			return () => clearTimeout(t);
		}
	});

	/** @type {Record<string, boolean>} */
	let disconnecting = $state({});

	/** @type {Record<string, boolean>} */
	let connecting = $state({});

	/**
	 * @param {string} provider
	 */
	function connect(provider) {
		connecting[provider] = true;
		window.location.href = `/api/integrations/${provider}/authorize`;
	}

	/**
	 * @param {string} provider
	 */
	async function disconnect(provider) {
		disconnecting[provider] = true;
		try {
			const res = await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
			if (res.ok) {
				await goto(resolve('/dashboard/integrations'), { invalidateAll: true });
			}
		} finally {
			disconnecting[provider] = false;
		}
	}

	/**
	 * @param {string} scope
	 * @returns {string | null}
	 */
	function scopeLabel(scope) {
		/** @type {Record<string, string | null>} */
		const labels = {
			'https://www.googleapis.com/auth/drive.file': 'Google Drive (file access)',
			'https://www.googleapis.com/auth/spreadsheets': 'Google Sheets (read/write)',
			'Files.ReadWrite': 'OneDrive / SharePoint (read/write)',
			offline_access: 'Offline access (refresh tokens)',
			openid: null,
			email: null,
			profile: null
		};
		return scope in labels ? labels[scope] : scope;
	}

	const PROVIDERS = [
		{
			id: 'google',
			name: 'Google Workspace',
			description: 'Connect Google Drive for receipt storage and Google Sheets for ledger sync.',
			capabilities: [
				'Receipt upload to Google Drive',
				'Spreadsheet creation & update via Sheets API'
			],
			badge: 'G'
		},
		{
			id: 'microsoft',
			name: 'Microsoft 365',
			description: 'Connect OneDrive for receipt storage and Excel Online for spreadsheet automation.',
			capabilities: [
				'Receipt upload to OneDrive',
				'Workbook creation & update via Excel Graph API'
			],
			badge: 'M'
		}
	];
</script>

<svelte:head>
	<title>Cloud Integrations | FuzzyFinance</title>
</svelte:head>

<div class="max-w-4xl mx-auto flex flex-col gap-8">
	{#if flash}
		{@const label = flash === 'google' ? 'Google Workspace' : 'Microsoft 365'}
		<div
			class="border-2 border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) p-4 font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-3"
		>
			<span class="w-2 h-2 bg-(--nav-active-fg) inline-block"></span>
			{label} integration authorized. Credentials stored securely.
		</div>
	{/if}

	<Card title="External Integration Channels">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			AUTHORIZE ACCESS TO CLOUD WORKSPACE PROVIDERS. CREDENTIALS ARE STORED SERVER-SIDE AND USED
			EXCLUSIVELY FOR RECEIPT ARCHIVAL AND LEDGER OPERATIONS.
		</p>

		<div class="flex flex-col gap-6">
			{#each PROVIDERS as provider (provider.id)}
				{@const integration = data.integrations[provider.id]}
				{@const connected = !!integration}

				<div
					class="border-2 {connected
						? 'border-(--color-fg)'
						: 'border-(--color-border)'} p-6 flex flex-col gap-4 transition-all"
				>
					<!-- Provider header -->
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-center gap-4">
							<div
								class="w-10 h-10 border-2 border-(--color-border) bg-(--color-bg) flex items-center justify-center font-black text-sm shrink-0"
							>
								{provider.badge}
							</div>
							<div>
								<h3 class="font-black uppercase tracking-tight text-sm text-(--color-fg)">
									{provider.name}
								</h3>
								<p class="text-[10px] font-mono text-(--color-muted-foreground) mt-0.5">
									{provider.description}
								</p>
							</div>
						</div>

						<div class="shrink-0">
							{#if connected}
								<span
									class="inline-block px-2 py-1 border border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) text-[9px] font-black uppercase tracking-widest"
								>CONNECTED</span>
							{:else}
								<span
									class="inline-block px-2 py-1 border border-(--color-border) text-(--color-muted-foreground) text-[9px] font-black uppercase tracking-widest"
								>NOT LINKED</span>
							{/if}
						</div>
					</div>

					<!-- Capabilities -->
					<ul class="flex flex-col gap-1">
						{#each provider.capabilities as cap (cap)}
							<li
								class="flex items-center gap-2 text-[10px] font-mono text-(--color-muted-foreground)"
							>
								<span class="w-1.5 h-1.5 border border-(--color-border) shrink-0"></span>
								{cap}
							</li>
						{/each}
					</ul>

					<!-- Connected details -->
					{#if connected && integration}
						<div class="border-t border-(--color-border) pt-4 flex flex-col gap-2">
							{#if integration.accountEmail}
								<div class="flex gap-2 items-baseline font-mono text-[10px]">
									<span class="text-(--color-muted-foreground) uppercase">ACCOUNT:</span>
									<span class="font-bold text-(--color-fg)">{integration.accountEmail}</span>
								</div>
							{/if}

							{#if integration.tokenExpiresAt}
								<div class="flex gap-2 items-baseline font-mono text-[10px]">
									<span class="text-(--color-muted-foreground) uppercase">TOKEN EXPIRES:</span>
									<span class="font-bold text-(--color-fg)">
										{new Date(integration.tokenExpiresAt).toLocaleString()}
									</span>
								</div>
							{/if}

							{#if integration.scopes.length}
								<div class="flex flex-col gap-1">
									<span class="font-mono text-[10px] uppercase text-(--color-muted-foreground)">
										GRANTED SCOPES:
									</span>
									<ul class="flex flex-col gap-0.5 pl-2">
										{#each integration.scopes as scope (scope)}
											{@const label = scopeLabel(scope)}
											{#if label}
												<li
													class="font-mono text-[10px] text-(--color-fg) flex items-center gap-2"
												>
													<span class="text-(--color-success)">+</span>
													{label}
												</li>
											{/if}
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex gap-3 pt-2">
						{#if connected}
							<Button
								variant="danger"
								onclick={() => disconnect(provider.id)}
								class="text-xs font-black uppercase tracking-widest"
							>
								{disconnecting[provider.id] ? 'REVOKING...' : 'REVOKE ACCESS'}
							</Button>
							<Button
								variant="secondary"
								onclick={() => connect(provider.id)}
								class="text-xs font-black uppercase tracking-widest"
							>
								{connecting[provider.id] ? 'REDIRECTING...' : 'RE-AUTHORIZE'}
							</Button>
						{:else}
							<Button
								variant="primary"
								onclick={() => connect(provider.id)}
								class="text-xs font-black uppercase tracking-widest"
							>
								{connecting[provider.id] ? 'REDIRECTING...' : 'AUTHORIZE ACCESS'}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</Card>

	<Card title="Integration Security Notes">
		<div class="flex flex-col gap-3 font-mono text-[10px] text-(--color-muted-foreground)">
			<p>— TOKENS ARE STORED SERVER-SIDE AND NEVER EXPOSED TO THE BROWSER AFTER AUTHORIZATION.</p>
			<p>
				— ONLY MINIMUM REQUIRED SCOPES ARE REQUESTED: FILE CREATION AND SPREADSHEET ACCESS. BROAD
				READ ACCESS TO EXISTING FILES IS NOT REQUESTED.
			</p>
			<p>
				— REVOKING ACCESS REMOVES ALL STORED CREDENTIALS IMMEDIATELY. YOU MAY ALSO REVOKE DIRECTLY
				FROM YOUR GOOGLE OR MICROSOFT ACCOUNT SECURITY SETTINGS.
			</p>
			<p>— REFRESH TOKENS ENABLE BACKGROUND OPERATIONS WITHOUT REPEATED USER INTERACTION.</p>
		</div>
	</Card>
</div>
