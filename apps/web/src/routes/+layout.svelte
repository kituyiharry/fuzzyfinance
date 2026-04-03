<script>
	import { page } from '$app/state';
	import Header from './Header.svelte';
	import './layout.css';
	import { themeStore } from '$lib/theme.svelte.js';
	import { onMount } from 'svelte';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();

	onMount(() => {
		themeStore.init();
	});
</script>

<div class="app bg-(--color-bg)">
	{#if !page.url.pathname.startsWith('/dashboard')}
		<Header />
	{/if}
	<main>{@render children()}</main>

	{#if !page.url.pathname.startsWith('/dashboard')}
		<footer class="border-t-2 border-(--color-border) bg-(--header-bg) p-4">
			<p class="text-center font-mono text-[10px] font-bold uppercase tracking-widest text-(--color-fg)">
				FUZZYFINANCE CORE ENGINE // SYSTEM TIME: {new Date().toISOString().split('T')[1].slice(0, 8)} // ALL RIGHTS RESERVED
			</p>
		</footer>
	{/if}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		box-sizing: border-box;
	}
</style>
