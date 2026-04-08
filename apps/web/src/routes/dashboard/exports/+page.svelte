<script>
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';

	/** @type {{ data: import('./$types').PageData }} */
	let { data } = $props();

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
			<div class="py-12 text-center">
				<p class="font-mono text-xs uppercase text-(--color-muted-foreground)">
					NO EXPORTS YET. SELECT RECEIPTS FROM THE RECEIPTS PAGE TO EXPORT THEM.
				</p>
				<a href="/dashboard/receipts" class="inline-block mt-4 font-black text-xs uppercase tracking-widest underline text-(--color-fg)">
					Go to Receipts →
				</a>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-(--color-border)">
							{#each ['Created', 'File', 'Receipts', 'Rows', '', ''] as col (col)}
								<th class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) pb-2 pr-4 font-bold">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.exports as exp (exp.id)}
							<tr class="border-b border-(--color-border) hover:bg-(--color-muted) transition-all group">
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) whitespace-nowrap">
									{fmtDateTime(exp.createdAt)}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) max-w-64 truncate">
									{exp.fileName}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-fg) text-center">
									{exp.receiptCount}
								</td>
								<td class="py-3 pr-4 font-mono text-[10px] text-(--color-muted-foreground) text-center">
									{exp.rowCount}
								</td>
								<td class="py-3 pr-4">
									<a
										href="/api/exports/{exp.id}/download"
										download={exp.fileName}
										class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-fg) no-underline border border-(--color-border) px-3 py-1 hover:border-(--color-fg) transition-colors"
									>
										DOWNLOAD CSV
									</a>
								</td>
								<td class="py-3">
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={exp.id} />
										<button
											type="submit"
											class="font-mono text-[9px] uppercase font-black tracking-widest text-(--color-muted-foreground) opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all"
										>
											DELETE
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>
