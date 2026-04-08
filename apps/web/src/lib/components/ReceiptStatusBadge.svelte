<script>
	/**
	 * @type {{
	 *   status: string | null | undefined;
	 *   class?: string;
	 * }}
	 */
	let { status, class: className = '' } = $props();

	/**
	 * Each entry maps status → CSS classes using semantic color tokens from layout.css.
	 * bg-* uses the muted background; border-* and text-* use the semantic foreground.
	 */
	const CONFIG = /** @type {Record<string, { label: string; classes: string }>} */ ({
		pending:          { label: 'PENDING',     classes: 'border-(--color-border-subtle) text-(--color-muted-foreground) bg-(--color-muted)' },
		processing:       { label: 'PROCESSING',  classes: 'border-(--color-warning-border) text-(--color-warning) bg-(--color-warning-muted)' },
		staged:           { label: 'STAGED',      classes: 'border-(--color-info-border) text-(--color-info) bg-(--color-info-muted)' },
		complete:         { label: 'COMPLETE',    classes: 'border-(--color-success-border) text-(--color-success) bg-(--color-success-muted)' },
		complete_no_sync: { label: 'SYNC FAILED', classes: 'border-(--color-warning-border) text-(--color-warning) bg-(--color-warning-muted)' },
		failed:           { label: 'FAILED',      classes: 'border-(--color-danger-border) text-(--color-danger) bg-(--color-danger-muted)' },
	});

	let cfg = $derived(
		CONFIG[status ?? ''] ?? {
			label: status?.toUpperCase() ?? '—',
			classes: 'border-(--color-border-subtle) text-(--color-muted-foreground)'
		}
	);
</script>

<span
	class="inline-block border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest {cfg.classes} {className}"
>
	{cfg.label}
</span>
