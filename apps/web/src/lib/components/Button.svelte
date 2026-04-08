<script>
	/**
	 * @type {{
	 *   children?:  import('svelte').Snippet;
	 *   type?:      'button' | 'submit' | 'reset';
	 *   variant?:   'primary' | 'secondary' | 'ghost' | 'danger';
	 *   size?:      'sm' | 'md' | 'lg';
	 *   class?:     string;
	 *   [key: string]: any
	 * }}
	 */
	let {
		children,
		type = 'button',
		variant = 'secondary',
		size = 'md',
		class: className = '',
		...props
	} = $props();

	const sizeClass = {
		sm: 'px-3 py-1.5 text-[10px]',
		md: 'px-4 py-2 text-xs',
		lg: 'px-6 py-3 text-sm'
	}[size];
</script>

<button {type} class="btn-{variant} {sizeClass} {className}" {...props}>
	{@render children?.()}
</button>
