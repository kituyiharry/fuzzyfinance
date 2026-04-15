<script>
	import Card from '$lib/components/Card.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	/** @param {Date | null | undefined} d */
	const fmtDate = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(d))
		: null;

	/** @param {'info' | 'warning' | 'maintenance' | 'release' | string} type
	 *  @returns {'info' | 'warning' | 'danger' | 'success' | 'default'}
	 */
	const typeVariant = (type) => {
		if (type === 'info')        return 'info';
		if (type === 'warning')     return 'warning';
		if (type === 'maintenance') return 'danger';
		if (type === 'release')     return 'success';
		return 'default';
	};
</script>

<svelte:head>
	<title>Announcements | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
	<Card title="Announcements ({data.announcements.length})">
		{#if data.announcements.length === 0}
			<EmptyState
				message="No active announcements"
				submessage="Platform updates and notices will appear here when published."
			/>
		{:else}
			<div class="flex flex-col divide-y-2 divide-(--color-border)">
				{#each data.announcements as announcement (announcement.id)}
					<div class="py-5 first:pt-0 last:pb-0">
						<div class="flex items-start gap-3 mb-2">
							<Badge
								label={announcement.type}
								variant={typeVariant(announcement.type)}
								size="xs"
							/>
							{#if announcement.showBanner}
								<Badge label="Banner" variant="warning" size="xs" />
							{/if}
							{#if announcement.publishedAt}
								<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) ml-auto">
									{fmtDate(announcement.publishedAt)}
								</span>
							{/if}
						</div>
						<h3 class="font-black text-sm uppercase tracking-tight text-(--color-fg) leading-snug mb-2">
							{announcement.title}
						</h3>
						{#if announcement.body}
							<p class="font-mono text-[11px] text-(--color-muted-foreground) leading-relaxed whitespace-pre-wrap">
								{announcement.body}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>
