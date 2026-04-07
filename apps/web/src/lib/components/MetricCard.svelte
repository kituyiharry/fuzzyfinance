<script>
	/**
	 * @type {{
	 *   label:      string;
	 *   value:      string | number;
	 *   sublabel?:  string;
	 *   accent?:    boolean;
	 *   class?:     string;
	 * }}
	 */
	let { label, value, sublabel, accent = false, class: className = '' } = $props();
</script>

<div
	class="border-2 {accent ? 'border-(--color-fg) shadow-[4px_4px_0px_0px_var(--card-shadow)]' : 'border-(--color-border)'} p-5 flex flex-col gap-2 bg-(--color-bg) {className}"
>
	<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold">
		{label}
	</span>
	<span class="font-black text-3xl tracking-tight text-(--color-fg) leading-none font-mono">
		{value}
	</span>
	{#if sublabel}
		<span class="font-mono text-[10px] text-(--color-muted-foreground)">
			{sublabel}
		</span>
	{/if}
</div>
