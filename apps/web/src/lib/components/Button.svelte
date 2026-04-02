<script>
	/** @type {{ children?: import('svelte').Snippet, type?: "button" | "submit" | "reset", variant?: "primary" | "secondary", class?: string, [key: string]: any }} */
	let {
		children,
		type = 'button',
		variant = 'secondary',
		class: className = '',
		...props
	} = $props();
</script>

<button {type} class="btn-{variant} {className}" {...props}>
	{@render children?.()}
</button>
