<script>
	/**
	 * @type {{
	 *   label:      string;
	 *   value:      string | number;
	 *   sublabel?:  string;
	 *   accent?:    boolean;
	 *   trend?:     'up' | 'down' | 'neutral';
	 *   class?:     string;
	 * }}
	 */
	let { label, value, sublabel, accent = false, trend, class: className = '' } = $props();

	const trendIcon = { up: '↑', down: '↓', neutral: '→' };
	const trendColor = {
		up: 'text-(--color-success)',
		down: 'text-(--color-danger)',
		neutral: 'text-(--color-muted-foreground)'
	};
</script>

<div
	class="border-2 {accent ? 'border-(--color-fg) shadow-(--shadow-sm)' : 'border-(--color-border)'} p-5 flex flex-col gap-2 bg-(--color-bg) transition-shadow {className}"
>
	<div class="flex items-center justify-between gap-2">
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold leading-none">
			{label}
		</span>
		{#if trend}
			<span class="font-mono text-[10px] font-black {trendColor[trend]}">{trendIcon[trend]}</span>
		{/if}
	</div>

	<span class="font-black text-3xl tracking-tight text-(--color-fg) leading-none tabular-nums" style="font-family: var(--font-mono)">
		{value}
	</span>

	{#if sublabel}
		<span class="font-mono text-[10px] text-(--color-muted-foreground) leading-tight">
			{sublabel}
		</span>
	{/if}

	{#if accent}
		<div class="absolute bottom-0 left-0 w-full h-0.5 bg-(--color-fg) opacity-20"></div>
	{/if}
</div>
