<script>
	import { page } from '$app/state';
	import Header from './Header.svelte';
	import './layout.css';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();
</script>

<div class="app bg-[#f3f4f6]">
	{#if !page.url.pathname.startsWith('/dashboard')}
		<Header />
	{/if}
	<main>{@render children()}</main>

	{#if !page.url.pathname.startsWith('/dashboard')}
		<footer class="border-t-2 border-black bg-white p-4">
			<p class="text-center font-mono text-[10px] font-bold uppercase tracking-widest">
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
