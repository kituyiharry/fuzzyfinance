<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

	let expandedExports = new SvelteSet();

	/** @param {Date | null | undefined} d */
	const fmtDateTime = (d) => d
		? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
		: '—';
</script>

<svelte:head>
	<title>Exports | FuzzyFinance</title>
</svelte:head>

<div class="flex flex-col gap-6 max-w-5xl mx-auto">
	<Card title="CSV Exports ({data.exports.length})">
		{#if data.exports.length === 0}
			<EmptyState
				message="No exports yet"
				submessage="Select receipts from the receipts page and click Export to generate a CSV."
				ctaLabel="Go to Receipts"
				ctaHref={resolve("/dashboard/receipts")}
			/>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Created', 'File', 'Receipts', 'Rows', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.exports as exp (exp.id)}
							{@const isExpanded = expandedExports.has(exp.id)}
							<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all group">
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
									{fmtDateTime(exp.createdAt)}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) max-w-64 truncate">
									{exp.fileName}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) text-center">
									<button
										onclick={() => isExpanded ? expandedExports.delete(exp.id) : expandedExports.add(exp.id)}
										class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg) transition-colors"
									>
										{exp.receiptCount} {exp.receiptCount === 1 ? 'receipt' : 'receipts'} {isExpanded ? '▼' : '▶'}
									</button>
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) text-center">
									{exp.rowCount}
								</td>
								<td class="py-3 pr-4">
									<a
										href={resolve(`/api/exports/[id]/download`, {
                                            id: exp.id
                                        })}
										download={exp.fileName}
										class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-fg) no-underline border border-(--color-border) px-3 py-1 hover:border-(--color-fg) transition-colors"
									>
										DOWNLOAD CSV
									</a>
								</td>
								<td class="py-3">
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={exp.id} />
										<button type="submit" class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-muted-foreground) opacity-0 group-hover:opacity-100 hover:text-(--color-danger) transition-all">
											DELETE
										</button>
									</form>
								</td>
							</tr>
							{#if isExpanded && exp.receiptIds.length > 0}
								<tr class="border-b border-(--color-border)">
									<td colspan="6" class="bg-(--color-muted) px-4 py-3">
										<p class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold mb-2">
											INCLUDED RECEIPTS
										</p>
										<div class="flex flex-wrap gap-2">
											{#each exp.receiptIds as id (id)}
												<a
													href="/dashboard/receipts/{id}"
													class="font-mono text-[9px] text-(--color-fg) border border-(--color-border) px-2 py-0.5 hover:border-(--color-fg) no-underline transition-colors"
												>
													{id.slice(0, 8)}…
												</a>
											{/each}
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>
