<script>
	/** @type {{ label?: string, type?: string, name?: string, placeholder?: string, value?: string, error?: string, [key: string]: any }} */
	let { label, type = 'text', name, placeholder, value = $bindable(), error, ...props } = $props();
</script>

<div class="flex w-full flex-col gap-1">
	{#if label}
		<label for={name} class="text-xs font-bold tracking-wider uppercase">{label}</label>
	{/if}
	<input
		{type}
		{name}
		id={name}
		{placeholder}
		bind:value
		class={error ? 'border-red-600' : ''}
		{...props}
	/>
	{#if error}
		<span class="text-xs font-bold text-red-600 uppercase">{error}</span>
	{/if}
</div>
