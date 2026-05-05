<script>
	/**
	 * @type {{
	 *   open: boolean;
	 *   message: string;
	 *   confirmLabel?: string;
	 *   cancelLabel?: string | null;
	 *   variant?: 'default' | 'danger';
	 *   onconfirm: () => void;
	 *   oncancel?: () => void;
	 * }}
	 */
	let {
		open,
		message,
		confirmLabel = 'CONFIRM',
		cancelLabel = 'CANCEL',
		variant = 'default',
		onconfirm,
		oncancel
	} = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="absolute inset-0 bg-black/40"
			onclick={cancelLabel !== null ? oncancel : undefined}
		></div>
		<div class="relative z-10 border-2 border-(--color-border) bg-(--color-bg) p-6 max-w-sm w-full shadow-lg">
			<p class="font-mono text-xs text-(--color-fg) leading-relaxed mb-6">{message}</p>
			<div class="flex gap-3 justify-end">
				{#if cancelLabel !== null && oncancel}
					<button
						onclick={oncancel}
						class="font-mono text-[10px] uppercase tracking-widest font-black px-4 py-2 border-2 border-(--color-border) text-(--color-muted-foreground) hover:text-(--color-fg) hover:border-(--color-fg) transition-colors"
					>
						{cancelLabel}
					</button>
				{/if}
				<button
					onclick={onconfirm}
					class="font-mono text-[10px] uppercase tracking-widest font-black px-4 py-2 border-2 transition-colors
						{variant === 'danger'
							? 'border-(--color-danger-border) text-(--color-danger) bg-(--color-danger-muted) hover:bg-(--color-danger-border) hover:text-white'
							: 'border-(--color-fg) text-(--color-bg) bg-(--color-fg) hover:opacity-80'}"
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
