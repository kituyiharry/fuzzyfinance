<script>
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/stores';
	import { onNavigate } from '$app/navigation';
    import logo from '$lib/images/fuzzyfin.png';

	/** @type {{children: import('svelte').Snippet, data: import('./$types').LayoutData}} */
	let { children, data } = $props();

	/** @type {string[]} */
	let dismissedBanners = $state([]);

	/** @param {string} id */
	const dismissBanner = (id) => { dismissedBanners = [...dismissedBanners, id]; };

	const visibleBanners = $derived((data.banners ?? []).filter((b) => !dismissedBanners.includes(b.id)));

	let isProfileMenuOpen = $state(false);

	let sidebarOpen = $state(false);

	onNavigate(() => { sidebarOpen = false; });

	const logout = async () => {
		await authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/'; } } });
	};

	const toggleProfileMenu = () => { isProfileMenuOpen = !isProfileMenuOpen; };

	const NAV = [
		{ href: '/dashboard',                   label: 'Overview',       /** @param {string} p */ match: (p) => p === '/dashboard' },
		{ href: '/dashboard/receipts',          label: 'Receipts',       /** @param {string} p */ match: (p) => p.startsWith('/dashboard/receipts') },
		{ href: '/dashboard/sales',             label: 'Sales',          /** @param {string} p */ match: (p) => p.startsWith('/dashboard/sales') },
		{ href: '/dashboard/exports',           label: 'Exports',        /** @param {string} p */ match: (p) => p === '/dashboard/exports' },
		{ href: '/dashboard/integrations',      label: 'Integrations',   /** @param {string} p */ match: (p) => p === '/dashboard/integrations' },
		{ href: '/dashboard/announcements',     label: 'Announcements',  /** @param {string} p */ match: (p) => p.startsWith('/dashboard/announcements') },
		{ href: '/dashboard/settings',          label: 'Settings',       /** @param {string} p */ match: (p) => p === '/dashboard/settings' },
	];

	/** @type {Record<string, { title: string; sub: string }>} */
	const PAGE_TITLES = {
		'/dashboard':                   { title: 'Overview',       sub: 'Financial control centre' },
		'/dashboard/receipts':          { title: 'Receipts',       sub: 'Manage and review receipts' },
		'/dashboard/sales':             { title: 'Sales',          sub: 'Track sales and revenue documents' },
		'/dashboard/exports':           { title: 'Exports',        sub: 'Download CSV reports' },
		'/dashboard/integrations':      { title: 'Integrations',   sub: 'Cloud workspace connections' },
		'/dashboard/announcements':     { title: 'Announcements',  sub: 'Platform updates and notices' },
		'/dashboard/settings':          { title: 'Settings',       sub: 'Account and preferences' },
	};

	const currentPageInfo = $derived(
		PAGE_TITLES[$page.url.pathname] ??
		Object.entries(PAGE_TITLES).find(([k]) => $page.url.pathname.startsWith(k + '/'))?.[1] ??
		{ title: $page.url.pathname.split('/').pop()?.toUpperCase() ?? 'DASHBOARD', sub: '' }
	);
</script>

<div class="flex flex-1 overflow-hidden bg-(--color-bg) text-(--color-fg)">
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
							{#if item.href === '/dashboard/announcements' && visibleBanners.length > 0}
								<span class="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse"></span>
							{/if}
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
					aria-haspopup="true"
				>
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
				<div class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hidden md:flex items-center gap-4">
					<span>Secure Channel: Active</span>
					<span class="flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 bg-green-500 inline-block animate-pulse shrink-0"></span>
						Online
					</span>
				</div>
			</div>
		</header>

		{#if visibleBanners.length > 0}
			<div class="shrink-0 flex flex-col">
				{#each visibleBanners as banner (banner.id)}
					{@const isWarning = banner.type === 'warning' || banner.type === 'maintenance'}
					<div class="flex items-start gap-3 px-8 py-3 border-b-2 border-(--color-border)
						{isWarning ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-(--color-muted)'}">
						<span class="font-mono text-[9px] font-black uppercase tracking-widest shrink-0 mt-0.5
							{isWarning ? 'text-amber-700 dark:text-amber-400' : 'text-(--color-muted-foreground)'}">
							{banner.type}
						</span>
						<div class="flex-1 min-w-0">
							<span class="font-mono text-[10px] font-black uppercase tracking-wide text-(--color-fg)">
								{banner.title}
							</span>
							{#if banner.body}
								<span class="font-mono text-[10px] text-(--color-muted-foreground) ml-2">
									{banner.body}
								</span>
							{/if}
						</div>
						<button
							onclick={() => dismissBanner(banner.id)}
							class="shrink-0 font-mono text-[10px] text-(--color-muted-foreground) hover:text-(--color-fg) border-0 bg-transparent leading-none transition-colors"
							aria-label="Dismiss"
						>✕</button>
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex-1 p-8">
			{@render children()}
		</div>
	</main>
</div>
