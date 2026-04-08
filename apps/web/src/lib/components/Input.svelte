<script>
	/**
	 * @type {{
	 *   label?:       string;
	 *   type?:        string;
	 *   name?:        string;
	 *   placeholder?: string;
	 *   value?:       string;
	 *   error?:       string;
	 *   hint?:        string;
	 *   [key: string]: any
	 * }}
	 */
	let { label, type = 'text', name, placeholder, value = $bindable(), error, hint, ...props } = $props();
</script>

<div class="flex w-full flex-col gap-1.5">
	{#if label}
		<label
			for={name}
			class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg)"
		>
			{label}
		</label>
	{/if}

	<input
		{type}
		{name}
		id={name}
		{placeholder}
		bind:value
		class="border-2 {error ? 'border-(--color-danger-border) bg-(--color-danger-muted)' : 'border-(--color-border)'} focus:border-(--color-fg) bg-(--color-bg) text-(--color-fg) font-mono text-xs px-3 py-2 w-full transition-colors placeholder:text-(--color-muted-foreground) placeholder:uppercase placeholder:tracking-widest outline-none"
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
		{...props}
	/>

	{#if error}
		<span id="{name}-error" class="font-mono text-[10px] font-bold text-(--color-danger) uppercase tracking-wide">
			{error}
		</span>
	{:else if hint}
		<span id="{name}-hint" class="font-mono text-[10px] text-(--color-muted-foreground)">
			{hint}
		</span>
	{/if}
</div>
