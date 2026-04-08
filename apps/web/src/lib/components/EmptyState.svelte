<script>
	/**
	 * Consistent empty state with optional CTA — used across list pages.
	 *
	 * @type {{
	 *   message:     string;
	 *   submessage?: string;
	 *   ctaLabel?:   string;
	 *   ctaHref?:    string;
	 *   onCta?:      () => void;
	 *   class?:      string;
	 * }}
	 */
	let { message, submessage, ctaLabel, ctaHref, onCta, class: className = '' } = $props();

	const hasAction = ctaLabel && (ctaHref || onCta);
</script>

<div class="py-16 flex flex-col items-center justify-center gap-4 text-center {className}">
	<!-- Decorative grid square -->
	<div class="w-12 h-12 border-2 border-(--color-border-subtle) border-dashed flex items-center justify-center mb-2" aria-hidden="true">
		<div class="w-4 h-4 border border-(--color-border-subtle)"></div>
	</div>

	<div class="flex flex-col gap-1.5">
		<p class="font-mono text-xs font-black uppercase tracking-widest text-(--color-muted-foreground)">
			{message}
		</p>
		{#if submessage}
			<p class="font-mono text-[10px] text-(--color-muted-foreground) max-w-xs mx-auto leading-relaxed">
				{submessage}
			</p>
		{/if}
	</div>

	{#if hasAction}
		{#if ctaHref}
			<a
				href={ctaHref}
				class="inline-flex items-center gap-2 mt-2 font-mono text-[10px] font-black uppercase tracking-widest text-(--color-fg) no-underline border-b-2 border-(--color-border) pb-0.5 hover:border-(--color-fg) transition-colors"
			>
				{ctaLabel} →
			</a>
		{:else if onCta}
			<button
				onclick={onCta}
				class="inline-flex items-center gap-2 mt-2 font-mono text-[10px] font-black uppercase tracking-widest"
			>
				{ctaLabel} →
			</button>
		{/if}
	{/if}
</div>
