<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { themeStore } from '$lib/theme.svelte.js';
</script>

<header class="border-b-4 border-[var(--color-border)] bg-[var(--header-bg)] px-8 py-4">
	<div class="mx-auto flex max-w-7xl items-center justify-between">
		<div class="text-2xl font-black tracking-tighter uppercase text-[var(--color-fg)]">
			<a href={resolve('/')} class="no-underline hover:bg-transparent hover:text-[var(--color-fg)]">
				FuzzyFinance<span class="bg-[var(--color-fg)] px-1 text-[var(--color-bg)]">.xlsx</span>
			</a>
		</div>

		<nav class="flex items-center gap-8">
			<ul class="flex gap-8">
				<li class="relative">
					<a
						href={resolve('/')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname === '/'
							? 'bg-[var(--nav-active-bg)] px-2 py-1 text-[var(--nav-active-fg)]'
							: 'text-[var(--color-fg)]'}"
					>
						Home
					</a>
				</li>
				<li>
					<a
						href={resolve('/about')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname === '/about'
							? 'bg-[var(--nav-active-bg)] px-2 py-1 text-[var(--nav-active-fg)]'
							: 'text-[var(--color-fg)]'}"
					>
						About
					</a>
				</li>
				<li>
					<a
						href={resolve('/sverdle')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname.startsWith(
							'/sverdle'
						)
							? 'bg-[var(--nav-active-bg)] px-2 py-1 text-[var(--nav-active-fg)]'
							: 'text-[var(--color-fg)]'}"
					>
						Sverdle
					</a>
				</li>
			</ul>

			<div class="flex border border-[var(--color-border)] overflow-hidden">
				<button
					onclick={() => themeStore.set('light')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'light'
						? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
						: 'text-[var(--color-fg)] bg-[var(--color-bg)]'}"
				>
					LT
				</button>
				<button
					onclick={() => themeStore.set('dark')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'dark'
						? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
						: 'text-[var(--color-fg)] bg-[var(--color-bg)]'}"
				>
					DK
				</button>
				<button
					onclick={() => themeStore.set('low-contrast')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'low-contrast'
						? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
						: 'text-[var(--color-fg)] bg-[var(--color-bg)]'}"
				>
					PS
				</button>
			</div>
		</nav>
	</div>
</header>

<style>
	a {
		transition: all 0.1s ease-in-out;
	}
	button {
		border: none !important;
	}
</style>
