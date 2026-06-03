<script>
	import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	/**
	 * @typedef {{ id: string; label: string; level: string; total_price: number }} AlluvialNode
	 * @typedef {{ source: string; target: string; value: number }} AlluvialLink
	 * @typedef {{ nodes: AlluvialNode[]; links: AlluvialLink[] }} AlluvialData
	 *
	 * @typedef {{ name: string; id: string; level: string; primary?: string; value?: number; children?: TreeNode[] }} TreeNode
	 */

	/**
	 * @type {{
	 *   data: AlluvialData;
	 *   width?: number;
	 *   height?: number;
	 *   topPerCategory?: number;
	 * }}
	 */
	let { data, width = 1100, height = 640, topPerCategory = 12 } = $props();

	const PALETTE = [
		'#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261',
		'#7209b7', '#06d6a0', '#118ab2', '#ef476f', '#073b4c',
		'#fb8500', '#8338ec',
	];

	const MIN_LABEL_W = 56;
	const MIN_LABEL_H = 22;
	const LABEL_TRUNC = 22;

	/**
	 * Convert the alluvial DAG into a clean tree:
	 *   Root → PrimaryCategory → SecondaryCategory → Product
	 *
	 * Merchant is intentionally dropped because it lives on a different axis
	 * — the treemap visualises the *category* breakdown of spend. Products
	 * with no upstream primary→secondary→product chain are skipped.
	 *
	 * Per-secondary product count is capped at `topPerCategory` (by spend);
	 * the rest fold into a single "Other (k)" leaf so the leaves stay readable.
	 *
	 * @param {AlluvialData} input
	 * @returns {TreeNode}
	 */
	function buildTree(input) {
		/** @type {Map<string, AlluvialNode>} */
		const byId = new Map(input.nodes.map((n) => [n.id, n]));

		/** @param {string} parentId @param {string} childLevel */
		const childrenAt = (parentId, childLevel) => input.links
			.filter((l) => l.source === parentId)
			.map((l) => byId.get(l.target))
			.filter((/** @type {AlluvialNode | undefined} */ n) => Boolean(n) && n.level === childLevel);

		const primaries = input.nodes.filter((n) => n.level === 'PrimaryCategory');

		// Path-keyed IDs: a Secondary or Product can be reached via more than
		// one parent in the DAG, so we prefix each occurrence with its parent
		// path to guarantee uniqueness across the tree. Keeps Svelte's keyed
		// {#each} blocks happy and lets d3-hierarchy treat each occurrence as
		// its own cell.
		/** @type {TreeNode} */
		const root = { name: 'Total', id: 'root', level: 'Root', children: [] };
		for (const p of primaries) {
			/** @type {TreeNode} */
			const primaryNode = { name: p.label, id: p.id, level: 'PrimaryCategory', primary: p.label, children: [] };
			for (const s of childrenAt(p.id, 'SecondaryCategory')) {
				/** @type {TreeNode} */
				const secondaryNode = {
					name: s.label,
					id: `${p.id}::${s.id}`,
					level: 'SecondaryCategory',
					primary: p.label,
					children: [],
				};
				const products = childrenAt(s.id, 'Product')
					.map((/** @type {AlluvialNode} */ prod) => {
						const link = input.links.find((l) => l.source === s.id && l.target === prod.id);
						return { node: prod, value: link?.value ?? prod.total_price };
					})
					.sort((a, b) => b.value - a.value);
				const keep = products.slice(0, topPerCategory);
				const drop = products.slice(topPerCategory);
				for (const { node, value } of keep) {
					secondaryNode.children.push({
						name: node.label,
						id: `${p.id}::${s.id}::${node.id}`,
						level: 'Product',
						primary: p.label,
						value,
					});
				}
				if (drop.length > 0) {
					const otherValue = drop.reduce((sum, x) => sum + x.value, 0);
					secondaryNode.children.push({
						name: `Other (${drop.length})`,
						id: `${p.id}::${s.id}::other`,
						level: 'Product',
						primary: p.label,
						value: otherValue,
					});
				}
				if (secondaryNode.children.length > 0) primaryNode.children.push(secondaryNode);
			}
			if (primaryNode.children.length > 0) root.children.push(primaryNode);
		}
		return root;
	}

	const tree = $derived(buildTree(data));

	const primaryColor = $derived.by(() => {
		/** @type {SvelteMap<string, string>} */
		const map = new SvelteMap();
		(tree.children ?? []).forEach((p, i) => map.set(p.name, PALETTE[i % PALETTE.length]));
		return map;
	});

	const layout = $derived.by(() => {
		const root = hierarchy(tree)
			.sum((/** @type {any} */ d) => d.value ?? 0)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
		treemap()
			.size([width, height])
			.tile(treemapSquarify)
			.paddingTop((/** @type {any} */ d) => d.depth === 1 ? 16 : d.depth === 2 ? 12 : 1)
			.paddingInner(2)
			.round(true)(root);
		return root;
	});

	const allLeaves = $derived(layout.leaves());
	const primaryNodes = $derived(layout.descendants().filter((/** @type {any} */ n) => n.depth === 1));
	const secondaryNodes = $derived(layout.descendants().filter((/** @type {any} */ n) => n.depth === 2));

	const totalSpend = $derived(layout.value ?? 0);

	const hiddenPrimaries = new SvelteSet();
	/** @type {string | null} */
	let hoveredId = $state(null);

	/** @param {string} name */
	function togglePrimary(name) {
		if (hiddenPrimaries.has(name)) hiddenPrimaries.delete(name);
		else hiddenPrimaries.add(name);
	}

	/** @param {string} label */
	function truncate(label) {
		return label.length > LABEL_TRUNC ? `${label.slice(0, LABEL_TRUNC - 1)}…` : label;
	}

	/** @param {number} v */
	function fmt(v) {
		if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
		if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
		return v.toFixed(0);
	}

	/** @param {any} node */
	function visible(node) {
		const primary = node.data.primary ?? node.data.name;
		return !hiddenPrimaries.has(primary);
	}

	/** @param {any} node */
	function leafOpacity(node) {
		if (hoveredId === null) return 1;
		return node.data.id === hoveredId ? 1 : 0.35;
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Toolbar -->
	<div class="flex items-center gap-3 border-b-2 border-(--color-border) pb-2 flex-wrap">
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-fg)">
			Treemap · category hierarchy
		</span>
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
			{primaryNodes.length} primaries · {secondaryNodes.length} secondaries · {allLeaves.length} leaves · total {fmt(totalSpend)}
		</span>
		<span class="ml-auto font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
			Click a legend swatch to toggle a primary category
		</span>
	</div>

	{#if !tree.children || tree.children.length === 0}
		<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
			Not enough hierarchical data for a treemap.
		</p>
	{:else}
		<div class="border-2 border-(--color-border) bg-(--color-bg) p-2 overflow-x-auto">
			<svg viewBox="0 0 {width} {height}" class="w-full h-auto font-mono text-[10px]">
				<!-- Primary background rects (give each "supercell" its own fill) -->
				<g>
					{#each primaryNodes as p (p.data.id)}
						{@const color = primaryColor.get(p.data.name) ?? '#999'}
						<rect
							x={p.x0}
							y={p.y0}
							width={p.x1 - p.x0}
							height={p.y1 - p.y0}
							fill={color}
							opacity={visible(p) ? 0.10 : 0.02}
							stroke={color}
							stroke-width="1"
						/>
						{#if (p.x1 - p.x0) > 90 && visible(p)}
							<text
								x={p.x0 + 6}
								y={p.y0 + 12}
								fill="var(--color-fg)"
								class="font-black uppercase tracking-widest"
								style="font-size: 10px;"
							>
								{truncate(p.data.name)} · {fmt(p.value ?? 0)}
							</text>
						{/if}
					{/each}
				</g>

				<!-- Secondary subheaders -->
				<g>
					{#each secondaryNodes as s (s.data.id)}
						{#if (s.x1 - s.x0) > 70 && visible(s)}
							<text
								x={s.x0 + 4}
								y={s.y0 + 10}
								fill="var(--color-fg)"
								opacity="0.65"
								class="uppercase tracking-widest"
								style="font-size: 8px;"
							>{truncate(s.data.name)}</text>
						{/if}
					{/each}
				</g>

				<!-- Product leaves -->
				<g>
					{#each allLeaves as leaf (leaf.data.id)}
						{@const color = primaryColor.get(leaf.data.primary ?? '') ?? '#666'}
						{@const w = leaf.x1 - leaf.x0}
						{@const h = leaf.y1 - leaf.y0}
						{@const isOther = leaf.data.id.endsWith('::other')}
						<rect
							x={leaf.x0}
							y={leaf.y0}
							width={w}
							height={h}
							fill={isOther ? 'var(--color-border)' : color}
							opacity={visible(leaf) ? leafOpacity(leaf) : 0.04}
							stroke="var(--color-bg)"
							stroke-width="1"
							role="img"
							aria-label="{leaf.data.name}: {(leaf.value ?? 0).toFixed(2)}"
							style="cursor: pointer; transition: opacity 120ms ease-out;"
							onmouseenter={() => (hoveredId = leaf.data.id)}
							onmouseleave={() => (hoveredId = null)}
						>
							<title>{leaf.data.primary ?? '—'} → {leaf.parent?.data?.name ?? '—'} → {leaf.data.name}: {(leaf.value ?? 0).toFixed(2)}</title>
						</rect>
						{#if w >= MIN_LABEL_W && h >= MIN_LABEL_H && visible(leaf)}
							<text
								x={leaf.x0 + 4}
								y={leaf.y0 + 12}
								fill="var(--color-bg)"
								style="font-size: 9px; pointer-events: none;"
							>{truncate(leaf.data.name)}</text>
							<text
								x={leaf.x0 + 4}
								y={leaf.y0 + 24}
								fill="var(--color-bg)"
								opacity="0.75"
								style="font-size: 9px; pointer-events: none;"
							>{fmt(leaf.value ?? 0)}</text>
						{/if}
					{/each}
				</g>
			</svg>
		</div>

		<!-- Legend -->
		<div class="flex flex-wrap gap-x-3 gap-y-1.5">
			{#each tree.children ?? [] as p (p.id)}
				{@const hidden = hiddenPrimaries.has(p.name)}
				{@const color = primaryColor.get(p.name) ?? '#999'}
				{@const total = (p.children ?? []).reduce((sum, /** @type {any} */ s) => sum + ((s.children ?? []).reduce((/** @type {number} */ ss, /** @type {any} */ ll) => ss + (ll.value ?? 0), 0)), 0)}
				<button
					onclick={() => togglePrimary(p.name)}
					class="flex items-center gap-1.5 font-mono text-[10px] hover:opacity-100 transition-opacity"
					class:opacity-40={hidden}
				>
					<span
						class="inline-block w-3 h-3 border border-(--color-border)"
						style="background: {color};"
					></span>
					<span class:line-through={hidden}>{p.name}</span>
					<span class="text-(--color-muted-foreground)">{fmt(total)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
