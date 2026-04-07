<script>
	/**
	 * @type {{
	 *   status: string | null | undefined;
	 *   class?: string;
	 * }}
	 */
	let { status, class: className = '' } = $props();

	const CONFIG = /** @type {Record<string, { label: string; color: string }>} */ ({
		pending:         { label: 'PENDING',     color: 'border-(--color-border) text-(--color-muted-foreground)' },
		processing:      { label: 'PROCESSING',  color: 'border-yellow-500 text-yellow-600' },
		staged:          { label: 'STAGED',      color: 'border-blue-500 text-blue-600' },
		complete:        { label: 'COMPLETE',     color: 'border-green-600 text-green-600' },
		complete_no_sync:{ label: 'SYNC FAILED', color: 'border-yellow-500 text-yellow-600' },
		failed:          { label: 'FAILED',       color: 'border-red-600 text-red-600' }
	});

	let cfg = $derived(CONFIG[status ?? ''] ?? { label: status?.toUpperCase() ?? '—', color: 'border-(--color-border) text-(--color-muted-foreground)' });
</script>

<span
	class="inline-block border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest {cfg.color} {className}"
>
	{cfg.label}
</span>
