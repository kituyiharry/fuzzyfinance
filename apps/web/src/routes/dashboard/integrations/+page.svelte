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

	/** @type {Record<string, boolean>} */
	let syncing = $state({});

	/** @type {Record<string, string | null>} */
	let syncError = $state({});

	let resettingSync = $state(false);
	/** @type {string | null} */
	let resetMessage = $state(null);

	/** Tracks an in-flight mapping change per tenantId. */
	/** @type {Record<string, boolean>} */
	let savingTenant = $state({});

	/**
	 * Persist a tenant's workspace assignment. Empty string in the
	 * select means "use default" → null on the server.
	 * @param {string} tenantId
	 * @param {Event & { currentTarget: HTMLSelectElement }} e
	 */
	async function setTenantWorkspace(tenantId, e) {
		const raw = e.currentTarget.value;
		const workspaceId = raw === '' ? null : raw;
		savingTenant[tenantId] = true;
		try {
			const res = await fetch(`/api/integrations/xero/tenants/${encodeURIComponent(tenantId)}/workspace`, {
				method:  'POST',
				headers: { 'content-type': 'application/json' },
				body:    JSON.stringify({ workspaceId })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				syncError.xero = body?.message ?? `Mapping failed (${res.status})`;
				await goto(resolve('/dashboard/integrations'), { invalidateAll: true });
				return;
			}
			await goto(resolve('/dashboard/integrations'), { invalidateAll: true });
		} finally {
			savingTenant[tenantId] = false;
		}
	}

	async function resetXeroSync() {
		if (!confirm('Reset Xero sync history? The next sync will re-pull every invoice from the start of the active financial year. Existing rows are upserted in place — no data is deleted.')) return;
		resettingSync = true;
		resetMessage = null;
		try {
			const res = await fetch('/api/integrations/xero/reset-sync', { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				resetMessage = body?.message ?? `Reset failed (${res.status})`;
			} else {
				resetMessage = body?.previousLastSyncedAt
					? `Cleared last-sync watermark (was ${new Date(body.previousLastSyncedAt).toLocaleString()}).`
					: 'Cleared sync history.';
				await goto(resolve('/dashboard/integrations'), { invalidateAll: true });
			}
		} catch (/** @type {any} */ err) {
			resetMessage = String(err?.message ?? err);
		} finally {
			resettingSync = false;
		}
	}

	const xero = $derived(data.integrations.xero ?? null);

	/**
	 * `auto` is the default delta behaviour; `previousFy` runs a historical
	 * back-fill of the prior AU/NZ financial year without disturbing the
	 * live-delta watermark.
	 *
	 * @param {string} provider
	 * @param {'auto' | 'previousFy'} [mode]
	 */
	async function syncNow(provider, mode = 'auto') {
		const key = mode === 'previousFy' ? `${provider}:previousFy` : provider;
		syncing[key] = true;
		syncError[provider] = null;
		try {
			const res = await fetch(`/api/integrations/${provider}/sync?mode=${encodeURIComponent(mode)}`, { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				syncError[provider] = body?.message ?? `Sync failed (${res.status})`;
			} else {
				await goto(resolve('/dashboard/integrations'), { invalidateAll: true });
			}
		} catch (/** @type {any} */ err) {
			syncError[provider] = String(err?.message ?? err);
		} finally {
			syncing[key] = false;
		}
	}

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
			'https://www.googleapis.com/auth/generative-language.retriever': 'Google Gemini API access',
			'https://www.googleapis.com/auth/drive.file': 'Google Drive (legacy — no longer requested)',
			'https://www.googleapis.com/auth/spreadsheets': 'Google Sheets (legacy — no longer requested)',
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
			name: 'Google · Gemini',
			description: 'Authorise Gemini for the category classifier (fallback when embeddings can\'t confidently classify a line item).',
			capabilities: [
				'Line-item category inference for synced expenses + revenue',
				'No Drive or Sheets access requested — Gemini scope only'
			],
			badge: 'G'
		},
		{
			id: 'microsoft',
			name: 'Microsoft 365',
			description: 'Reserved for a future Azure-hosted Gemini equivalent.',
			capabilities: [
				'Not active in this pivot'
			],
			badge: 'M',
			comingSoon: true
		}
	];
</script>

<svelte:head>
	<title>Cloud Integrations | FuzzyFinance</title>
</svelte:head>

<div class="max-w-4xl mx-auto flex flex-col gap-8">
	{#if flash}
		{@const label = flash === 'google' ? 'Google Workspace' : flash === 'xero' ? 'Xero' : 'Microsoft 365'}
		<div
			class="border-2 border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) p-4 font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-3"
		>
			<span class="w-2 h-2 bg-(--nav-active-fg) inline-block"></span>
			{label} integration authorized. Credentials stored securely.
		</div>
	{/if}

	<Card title="Accounting Platforms">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			CONNECT YOUR EXISTING ACCOUNTING TOOL TO PULL INVOICES + BILLS DIRECTLY.
			FUZZYFINANCE LAYERS FINE-GRAINED CLASSIFICATION + FUZZY RECIPES ON TOP OF
			YOUR LEDGER — IT NEVER REPLACES IT.
		</p>

		<div class="border-2 {xero ? 'border-(--color-fg)' : 'border-(--color-border)'} p-6 flex flex-col gap-4 transition-all">
			<div class="flex items-start justify-between gap-4">
				<div class="flex items-center gap-4">
					<div class="w-10 h-10 border-2 border-(--color-border) bg-(--color-bg) flex items-center justify-center font-black text-sm shrink-0">X</div>
					<div>
						<h3 class="font-black uppercase tracking-tight text-sm text-(--color-fg)">Xero</h3>
						<p class="text-[10px] font-mono text-(--color-muted-foreground) mt-0.5">
							Read-only: Invoices (revenue), Bills (expenses), Chart of Accounts. AU / NZ / UK.
						</p>
					</div>
				</div>
				<div class="shrink-0">
					{#if xero}
						<span class="inline-block px-2 py-1 border border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) text-[9px] font-black uppercase tracking-widest">CONNECTED</span>
					{:else}
						<span class="inline-block px-2 py-1 border border-(--color-border) text-(--color-muted-foreground) text-[9px] font-black uppercase tracking-widest">NOT LINKED</span>
					{/if}
				</div>
			</div>

			<ul class="flex flex-col gap-1">
				<li class="flex items-center gap-2 text-[10px] font-mono text-(--color-muted-foreground)">
					<span class="w-1.5 h-1.5 border border-(--color-border) shrink-0"></span>
					Pull ACCREC invoices → revenue documents
				</li>
				<li class="flex items-center gap-2 text-[10px] font-mono text-(--color-muted-foreground)">
					<span class="w-1.5 h-1.5 border border-(--color-border) shrink-0"></span>
					Pull ACCPAY bills → expense documents
				</li>
				<li class="flex items-center gap-2 text-[10px] font-mono text-(--color-muted-foreground)">
					<span class="w-1.5 h-1.5 border border-(--color-border) shrink-0"></span>
					Account codes + tracking categories carried into line items
				</li>
				<li class="flex items-center gap-2 text-[10px] font-mono text-(--color-muted-foreground)">
					<span class="w-1.5 h-1.5 border border-(--color-border) shrink-0"></span>
					Multi-org: all your authorised Xero tenants sync in one pass
				</li>
			</ul>

			{#if xero}
				<div class="border-t border-(--color-border) pt-4 flex flex-col gap-2">
					{#if xero.accountEmail}
						<div class="flex gap-2 items-baseline font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">ACCOUNT:</span>
							<span class="font-bold text-(--color-fg)">{xero.accountEmail}</span>
						</div>
					{/if}
					{#if xero.tenants && xero.tenants.length > 0}
						{@const defaultWs = data.workspaces.find((w) => w.isDefault)}
						<div class="flex flex-col gap-2">
							<span class="font-mono text-[10px] uppercase text-(--color-muted-foreground)">TENANTS → WORKSPACES:</span>
							<table class="font-mono text-[10px]">
								<tbody>
									{#each xero.tenants as t (t.tenantId)}
										<tr class="border-b border-(--color-border)/40">
											<td class="py-1 pr-3 text-(--color-fg)">
												<span class="text-(--color-success) mr-1">+</span>
												{t.tenantName}{t.tenantType ? ` · ${t.tenantType}` : ''}
											</td>
											<td class="py-1 text-right">
												<select
													value={t.workspaceId ?? ''}
													onchange={(e) => setTenantWorkspace(t.tenantId, /** @type {Event & { currentTarget: HTMLSelectElement }} */ (e))}
													disabled={!!savingTenant[t.tenantId]}
													class="font-mono text-[10px] px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-fg)"
												>
													<option value="">Default{defaultWs ? ` (${defaultWs.name})` : ''}</option>
													{#each data.workspaces as ws (ws.id)}
														<option value={ws.id}>{ws.name}{ws.isDefault ? ' ★' : ''}</option>
													{/each}
												</select>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							<p class="font-mono text-[10px] text-(--color-muted-foreground)">
								Re-syncing after a change moves existing rows to the newly-mapped workspace.
							</p>
						</div>
					{/if}
					{#if xero.lastSyncedAt}
						<div class="flex gap-2 items-baseline font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">LAST SYNC:</span>
							<span class="font-bold text-(--color-fg)">{new Date(xero.lastSyncedAt).toLocaleString()}</span>
						</div>
					{/if}
					{#if xero.lastSummary}
						<div class="flex gap-2 items-baseline font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">LAST RESULT:</span>
							<span class="font-bold text-(--color-fg)">
								{xero.lastSummary.invoicesCreated ?? 0} created · {xero.lastSummary.invoicesUpdated ?? 0} updated · {xero.lastSummary.skipped ?? 0} skipped
							</span>
						</div>
					{/if}
					{#if xero.tokenExpiresAt}
						<div class="flex gap-2 items-baseline font-mono text-[10px]">
							<span class="text-(--color-muted-foreground) uppercase">TOKEN EXPIRES:</span>
							<span class="font-bold text-(--color-fg)">{new Date(xero.tokenExpiresAt).toLocaleString()}</span>
						</div>
					{/if}
					{#if syncError.xero}
						<div class="font-mono text-[10px] text-(--color-danger) uppercase mt-2">SYNC ERROR: {syncError.xero}</div>
					{/if}
					{#if resetMessage}
						<div class="font-mono text-[10px] text-(--color-muted-foreground) uppercase mt-2">{resetMessage}</div>
					{/if}
				</div>
			{/if}

			<div class="flex gap-3 pt-2 flex-wrap">
				{#if xero}
					<Button variant="primary"   onclick={() => syncNow('xero')}      class="text-xs font-black uppercase tracking-widest">
						{syncing.xero ? 'SYNCING...' : 'SYNC NOW'}
					</Button>
					<Button variant="secondary" onclick={() => syncNow('xero', 'previousFy')} class="text-xs font-black uppercase tracking-widest">
						{syncing['xero:previousFy'] ? 'BACK-FILLING...' : 'SYNC PREVIOUS FY'}
					</Button>
					<Button variant="secondary" onclick={resetXeroSync}              class="text-xs font-black uppercase tracking-widest">
						{resettingSync ? 'RESETTING...' : 'RESET SYNC HISTORY'}
					</Button>
					<Button variant="secondary" onclick={() => connect('xero')}       class="text-xs font-black uppercase tracking-widest">
						{connecting.xero ? 'REDIRECTING...' : 'RE-AUTHORIZE'}
					</Button>
					<Button variant="danger"    onclick={() => disconnect('xero')}    class="text-xs font-black uppercase tracking-widest">
						{disconnecting.xero ? 'REVOKING...' : 'REVOKE ACCESS'}
					</Button>
				{:else}
					<Button variant="primary" onclick={() => connect('xero')} class="text-xs font-black uppercase tracking-widest">
						{connecting.xero ? 'REDIRECTING...' : 'AUTHORIZE XERO'}
					</Button>
				{/if}
			</div>
		</div>
	</Card>

	<Card title="AI Classifier Credentials">
		<p class="text-xs font-mono italic text-(--color-muted-foreground) mb-6">
			SECOND-PRIORITY CATEGORY CLASSIFIER. EMBEDDINGS TRY FIRST; UNCATEGORISED LINES FALL
			THROUGH TO GEMINI USING EITHER A GOOGLE OAUTH GRANT BELOW OR THE DEPLOYMENT-SCOPED
			GEMINI_API_KEY WORKER SECRET. API KEYS ARE NEVER STORED IN THE DATABASE.
		</p>

		<div class="flex flex-col gap-6">
			{#each PROVIDERS as provider (provider.id)}
				{#if provider.comingSoon}
					<div class="border-2 border-(--color-border) p-6 flex flex-col gap-4 opacity-60">
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
								<span
									class="inline-block px-2 py-1 border border-(--color-border) text-(--color-muted-foreground) text-[9px] font-black uppercase tracking-widest"
								>COMING SOON</span>
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

						<p class="font-mono text-[10px] text-(--color-muted-foreground)">
							Microsoft 365 integration is not yet available.
						</p>

						<!-- Disabled action -->
						<div class="flex gap-3 pt-2">
							<Button
								variant="primary"
								disabled={true}
								class="text-xs font-black uppercase tracking-widest"
							>
								NOT AVAILABLE
							</Button>
						</div>
					</div>
				{:else}
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
				{/if}
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
