<script>
	import Button from '$lib/components/Button.svelte';
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();

	let isProfileMenuOpen = $state(false);

	const logout = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = '/';
				}
			}
		});
	};

	const toggleProfileMenu = () => {
		isProfileMenuOpen = !isProfileMenuOpen;
	};
</script>

<div class="flex flex-1 overflow-hidden bg-(--color-bg) text-(--color-fg)">
	<!-- Navigation Drawer -->
	<aside class="w-64 border-r-4 border-(--color-border) bg-(--header-bg) flex flex-col">
		<div class="p-6 border-b-2 border-(--color-border) bg-(--nav-active-bg) text-(--nav-active-fg)">
			<h3 class="text-xs font-black uppercase tracking-widest">Navigation</h3>
		</div>
		
		<nav class="flex-1 p-4">
			<ul class="flex flex-col gap-2">
				<li>
					<a href="/dashboard" class="flex items-center gap-3 p-3 {page.url.pathname === '/dashboard' ? 'bg-(--nav-active-bg) text-(--nav-active-fg)' : 'hover:bg-(--nav-active-bg) hover:text-(--nav-active-fg)'} font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 {page.url.pathname === '/dashboard' ? 'bg-(--nav-active-fg)' : 'border border-(--color-border)'}"></span>
						Overview
					</a>
				</li>
				<li>
					<a href="/dashboard/reports" class="flex items-center gap-3 p-3 {page.url.pathname === '/dashboard/reports' ? 'bg-(--nav-active-bg) text-(--nav-active-fg)' : 'hover:bg-(--nav-active-bg) hover:text-(--nav-active-fg)'} font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 {page.url.pathname === '/dashboard/reports' ? 'bg-(--nav-active-fg)' : 'border border-(--color-border)'}"></span>
						Financial Reports
					</a>
				</li>
				<li>
					<a href="/dashboard/transactions" class="flex items-center gap-3 p-3 {page.url.pathname === '/dashboard/transactions' ? 'bg-(--nav-active-bg) text-(--nav-active-fg)' : 'hover:bg-(--nav-active-bg) hover:text-(--nav-active-fg)'} font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 {page.url.pathname === '/dashboard/transactions' ? 'bg-(--nav-active-fg)' : 'border border-(--color-border)'}"></span>
						Transactions
					</a>
				</li>
				<li>
					<a href="/dashboard/settings" class="flex items-center gap-3 p-3 {page.url.pathname === '/dashboard/settings' ? 'bg-(--nav-active-bg) text-(--nav-active-fg)' : 'hover:bg-(--nav-active-bg) hover:text-(--nav-active-fg)'} font-bold uppercase text-xs tracking-widest no-underline transition-all">
						<span class="w-2 h-2 {page.url.pathname === '/dashboard/settings' ? 'bg-(--nav-active-fg)' : 'border border-(--color-border)'}"></span>
						System Config
					</a>
				</li>
			</ul>
		</nav>

		<div class="p-4 border-t-2 border-(--color-border)">
			<Button onclick={logout} variant="secondary" class="w-full text-xs font-black">
                LOG OUT
			</Button>
		</div>
	</aside>

	<!-- Main Content Area -->
	<main class="flex-1 overflow-y-auto p-8 bg-(--color-muted)">
		<header class="mb-8 flex items-end justify-between border-b-4 border-(--color-border) pb-4 relative">
			<div>
				<h1 class="text-4xl font-black uppercase tracking-tighter text-(--color-fg)">
					{page.url.pathname.split('/').pop()?.toUpperCase() || 'EXECUTIVE DASHBOARD'}
				</h1>
				<p class="text-xs font-bold uppercase tracking-[0.2em] text-(--color-muted-foreground)">Global Financial Control Center</p>
			</div>
			
			<div class="flex items-center gap-4">
				<div class="text-right font-mono text-[10px] font-bold uppercase text-(--color-fg) hidden sm:block">
					<p>SECURE CHANNEL: ACTIVE</p>
					<p>CLEARANCE: LVL_04</p>
				</div>
				
				<div class="relative">
					<button 
						onclick={toggleProfileMenu}
						class="w-12 h-12 border-2 border-(--color-border) bg-(--color-bg) flex items-center justify-center overflow-hidden hover:shadow-[4px_4px_0px_0px_var(--card-shadow)] transition-all"
					>
						<img src="https://ui-avatars.com/api/?name=Admin&background=000&color=fff" alt="Profile" class="w-full h-full object-cover" />
					</button>

					{#if isProfileMenuOpen}
						<div class="absolute right-0 mt-2 w-48 bg-(--color-bg) border-2 border-(--color-border) shadow-[8px_8px_0px_0px_var(--card-shadow)] z-50">
							<div class="p-3 border-b border-(--color-border) bg-(--nav-active-bg) text-(--nav-active-fg) text-[10px] font-black uppercase">
								Identity: Personnel_001
							</div>
							<a href="/dashboard/settings" class="block p-3 text-xs font-bold uppercase tracking-widest no-underline hover:bg-(--color-muted) text-(--color-fg)" onclick={() => isProfileMenuOpen = false}>
								Settings
							</a>
							<button onclick={logout} class="w-full text-left p-3 text-xs font-bold tracking-widest hover:bg-(--color-muted) text-red-600 ">
								Log out
							</button>
						</div>
					{/if}
				</div>
			</div>
		</header>

		{@render children()}
	</main>
</div>
