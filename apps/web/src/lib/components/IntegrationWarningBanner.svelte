<script>
	/**
	 * @type {{ status: 'none' | 'all_expired'; class?: string }}
	 */
	let { status, class: className = '' } = $props();

	const MESSAGE = {
		none: {
			headline: 'NO CLOUD INTEGRATION CONNECTED',
			body: 'Receipts cannot be uploaded or synced until you connect at least one cloud workspace provider.',
			cta: 'Connect an Integration →'
		},
		all_expired: {
			headline: 'INTEGRATION TOKENS EXPIRED',
			body: 'Your connected integration credentials have expired. Re-authorize to resume receipt uploads and sync.',
			cta: 'Re-authorize →'
		}
	};

	let msg = $derived(MESSAGE[status]);
</script>

<div class="border-2 border-yellow-500 bg-(--color-bg) p-4 flex flex-col gap-2 {className}">
	<div class="flex items-center gap-2">
		<span class="w-2 h-2 bg-yellow-500 shrink-0"></span>
		<span class="font-mono text-[10px] font-black uppercase tracking-widest text-yellow-600">
			{msg.headline}
		</span>
	</div>
	<p class="font-mono text-[10px] text-(--color-muted-foreground) pl-4">
		{msg.body}
	</p>
	<a
		href="/dashboard/integrations"
		class="pl-4 font-mono text-[10px] font-black uppercase tracking-widest text-yellow-600 no-underline hover:underline"
	>
		{msg.cta}
	</a>
</div>
