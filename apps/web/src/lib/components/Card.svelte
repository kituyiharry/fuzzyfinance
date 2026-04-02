<script>
	/** @type {{ children?: import('svelte').Snippet, title?: string, class?: string, [key: string]: any }} */
	let { children, title, class: className = '', ...props } = $props();
</script>

<div class="card {className}" {...props}>
	{#if title}
		<h2 class="mb-4 border-b-2 border-black pb-2 text-xl font-black">{title}</h2>
	{/if}
	{@render children?.()}
</div>
