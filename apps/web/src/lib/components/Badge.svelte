<script>
	/**
	 * Generic tag/badge chip — used for receipt tags, labels, categories.
	 *
	 * @type {{
	 *   label:     string;
	 *   variant?:  'default' | 'success' | 'warning' | 'danger' | 'info';
	 *   size?:     'xs' | 'sm';
	 *   class?:    string;
	 *   onclick?:  ((e: MouseEvent) => void) | null;
	 * }}
	 */
	let { label, variant = 'default', size = 'xs', class: className = '', onclick = null } = $props();

	const variantClasses = {
		default: 'border-(--color-border-subtle) text-(--color-muted-foreground) bg-(--color-muted)',
		success: 'border-(--color-success-border) text-(--color-success) bg-(--color-success-muted)',
		warning: 'border-(--color-warning-border) text-(--color-warning) bg-(--color-warning-muted)',
		danger:  'border-(--color-danger-border) text-(--color-danger) bg-(--color-danger-muted)',
		info:    'border-(--color-info-border) text-(--color-info) bg-(--color-info-muted)',
	};

	const sizeClasses = {
		xs: 'text-[8px] px-1.5 py-0.5',
		sm: 'text-[10px] px-2 py-1'
	};

	const isClickable = $derived(onclick !== null);
</script>

{#if isClickable}
	<button
		type="button"
		class="inline-block border font-mono font-black uppercase tracking-widest leading-none {variantClasses[variant]} {sizeClasses[size]} cursor-pointer hover:opacity-80 transition-opacity {className}"
		{onclick}
	>
		{label}
	</button>
{:else}
	<span
		class="inline-block border font-mono font-black uppercase tracking-widest leading-none {variantClasses[variant]} {sizeClasses[size]} {className}"
	>
		{label}
	</span>
{/if}
