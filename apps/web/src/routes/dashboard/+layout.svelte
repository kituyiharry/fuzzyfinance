<script>
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/stores';
	import { onNavigate } from '$app/navigation';
    import logo from '$lib/images/fuzzyfin.png';

	/** @type {{children: import('svelte').Snippet, data: import('./$types').LayoutData}} */
	let { children, data } = $props();

	let isProfileMenuOpen = $state(false);
	let sidebarOpen = $state(false);

	// Workspace switcher state
	let workspaceMenuOpen = $state(false);
	let creatingWorkspace = $state(false);
	let newWorkspaceName = $state('');
	/** @type {{ id: string; name: string } | null} */
	let renamingWorkspace = $state(null);
	let renameValue = $state('');

	const activeWorkspace = $derived(
		(data.workspaces ?? []).find(w => w.id === data.activeWorkspaceId) ?? data.workspaces?.[0] ?? null
	);

	/** @param {string} id */
	const switchWorkspace = async (id) => {
		workspaceMenuOpen = false;
		await fetch(`/api/workspaces/${id}/switch`, { method: 'POST' });
		window.location.reload();
	};

	/** @param {SubmitEvent} e */
	const submitCreate = async (e) => {
		e.preventDefault();
		const name = newWorkspaceName.trim();
		if (!name) return;
		const res = await fetch('/api/workspaces', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name }),
		});
		if (res.ok) {
			const ws = await res.json();
			creatingWorkspace = false;
			newWorkspaceName = '';
			await fetch(`/api/workspaces/${ws.id}/switch`, { method: 'POST' });
			window.location.reload();
		}
	};

	/** @param {{ id: string; name: string }} ws */
	const startRename = (ws) => {
		renamingWorkspace = ws;
		renameValue = ws.name;
		workspaceMenuOpen = false;
	};
	const cancelRename = () => { renamingWorkspace = null; };

	/** @param {SubmitEvent} e */
	const submitRename = async (e) => {
		e.preventDefault();
		if (!renamingWorkspace || !renameValue.trim()) return;
		await fetch(`/api/workspaces/${renamingWorkspace.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: renameValue.trim() }),
		});
		renamingWorkspace = null;
		window.location.reload();
	};

	/** @param {string} id */
	const deleteWorkspace = async (id) => {
		if (!confirm('Delete this workspace and all its data? This cannot be undone.')) return;
		workspaceMenuOpen = false;
		await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
		window.location.reload();
	};

	onNavigate(() => { sidebarOpen = false; });

	const logout = async () => {
		await authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/'; } } });
	};

	const toggleProfileMenu = () => { isProfileMenuOpen = !isProfileMenuOpen; };

	const NAV = [
		{ href: '/dashboard',                   label: 'Overview',       /** @param {string} p */ match: (p) => p === '/dashboard' },
		{ href: '/dashboard/refinement',        label: 'Refinement',     /** @param {string} p */ match: (p) => p.startsWith('/dashboard/refinement') },
		{ href: '/dashboard/visualization',     label: 'Visualization',  /** @param {string} p */ match: (p) => p.startsWith('/dashboard/visualization') },
		{ href: '/dashboard/integrations',      label: 'Integrations',   /** @param {string} p */ match: (p) => p.startsWith('/dashboard/integrations') },
		{ href: '/dashboard/settings',          label: 'Settings',       /** @param {string} p */ match: (p) => p.startsWith('/dashboard/settings') },
	];

	/** @type {Record<string, { title: string; sub: string }>} */
	const PAGE_TITLES = {
		'/dashboard':                   { title: 'Overview',       sub: 'Financial control centre' },
		'/dashboard/refinement':        { title: 'Refinement',     sub: 'Edit categories + decompose synced documents' },
		'/dashboard/visualization':     { title: 'Visualization',  sub: 'Sankey view of receipt exports' },
		'/dashboard/integrations':      { title: 'Integrations',   sub: 'Cloud workspace connections' },
		'/dashboard/settings':          { title: 'Settings',       sub: 'Account and preferences' },
	};

	const currentPageInfo = $derived(
		PAGE_TITLES[$page.url.pathname] ??
		Object.entries(PAGE_TITLES).find(([k]) => $page.url.pathname.startsWith(k + '/'))?.[1] ??
		{ title: $page.url.pathname.split('/').pop()?.toUpperCase() ?? 'DASHBOARD', sub: '' }
	);
</script>

<div class="flex h-screen overflow-hidden bg-(--color-bg) text-(--color-fg)">
	<!-- Sidebar -->
	<aside class="flex-col border-r-2 border-(--color-border) bg-(--color-bg) shrink-0
		{sidebarOpen ? 'fixed inset-y-0 left-0 z-50 flex w-72' : 'hidden md:flex md:w-56 md:relative md:shrink-0'}">
		<!-- Brand -->
		<div style="background-image: url({logo}); background-size: 40%; background-repeat: no-repeat; background-position: right;"  
            class="px-5 py-5 border-b-2 border-(--color-border)">
			<a href="/dashboard" class="no-underline block">
                <p class="font-black text-base uppercase tracking-tighter text-(--color-fg) leading-none">FuzzyFinance</p>
                <p class="font-mono text-[6px] uppercase tracking-[0.2em] text-(--color-muted-foreground) mt-0.5">v1.0 </p>
			</a>
		</div>

		<!-- Nav links -->
		<nav class="flex-1 py-3 px-2" aria-label="Main navigation">
			<ul class="flex flex-col gap-0.5">
				{#each NAV as item (item.href)}
					{@const active = item.match($page.url.pathname)}
					<li>
						<a
							href={item.href}
							onclick={() => (sidebarOpen = false)}
							class="flex items-center gap-2.5 px-3 py-2.5 font-mono text-[10px] font-black uppercase tracking-widest no-underline transition-all
								{active
									? 'bg-(--nav-active-bg) text-(--nav-active-fg)'
									: 'text-(--color-muted-foreground) hover:bg-(--color-muted) hover:text-(--color-fg)'}"
							aria-current={active ? 'page' : undefined}>
							<span class="w-1.5 h-1.5 shrink-0 {active ? 'bg-(--nav-active-fg)' : 'border border-(--color-border-subtle)'}"></span>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<!-- User / logout -->
		<div class="p-3 border-t-2 border-(--color-border)">
			<div class="relative">
				<button
					onclick={toggleProfileMenu}
					class="w-full flex items-center gap-2.5 px-3 py-2.5 border-0 bg-transparent hover:bg-(--color-muted) transition-all text-left"
					aria-expanded={isProfileMenuOpen}
					aria-haspopup="true">
					<img
						src={$page.data.user?.image ?? ''}
						alt="Profile"
						class="w-7 h-7 object-cover border border-(--color-border-subtle) shrink-0"
					/>
					<div class="min-w-0 flex-1">
						<p class="font-mono text-[9px] font-black uppercase tracking-wide text-(--color-fg) truncate leading-tight">
							{$page.data.user?.name ?? 'User'}
						</p>
						<p class="font-mono text-[8px] text-(--color-muted-foreground) truncate leading-tight">
							{$page.data.user?.email ?? ''}
						</p>
					</div>
					<span class="font-mono text-[9px] text-(--color-muted-foreground) shrink-0">{isProfileMenuOpen ? '▲' : '▼'}</span>
				</button>

				{#if isProfileMenuOpen}
					<div class="absolute bottom-full left-0 right-0 mb-1 bg-(--color-bg) border-2 border-(--color-border) shadow-(--shadow-md) z-50">
						<a
							href="/dashboard/settings"
							class="block px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest no-underline text-(--color-fg) hover:bg-(--color-muted) transition-all"
							onclick={() => (isProfileMenuOpen = false)}
						>
							Settings
						</a>
						<div class="border-t border-(--color-border-subtle)"></div>
						<button
							onclick={logout}
							class="w-full text-left px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest border-0 bg-transparent text-(--color-danger) hover:bg-(--color-danger-muted) transition-all"
						>
							Log out
						</button>
					</div>
				{/if}
			</div>
		</div>
	</aside>

	<!-- Mobile backdrop -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 z-40 bg-black/60 md:hidden"
			onclick={() => (sidebarOpen = false)}
			aria-hidden="true"
		></div>
	{/if}

	<!-- Main area -->
	<main class="flex-1 overflow-y-auto flex flex-col bg-(--color-muted)">
		<!-- Page header -->
		<header class="bg-(--color-bg) border-b-2 border-(--color-border) px-8 py-5 shrink-0">
			<div class="flex items-center justify-between max-w-5xl mx-auto">
				<div>
					<h1 class="font-black text-xl uppercase tracking-tight text-(--color-fg) leading-none">
						{currentPageInfo.title}
					</h1>
					{#if currentPageInfo.sub}
						<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) mt-1">{currentPageInfo.sub}</p>
					{/if}
				</div>
				<button
					onclick={() => (sidebarOpen = !sidebarOpen)}
					class="md:hidden border-2 border-(--color-border) px-3 py-2 font-mono text-sm leading-none text-(--color-fg) hover:bg-(--color-muted) transition-colors"
					aria-label="Toggle navigation"
					aria-expanded={sidebarOpen}
				>☰</button>
				<!-- Workspace switcher -->
				<div class="hidden md:flex items-center gap-2 relative">
					<button
						onclick={() => { workspaceMenuOpen = !workspaceMenuOpen; creatingWorkspace = false; }}
						class="flex items-center gap-2 px-3 py-1.5 border border-(--color-border) font-mono text-[9px] uppercase tracking-widest text-(--color-fg) hover:bg-(--color-muted) transition-all"
						aria-expanded={workspaceMenuOpen}
					>
						<span class="w-1.5 h-1.5 bg-(--nav-active-fg) shrink-0"></span>
						{activeWorkspace?.name ?? 'Workspace'}
						<span class="text-(--color-muted-foreground)">{workspaceMenuOpen ? '▲' : '▼'}</span>
					</button>

					{#if workspaceMenuOpen}
						<div class="absolute top-full right-0 mt-1 w-56 bg-(--color-bg) border-2 border-(--color-border) z-50">
							{#each (data.workspaces ?? []) as ws (ws.id)}
								<div class="flex items-center group px-3 py-2 bg-(--color-muted) transition-all ">
									<button
										onclick={() => switchWorkspace(ws.id)}
										class="flex-1 text-left font-mono text-[9px] uppercase tracking-widest text-(--color-fg) border-0 bg-transparent truncate"
									>
										{#if ws.id === data.activeWorkspaceId}
											<span class="w-1.5 h-1.5 bg-(--nav-active-fg) inline-block mr-1.5 shrink-0"></span>
										{/if}
										{ws.name}
									</button>
									<button
										onclick={() => startRename(ws)}
										class="opacity-0 group-hover:opacity-100 font-mono text-[9px] text-(--color-muted-foreground) hover:text-(--color-fg) px-1 border-0 bg-transparent transition-all"
										title="Rename"
									>✎</button>
									{#if (data.workspaces ?? []).length > 1}
										<button
											onclick={() => deleteWorkspace(ws.id)}
											class="opacity-0 group-hover:opacity-100 font-mono text-[9px] text-(--color-danger) px-1 border-0 bg-transparent transition-all"
											title="Delete"
										>✕</button>
									{/if}
								</div>
							{/each}
							<div class="border-t border-(--color-border-subtle)"></div>
							{#if creatingWorkspace}
								<form onsubmit={submitCreate} class="flex gap-1 p-2">
									<!-- svelte-ignore a11y_autofocus -->
									<input
										bind:value={newWorkspaceName}
										placeholder="Name"
										maxlength="50"
										autofocus
										class="flex-1 font-mono text-[9px] px-2 py-1 border border-(--color-border) bg-(--color-bg) text-(--color-fg) min-w-0"
									/>
									<button type="submit" class="font-mono text-[9px] px-2 py-1 bg-(--color-fg) text-(--color-bg) border-0">OK</button>
									<button type="button" onclick={() => (creatingWorkspace = false)} class="font-mono text-[9px] px-1 text-(--color-muted-foreground) border-0 bg-transparent">✕</button>
								</form>
							{:else}
								<button
									onclick={() => (creatingWorkspace = true)}
									class="w-full text-left px-3 py-2.5 font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) hover:bg-(--color-muted) border-0 bg-transparent transition-all"
								>
									+ New Workspace
								</button>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Rename modal -->
				{#if renamingWorkspace}
					<div
						class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
						role="dialog"
						aria-modal="true"
						tabindex="-1"
						onclick={cancelRename}
						onkeydown={(e) => e.key === 'Escape' && cancelRename()}
					>
						<div
							role="presentation"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.stopPropagation()}
						>
						<form
							onsubmit={submitRename}
							class="bg-(--color-bg) border-2 border-(--color-border) p-4 flex flex-col gap-3 w-64"
						>
							<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-fg)">Rename Workspace</p>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								bind:value={renameValue}
								maxlength="50"
								autofocus
								class="font-mono text-[9px] px-2 py-1.5 border border-(--color-border) bg-(--color-bg) text-(--color-fg) w-full"
							/>
							<div class="flex gap-2">
								<button type="submit" class="flex-1 font-mono text-[9px] uppercase tracking-widest bg-(--color-fg) text-(--color-bg) py-1.5 border-0">Save</button>
								<button type="button" onclick={cancelRename} class="flex-1 font-mono text-[9px] uppercase tracking-widest border border-(--color-border) text-(--color-fg) py-1.5 bg-transparent">Cancel</button>
							</div>
						</form>
						</div>
					</div>
				{/if}
			</div>
		</header>

		<div class="flex-1 p-8">
			{@render children()}
		</div>
	</main>
</div>
