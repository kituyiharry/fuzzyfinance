<script>
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let expanded = new SvelteSet();
	let deleting = new SvelteSet();

	/** @type {typeof data.conversations} */
	let conversations = $state([...data.conversations]);

	/** @param {string} id */
	function toggleExpand(id) {
		if (expanded.has(id)) {
			expanded.delete(id);
		} else {
			expanded.add(id);
		}
	}

	/** @param {string} id */
	async function deleteConversation(id) {
		deleting.add(id);
		try {
			const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
			if (res.ok) {
				conversations = conversations.filter((c) => c.id !== id);
				expanded.delete(id);
			}
		} finally {
			deleting.delete(id);
		}
	}

	/** @param {Date | number} date */
	function formatDate(date) {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<svelte:head>
	<title>Conversations | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-4 max-w-3xl mx-auto">

	{#if conversations.length === 0}
		<EmptyState
			title="No saved conversations"
			description="Use the query interface on the dashboard to ask questions about your receipts. Save a conversation to access it here."
		/>
	{:else}
		<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold">
			{conversations.length} saved {conversations.length === 1 ? 'conversation' : 'conversations'}
		</p>

		<div class="flex flex-col gap-2">
			{#each conversations as convo (convo.id)}
				{@const isExpanded = expanded.has(convo.id)}
				{@const isDeleting = deleting.has(convo.id)}

				<div class="border-2 border-(--color-border) bg-(--color-bg)">
					<!-- Header row -->
					<div class="flex items-center gap-3 p-4">
						<button
							onclick={() => toggleExpand(convo.id)}
							class="flex-1 flex items-center gap-3 text-left min-w-0 border-0 bg-transparent p-0"
						>
							<span class="font-mono text-[10px] text-(--color-muted-foreground) shrink-0 w-3">
								{isExpanded ? '▼' : '▶'}
							</span>
							<div class="flex-1 min-w-0">
								<p class="font-mono text-xs font-black uppercase tracking-wide text-(--color-fg) truncate">
									{convo.title}
								</p>
								<p class="font-mono text-[9px] text-(--color-muted-foreground) mt-0.5">
									{convo.messages.length} message{convo.messages.length === 1 ? '' : 's'} · {formatDate(convo.createdAt)}
								</p>
							</div>
						</button>

						<button
							onclick={() => deleteConversation(convo.id)}
							disabled={isDeleting}
							class="font-mono text-[9px] uppercase tracking-widest text-(--color-danger) hover:bg-(--color-danger-muted) border border-(--color-danger-border) px-2.5 py-1 transition-colors disabled:opacity-50 shrink-0"
						>
							{isDeleting ? 'DELETING...' : 'DELETE'}
						</button>
					</div>

					<!-- Expanded messages -->
					{#if isExpanded}
						<div class="border-t-2 border-(--color-border) p-4 flex flex-col gap-3 bg-(--color-muted)">
							{#each convo.messages as msg (msg)}
								<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
									<div class="max-w-[80%] {msg.role === 'user'
										? 'bg-(--color-fg) text-(--color-bg) border-2 border-(--color-fg)'
										: 'bg-(--color-bg) text-(--color-fg) border-2 border-(--color-border)'} p-3">
										<p class="font-mono text-[9px] uppercase tracking-widest font-black mb-1 opacity-60">
											{msg.role === 'user' ? 'YOU' : 'ASSISTANT'}
										</p>
										<p class="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
											{msg.content}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

</div>
