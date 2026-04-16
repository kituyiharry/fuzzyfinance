<script>
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/theme.svelte.js';
</script>

<header class="border-b-4 border-(--color-border) bg-(--header-bg) px-8 py-4">
	<div class="mx-auto flex max-w-7xl items-center justify-between">
		<div class="text-2xl font-black tracking-tighter uppercase text-(--color-fg)">
			<a href={resolve('/')} class="no-underline hover:bg-transparent
                hover:text-(--color-text)">
				Fuzzies<span class="bg-(--color-fg) px-1 text-(--color-bg)">.app</span>
			</a>
		</div>

		<nav class="flex items-center gap-8">
			<div class="flex border border-(--color-border) overflow-hidden">
				<button
					onclick={() => themeStore.set('light')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'light'
						? 'bg-(--color-fg) text-(--color-bg)'
						: 'text-(--color-fg) bg-(--color-bg)'}"
				>
					LT
				</button>
				<button
					onclick={() => themeStore.set('dark')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'dark'
						? 'bg-(--color-fg) text-(--color-bg)'
						: 'text-(--color-fg) bg-(--color-bg)'}"
				>
					DK
				</button>
				<button
					onclick={() => themeStore.set('low-contrast')}
					class="p-1 px-2 text-[10px] font-bold transition-colors {themeStore.current === 'low-contrast'
						? 'bg-(--color-fg)   text-(--color-bg)'
						: 'text-(--color-fg) bg-(--color-bg)'}"
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
