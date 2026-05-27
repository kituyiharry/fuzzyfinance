<script>
	import Card from '$lib/components/Card.svelte';
	import { themeStore } from '$lib/theme.svelte.js';
    import { page } from '$app/stores';

	/** @type {Array<{id: string, name: string, isDefault: boolean, driveSlug: string|null}>} */
	const nonPersonalWorkspaces = $derived(($page.data.workspaces ?? []).filter(/** @param {any} w */ w => !w.isDefault));

	/** @type {Record<string, string>} */
	let slugValues = $state(
		Object.fromEntries(
			($page.data.workspaces ?? [])
				.filter(/** @param {any} w */ w => !w.isDefault)
				.map(/** @param {any} w */ w => [w.id, w.driveSlug ?? w.name])
		)
	);

	/** @type {Record<string, boolean>} */
	let saving = $state({});
	/** @type {Record<string, string|null>} */
	let saveError = $state({});
	/** @type {Record<string, boolean>} */
	let saveSuccess = $state({});

	/** @param {string} id */
	async function saveSlug(id) {
		const slug = (slugValues[id] ?? '').trim();
		if (!slug) return;
		saving[id] = true;
		saveError[id] = null;
		saveSuccess[id] = false;
		try {
			const res = await fetch(`/api/workspaces/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ driveSlug: slug }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				saveError[id] = data?.message ?? `Error ${res.status}`;
			} else {
				saveSuccess[id] = true;
				setTimeout(() => { saveSuccess[id] = false; }, 2000);
			}
		} catch (err) {
			saveError[id] = String(err);
		} finally {
			saving[id] = false;
		}
	}
</script>

<svelte:head>
	<title>System Settings | FuzzyFinance</title>
</svelte:head>

<div class="max-w-4xl mx-auto flex flex-col gap-8">
	<Card title="Personnel Configuration">
		<div class="flex flex-col gap-6">
			<div>
				<h3 class="text-xs font-black uppercase tracking-widest mb-4">Appearance</h3>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<!-- Light Mode Option -->
					<button
						onclick={() => themeStore.set('light')}
						class="flex flex-col gap-3 p-4 border-2 transition-all text-left {themeStore.current === 'light' ? 'border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) shadow-(--shadow-sm)' : 'border-(--color-border) bg-(--color-bg) text-(--color-fg) hover:border-(--color-fg)'}"
					>
						<span class="text-[10px] font-black uppercase tracking-widest font-mono">High Contrast Light</span>
						<!-- Mini swatch: white bg, black accent -->
						<div class="flex flex-col gap-1 w-full">
							<div class="h-2 w-full" style="background:#ffffff; border: 1px solid #000000;"></div>
							<div class="flex gap-1">
								<div class="h-1.5 w-1/3" style="background:#000000;"></div>
								<div class="h-1.5 w-2/3" style="background:#e5e5e5;"></div>
							</div>
						</div>
					</button>

					<!-- Dark Mode Option -->
					<button
						onclick={() => themeStore.set('dark')}
						class="flex flex-col gap-3 p-4 border-2 transition-all text-left {themeStore.current === 'dark' ? 'border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) shadow-(--shadow-sm)' : 'border-(--color-border) bg-(--color-bg) text-(--color-fg) hover:border-(--color-fg)'}"
					>
						<span class="text-[10px] font-black uppercase tracking-widest font-mono">High Contrast Dark</span>
						<!-- Mini swatch: black bg, white accent -->
						<div class="flex flex-col gap-1 w-full">
							<div class="h-2 w-full" style="background:#0a0a0a; border: 1px solid #ffffff;"></div>
							<div class="flex gap-1">
								<div class="h-1.5 w-1/3" style="background:#ffffff;"></div>
								<div class="h-1.5 w-2/3" style="background:#1a1a1a;"></div>
							</div>
						</div>
					</button>

					<!-- Pastel Mode Option -->
					<button
						onclick={() => themeStore.set('low-contrast')}
						class="flex flex-col gap-3 p-4 border-2 transition-all text-left {themeStore.current === 'low-contrast' ? 'border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg) shadow-(--shadow-sm)' : 'border-(--color-border) bg-(--color-bg) text-(--color-fg) hover:border-(--color-fg)'}"
					>
						<span class="text-[10px] font-black uppercase tracking-widest font-mono">Low Contrast Pastel</span>
						<!-- Mini swatch: cream bg, teal accent -->
						<div class="flex flex-col gap-1 w-full">
							<div class="h-2 w-full" style="background:#fdfcf0; border: 1px solid #b4b4b4;"></div>
							<div class="flex gap-1">
								<div class="h-1.5 w-1/3" style="background:#a8dadc;"></div>
								<div class="h-1.5 w-2/3" style="background:#f1faee;"></div>
							</div>
						</div>
					</button>
				</div>
			</div>

			<div class="h-0.5 w-full bg-(--color-border) opacity-10"></div>

			<div>
				<h3 class="text-xs font-black uppercase tracking-widest mb-4">Personnel Information</h3>
				<div class="grid grid-cols-2 gap-4 font-mono text-[10px]">
					<div class="flex flex-col gap-1">
						<span class="text-(--color-muted-foreground)">IDENTIFIER:</span>
						<span class="font-bold">{$page.data.user.name}</span>
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-(--color-muted-foreground)">EMAIL:</span>
						<span class="font-bold">{$page.data.user.email}</span>
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-(--color-muted-foreground)">VERIFIED:</span>
    					{#if $page.data.user.emailVerified}
							<span class="font-bold text-(--color-success)">OK</span>
						{:else}
							<span class="font-bold text-(--color-danger)">FALSE</span>
						{/if}
					</div>
					<div class="flex flex-col gap-1">
						<span class="text-(--color-muted-foreground)">LAST_ACCESS:</span>
						<span class="font-bold">{$page.data.session.updatedAt}</span>
					</div>
				</div>
			</div>
		</div>
	</Card>

	{#if nonPersonalWorkspaces.length > 0}
	<Card title="Workspace Sync Folders">
		<div class="flex flex-col gap-6">
			<p class="text-[10px] font-mono text-(--color-muted-foreground) uppercase tracking-wide">
				Each workspace syncs receipts and revenue to its own Drive/OneDrive folder pair. Edit the slug below to control the folder names.
			</p>
			{#each nonPersonalWorkspaces as ws (ws.id)}
				<div class="flex flex-col gap-3">
					<h3 class="text-xs font-black uppercase tracking-widest">{ws.name}</h3>
					<div class="flex flex-col gap-2">
						<label for="slug-{ws.id}" class="text-[10px] font-mono text-(--color-muted-foreground) uppercase tracking-widest">
							Folder Slug
						</label>
						<div class="flex gap-2">
							<input
								id="slug-{ws.id}"
								type="text"
								bind:value={slugValues[ws.id]}
								maxlength="50"
								class="flex-1 font-mono text-xs p-2 border border-(--color-border) bg-(--color-bg) text-(--color-fg) focus:outline-none focus:border-(--color-fg)"
							/>
							<button
								onclick={() => saveSlug(ws.id)}
								disabled={saving[ws.id] || !(slugValues[ws.id] ?? '').trim()}
								class="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-(--color-fg) bg-(--color-fg) text-(--color-bg) hover:bg-(--color-bg) hover:text-(--color-fg) transition-all disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{#if saving[ws.id]}
									Saving...
								{:else if saveSuccess[ws.id]}
									Saved
								{:else}
									Save
								{/if}
							</button>
						</div>
						<p class="text-[10px] font-mono text-(--color-muted-foreground)">
							Receipts folder: <strong>FuzzyFinance Receipts for {slugValues[ws.id] || ws.name}</strong><br />
							Revenue folder: <strong>FuzzyFinance Sales for {slugValues[ws.id] || ws.name}</strong>
						</p>
						{#if saveError[ws.id]}
							<p class="text-[10px] font-mono text-(--color-danger)">{saveError[ws.id]}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</Card>
	{/if}
</div>
