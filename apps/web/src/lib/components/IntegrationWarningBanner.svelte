<script>
	/**
	 * @type {{ status: 'none' | 'all_expired'; class?: string }}
	 */
	let { status, class: className = '' } = $props();

	const MESSAGE = {
		none: {
			headline: 'NO CLOUD INTEGRATION CONNECTED',
			body: 'Expense documents cannot be uploaded or synced until you connect at least one cloud workspace provider.',
			cta: 'Connect an Integration →'
		},
		all_expired: {
			headline: 'INTEGRATION TOKENS EXPIRED',
			body: 'Your connected integration credentials have expired. Re-authorize to resume expense document uploads and sync.',
			cta: 'Re-authorize →'
		}
	};

	let msg = $derived(MESSAGE[status]);
</script>

<div class="border-2 border-(--color-warning-border) bg-(--color-warning-muted) p-4 flex flex-col gap-2 {className}">
	<div class="flex items-center gap-2">
		<span class="w-2 h-2 bg-(--color-warning-border) shrink-0 animate-pulse"></span>
		<span class="font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning)">
			{msg.headline}
		</span>
	</div>
	<p class="font-mono text-[10px] text-(--color-warning) opacity-80 pl-4">
		{msg.body}
	</p>
	<a
		href="/dashboard/integrations"
		class="pl-4 font-mono text-[10px] font-black uppercase tracking-widest text-(--color-warning) no-underline hover:underline"
	>
		{msg.cta}
	</a>
</div>
