<script>
	/**
	 * @type {{
	 *   children?:  import('svelte').Snippet;
	 *   actions?:   import('svelte').Snippet;
	 *   title?:     string;
	 *   class?:     string;
	 *   [key: string]: any
	 * }}
	 */
	let { children, actions, title, class: className = '', ...props } = $props();
</script>

<div class="card {className}" {...props}>
	{#if title || actions}
		<div class="flex items-start justify-between gap-4 mb-5 pb-4 border-b-2 border-(--color-border)">
			{#if title}
				<h2 class="text-sm font-black uppercase tracking-widest text-(--color-fg) leading-none pt-0.5">{title}</h2>
			{/if}
			{#if actions}
				<div class="flex items-center gap-2 shrink-0">
					{@render actions()}
				</div>
			{/if}
		</div>
	{/if}
	{@render children?.()}
</div>
