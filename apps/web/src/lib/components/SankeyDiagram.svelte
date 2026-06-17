<script>
	import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	/**
	 * @typedef {{ by_group: Record<string, number> }} UnitTotals
	 * @typedef {{ id: string; label: string; level: string; total_price: number; unit_totals?: UnitTotals }} AlluvialNode
	 * @typedef {{ source: string; target: string; value: number; unit_totals?: UnitTotals }} AlluvialLink
	 * @typedef {{ nodes: AlluvialNode[]; links: AlluvialLink[] }} AlluvialData
	 * @typedef {{ id: string; label: string; level: string; memberIds: SvelteSet<string> }} CustomGroup
	 */

	let { data, width = 1400, topN = 20 } = $props();

	const LEVELS = ['Merchant', 'PrimaryCategory', 'SecondaryCategory', 'Product'];
	const margin = { top: 20, right: 300, bottom: 20, left: 20 };
	const LABEL_MAX = 32;
	const MIN_LABEL_H = 10;

	// ── User-controlled state ────────────────────────────────────────────────

	let panelOpen = $state(false);
	const hiddenIds = new SvelteSet();
	const selectedForGroup = new SvelteSet();
	/** @type {CustomGroup[]} */
	let customGroups = $state([]);
	/** @type {Record<string, string>} */
	let groupNameDrafts = $state({});

	/** @param {string} id */
	function toggleHidden(id) {
		const node = data.nodes.find((/** @type {AlluvialNode} */ n) => n.id === id);
		// Products are terminal; filtering them has no cascade and is disabled.
		if (node?.level === 'Product') return;
		if (hiddenIds.has(id)) hiddenIds.delete(id);
		else hiddenIds.add(id);
	}

	/** @param {string} id */
	function toggleSelected(id) {
		if (selectedForGroup.has(id)) selectedForGroup.delete(id);
		else selectedForGroup.add(id);
	}

	/** @param {string} level */
	function selectedAtLevel(level) {
		return data.nodes.filter(
			(/** @type {AlluvialNode} */ n) =>
				n.level === level && selectedForGroup.has(n.id),
		);
	}

	/** @param {string} level */
	function createGroup(level) {
		const members = selectedAtLevel(level);
		if (members.length < 2) return;
		const label = (groupNameDrafts[level] || '').trim() || `Group of ${members.length}`;
		const memberSet = new SvelteSet();
		members.forEach((m) => memberSet.add(m.id));
		customGroups = [
			...customGroups,
			{ id: `group:${level}:${customGroups.length + 1}`, label, level, memberIds: memberSet },
		];
		members.forEach((m) => selectedForGroup.delete(m.id));
		groupNameDrafts[level] = '';
	}

	/** @param {string} level */
	function resetLevel(level) {
		for (const id of [...hiddenIds]) {
			const node = data.nodes.find((/** @type {AlluvialNode} */ n) => n.id === id);
			if (node?.level === level) hiddenIds.delete(id);
		}
		customGroups = customGroups.filter((g) => g.level !== level);
	}

	function resetAll() {
		hiddenIds.clear();
		selectedForGroup.clear();
		customGroups = [];
		groupNameDrafts = {};
	}

	// ── Pure helpers ─────────────────────────────────────────────────────────

	/** @param {UnitTotals | undefined} into @param {UnitTotals | undefined} from */
	function mergeUnitTotalsInto(into, from) {
		const src = from?.by_group ?? {};
		const dst = into?.by_group;
		if (!dst) return;
		for (const [g, v] of Object.entries(src)) {
			dst[g] = (dst[g] ?? 0) + v;
		}
	}

	/** @param {string} label @param {number} [max] */
	function truncate(label, max = LABEL_MAX) {
		return label.length > max ? `${label.slice(0, max - 1)}…` : label;
	}

	/** @param {string} level */
	function levelColor(level) {
		switch (level) {
			case 'Merchant':          return 'var(--color-fg)';
			case 'PrimaryCategory':   return 'var(--color-accent, currentColor)';
			case 'SecondaryCategory': return 'var(--color-muted-foreground)';
			default:                  return 'var(--color-fg)';
		}
	}

	// ── Data transformations ─────────────────────────────────────────────────

	/**
	 * Apply user filters (hide) and custom groups to the input,
	 * then collapse to top-N per level. Order matters: user choices
	 * apply first so the Other bucket only contains long-tail items.
	 *
	 * @param {AlluvialData} input
	 * @param {SvelteSet<string>} hidden
	 * @param {CustomGroup[]} groups
	 * @param {number} n
	 * @returns {AlluvialData}
	 */
	function applyUserAndRollup(input, hidden, groups, n) {
		// Map each member node id to its group id.
		const memberToGroup = new SvelteMap();
		const groupAccumulators = new SvelteMap();
		for (const g of groups) {
			groupAccumulators.set(g.id, {
				id: g.id, label: g.label, level: g.level,
				total_price: 0, unit_totals: { by_group: {} },
			});
			for (const memberId of g.memberIds) memberToGroup.set(memberId, g.id);
		}

		// Filter hidden + roll members into group accumulators.
		const passthrough = [];
		for (const node of input.nodes) {
			if (hidden.has(node.id)) continue;
			const groupId = memberToGroup.get(node.id);
			if (groupId) {
				const acc = groupAccumulators.get(groupId);
				acc.total_price += node.total_price ?? 0;
				mergeUnitTotalsInto(acc.unit_totals, node.unit_totals);
			} else {
				passthrough.push(node);
			}
		}
		const userNodes = [...passthrough, ...groupAccumulators.values()];

		// Filter + redirect + re-aggregate links.
		const linkMap = new SvelteMap();
		for (const link of input.links) {
			if (hidden.has(link.source) || hidden.has(link.target)) continue;
			const src = memberToGroup.get(link.source) ?? link.source;
			const tgt = memberToGroup.get(link.target) ?? link.target;
			const key = `${src}|${tgt}`;
			const existing = linkMap.get(key) ?? {
				source: src, target: tgt, value: 0, unit_totals: { by_group: {} },
			};
			existing.value += link.value;
			mergeUnitTotalsInto(existing.unit_totals, link.unit_totals);
			linkMap.set(key, existing);
		}

		const pruned = pruneByCascade({ nodes: userNodes, links: [...linkMap.values()] });
		return rollupTopN(pruned, n);
	}

	/**
	 * Iteratively drop nodes that have no kept parent (non-root level)
	 * or no kept child (non-terminal level) until the graph reaches a
	 * fixed point. This is what gives the filter-tree behaviour: hiding
	 * one upstream node cascades through every downstream subtree whose
	 * only path went through it, and vice-versa.
	 *
	 * @param {AlluvialData} input
	 * @returns {AlluvialData}
	 */
	function pruneByCascade(input) {
		/** @type {SvelteMap<string, SvelteSet<string>>} */
		const byLevel = new SvelteMap();
		for (const node of input.nodes) {
			if (!byLevel.has(node.level)) byLevel.set(node.level, new SvelteSet());
			byLevel.get(node.level).add(node.id);
		}

		let changed = true;
		let safety = 10;
		while (changed && safety-- > 0) {
			changed = false;

			// Forward: each non-root node must have at least one kept parent.
			for (let i = 1; i < LEVELS.length; i++) {
				const childSet = byLevel.get(LEVELS[i]);
				const parentSet = byLevel.get(LEVELS[i - 1]);
				if (!childSet || childSet.size === 0 || !parentSet) continue;
				for (const childId of [...childSet]) {
					let hasParent = false;
					for (const l of input.links) {
						if (l.target === childId && parentSet.has(l.source)) {
							hasParent = true;
							break;
						}
					}
					if (!hasParent) {
						childSet.delete(childId);
						changed = true;
					}
				}
			}

			// Backward: each non-terminal node must have at least one kept child.
			for (let i = LEVELS.length - 2; i >= 0; i--) {
				const parentSet = byLevel.get(LEVELS[i]);
				const childSet = byLevel.get(LEVELS[i + 1]);
				if (!parentSet || parentSet.size === 0 || !childSet) continue;
				for (const parentId of [...parentSet]) {
					let hasChild = false;
					for (const l of input.links) {
						if (l.source === parentId && childSet.has(l.target)) {
							hasChild = true;
							break;
						}
					}
					if (!hasChild) {
						parentSet.delete(parentId);
						changed = true;
					}
				}
			}
		}

		const allKept = new SvelteSet();
		for (const set of byLevel.values()) for (const id of set) allKept.add(id);
		return {
			nodes: input.nodes.filter((n) => allKept.has(n.id)),
			links: input.links.filter((l) => allKept.has(l.source) && allKept.has(l.target)),
		};
	}

	/**
	 * @param {AlluvialData} input
	 * @param {number} n
	 * @returns {AlluvialData}
	 */
	function rollupTopN(input, n) {
		if (!Number.isFinite(n) || n <= 0) return input;
		const byLevel = new SvelteMap();
		for (const node of input.nodes) {
			const bucket = byLevel.get(node.level) ?? [];
			bucket.push(node);
			byLevel.set(node.level, bucket);
		}
		const keptIds = new SvelteSet();
		const collapseMap = new SvelteMap();
		const otherNodes = [];
		for (const [level, nodes] of byLevel) {
			const sorted = [...nodes].sort((a, b) => b.total_price - a.total_price);
			const keep = sorted.slice(0, n);
			const drop = sorted.slice(n);
			keep.forEach((node) => keptIds.add(node.id));
			if (drop.length > 0) {
				const merged = {
					id: `other:${level}`,
					label: `Other (${drop.length})`,
					level,
					total_price: drop.reduce((s, x) => s + (x.total_price ?? 0), 0),
					unit_totals: { by_group: {} },
				};
				for (const x of drop) mergeUnitTotalsInto(merged.unit_totals, x.unit_totals);
				otherNodes.push(merged);
				drop.forEach((node) => collapseMap.set(node.id, merged.id));
			}
		}
		const linkMap = new SvelteMap();
		for (const link of input.links) {
			const src = collapseMap.get(link.source) ?? link.source;
			const tgt = collapseMap.get(link.target) ?? link.target;
			const key = `${src}|${tgt}`;
			const existing = linkMap.get(key) ?? {
				source: src, target: tgt, value: 0, unit_totals: { by_group: {} },
			};
			existing.value += link.value;
			mergeUnitTotalsInto(existing.unit_totals, link.unit_totals);
			linkMap.set(key, existing);
		}
		return {
			nodes: [...input.nodes.filter((nd) => keptIds.has(nd.id)), ...otherNodes],
			links: [...linkMap.values()],
		};
	}

	/**
	 * Find every node reachable from `startId` upstream AND downstream — the
	 * complete subgraph (all flows touching `startId` end-to-end).
	 *
	 * @param {string} startId
	 * @param {any[]} links
	 */
	function computeReachable(startId, links) {
		const reachable = new SvelteSet([startId]);
		const walk = (/** @type {'forward' | 'backward'} */ direction) => {
			let frontier = [startId];
			while (frontier.length) {
				/** @type {string[]} */
				const next = [];
				for (const id of frontier) {
					for (const l of links) {
						if (direction === 'forward' && l.source.id === id && !reachable.has(l.target.id)) {
							reachable.add(l.target.id);
							next.push(l.target.id);
						} else if (direction === 'backward' && l.target.id === id && !reachable.has(l.source.id)) {
							reachable.add(l.source.id);
							next.push(l.source.id);
						}
					}
				}
				frontier = next;
			}
		};
		walk('forward');
		walk('backward');
		return reachable;
	}

	// ── Derived diagram + interaction state ──────────────────────────────────

	const transformed = $derived(applyUserAndRollup(data, hiddenIds, customGroups, topN));
	const height = $derived(
		Math.max(420, transformed.nodes.length * 14 + margin.top + margin.bottom),
	);

	const layout = $derived.by(() => {
		const gen = sankey()
			.nodeId((/** @type {any} */ d) => d.id)
			.nodeWidth(14)
			.nodePadding(6)
			.nodeAlign(sankeyJustify)
			.extent([
				[margin.left, margin.top],
				[width - margin.right, height - margin.bottom],
			]);
		return gen({
			nodes: transformed.nodes.map((n) => ({ ...n })),
			links: transformed.links.map((l) => ({ ...l })),
		});
	});

	const linkPath = sankeyLinkHorizontal();
	/** @type {string | null} */
	let hoveredId = $state(null);

	const reachableIds = $derived.by(() => {
		if (hoveredId === null) return null;
		return computeReachable(hoveredId, layout.links);
	});

	/** @param {any} link */
	function linkOpacity(link) {
		if (reachableIds === null) return 0.55;
		const onPath = reachableIds.has(link.source.id) && reachableIds.has(link.target.id);
		return onPath ? 0.85 : 0.06;
	}

	/**
	 * Stable string hash → integer.
	 * @param {string} s
	 */
	function _hashStr(s) {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return h;
	}

	// ── Flow-propagating colours ─────────────────────────────────────────
	//
	// Goal: the leftmost layer gets distinct vibrant base colours; every
	// downstream node's colour is the weighted RGB blend of its incoming
	// link colours; the further right you go the lighter the colour gets
	// (so the mix reads as "flowing forward" rather than a flat band).
	// Each link then paints with a gradient from its source node colour
	// to its target node colour — which makes flows visually merge at
	// each intermediate node, exactly like physical streams mixing.
	//
	// Conversion is in straight RGB. Hue blending would wrap weirdly when
	// inputs span the colour wheel (red + green ≠ yellow in HSL space).

	/** Distinct seed colours for the leftmost layer. Picked to be well
	 *  separated on the wheel and to read clearly on both light + dark
	 *  themes. The palette wraps cyclically when there are more leftmost
	 *  nodes than entries. */
	const PALETTE = [
		'#e94f4f', // red
		'#e98c2c', // orange
		'#d7c024', // yellow
		'#5fb84a', // green
		'#3aa6a6', // teal
		'#3776d8', // blue
		'#7e57c2', // indigo
		'#c25aa1', // pink
		'#d97757', // coral
		'#4ec1a8'  // mint
	];

	/** @param {string} hex */
	function _hexToRgb(hex) {
		const v = hex.replace('#', '');
		return {
			r: parseInt(v.slice(0, 2), 16),
			g: parseInt(v.slice(2, 4), 16),
			b: parseInt(v.slice(4, 6), 16)
		};
	}

	/** @param {{ r: number, g: number, b: number }} c @param {number} [opacity] */
	function _rgbCss(c, opacity = 1) {
		const r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
		return opacity === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${opacity})`;
	}

	/**
	 * Per-node propagated colour. Computed once per layout change:
	 *
	 *   1. Nodes with no incoming links (leftmost layer) get a palette
	 *      colour, assigned in a deterministic order based on (depth, y0)
	 *      so the same dataset always paints the same way.
	 *   2. Every other node's colour is the weighted RGB blend of its
	 *      incoming link source colours, weighted by `link.value`.
	 *   3. Each node's colour is then lifted toward white by a fraction
	 *      of its depth — so right-side layers read as lighter mixes.
	 */
	const nodeColors = $derived.by(() => {
		/** @type {Map<string, { r: number, g: number, b: number }>} */
		const colors = new Map();

		// Sort by (depth, y0) so palette assignment is stable across renders.
		/** @type {(a: any, b: any) => number} */
		const byDepthThenY = (a, b) => {
			const ad = a.depth ?? 0;
			const bd = b.depth ?? 0;
			if (ad !== bd) return ad - bd;
			return (a.y0 ?? 0) - (b.y0 ?? 0);
		};
		const sorted = [...layout.nodes].sort(byDepthThenY);

		let paletteIdx = 0;
		for (const n of sorted) {
			const node = /** @type {any} */ (n);
			const incoming = /** @type {any[]} */ (node.targetLinks ?? []);

			let base;
			if (incoming.length === 0) {
				base = _hexToRgb(PALETTE[paletteIdx % PALETTE.length]);
				paletteIdx++;
			} else {
				let r = 0, g = 0, b = 0, w = 0;
				for (const link of incoming) {
					const src = colors.get(link.source.id);
					if (!src) continue;
					const wi = Math.max(0.0001, link.value);
					r += src.r * wi;
					g += src.g * wi;
					b += src.b * wi;
					w += wi;
				}
				base = w > 0
					? { r: r / w, g: g / w, b: b / w }
					: _hexToRgb(PALETTE[0]);
			}

			// Lift toward white by depth so downstream layers read lighter.
			// 12% per layer, capped at 50% so deep flows don't fully wash out.
			const depth = node.depth ?? 0;
			const lift = Math.min(0.5, depth * 0.12);
			colors.set(n.id, {
				r: base.r + (255 - base.r) * lift,
				g: base.g + (255 - base.g) * lift,
				b: base.b + (255 - base.b) * lift
			});
		}
		return colors;
	});

	/** Stable gradient id per (source, target) pair. */
	/** @param {any} link */
	function linkGradientId(link) {
		return `lg-${_hashStr(`${link.source.id}>${link.target.id}`).toString(36)}`;
	}

	/** @param {any} link */
	function linkGradientStops(link) {
		const src = nodeColors.get(link.source.id) ?? { r: 120, g: 120, b: 120 };
		const dst = nodeColors.get(link.target.id) ?? src;
		return {
			id:  linkGradientId(link),
			src: _rgbCss(src),
			dst: _rgbCss(dst)
		};
	}

	/** Node fill that mirrors the propagated colour. Special group / other
	 *  buckets keep their semantic accent so the user can still tell them
	 *  apart at a glance. */
	/** @param {any} node */
	function nodeFlowFill(node) {
		if (node.id.startsWith('group:')) return 'var(--color-accent, currentColor)';
		if (node.id.startsWith('other:')) return 'var(--color-border)';
		const c = nodeColors.get(node.id);
		return c ? _rgbCss(c) : levelColor(node.level);
	}

	/** @param {any} node */
	function nodeOpacity(node) {
		if (reachableIds === null) return 1;
		return reachableIds.has(node.id) ? 1 : 0.3;
	}

	/** @param {any} node */
	function nodeFill(node) {
		if (node.id.startsWith('group:')) return 'var(--color-accent, currentColor)';
		if (node.id.startsWith('other:')) return 'var(--color-border)';
		return levelColor(node.level);
	}

	const activeControlCount = $derived(hiddenIds.size + customGroups.length);
</script>

<div class="flex flex-col gap-3">
	<!-- Controls header -->
	<div class="flex items-center gap-3 border-b-2 border-(--color-border) pb-2">
		<button
			onclick={() => (panelOpen = !panelOpen)}
			class="border-2 border-(--color-border) px-3 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-(--color-fg) hover:text-(--color-bg) transition-colors"
		>
			{panelOpen ? '−' : '+'} Filter &amp; Group
			{#if activeControlCount > 0}
				<span class="ml-1 text-(--color-accent)">({activeControlCount})</span>
			{/if}
		</button>
		{#if activeControlCount > 0}
			<button
				onclick={resetAll}
				class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) hover:text-(--color-fg)"
			>Reset all</button>
		{/if}
		<span class="ml-auto font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
			Hover for end-to-end flow · Filters cascade through connected flows
		</span>
	</div>

	<!-- Filter/group panel -->
	{#if panelOpen}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 border-2 border-(--color-border) p-3 bg-(--color-muted)">
			{#each LEVELS as level (level)}
				{@const isTerminal = level === 'Product'}
				{@const nodesAtLevel = data.nodes
					.filter((/** @type {AlluvialNode} */ n) => n.level === level)
					.sort((a, b) => b.total_price - a.total_price)}
				{@const selCount = selectedAtLevel(level).length}
				<div>
					<div class="flex items-center justify-between mb-2">
						<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
							{level} ({nodesAtLevel.length}){isTerminal ? ' · group only' : ''}
						</span>
						<button
							onclick={() => resetLevel(level)}
							class="font-mono text-[9px] uppercase text-(--color-muted-foreground) hover:text-(--color-fg)"
						>Reset</button>
					</div>
					<ul class="max-h-48 overflow-y-auto space-y-1 mb-2 pr-1">
						{#each nodesAtLevel as node (node.id)}
							{@const hidden = hiddenIds.has(node.id)}
							{@const selected = selectedForGroup.has(node.id)}
							<li class="flex items-center gap-2 font-mono text-[10px]">
								{#if isTerminal}
									<span
										class="px-1 text-[9px] w-7 text-center text-(--color-muted-foreground)"
										title="terminal level — filtering disabled"
									>—</span>
								{:else}
									<button
										onclick={() => toggleHidden(node.id)}
										class="border border-(--color-border) px-1 text-[9px] w-7 text-center"
										title={hidden ? 'show' : 'hide (cascades to dependent flows)'}
									>{hidden ? 'off' : 'on'}</button>
								{/if}
								<input
									type="checkbox"
									checked={selected}
									onchange={() => toggleSelected(node.id)}
									title="select for grouping"
								/>
								<span class:opacity-40={hidden} class:line-through={hidden}>
									{truncate(node.label, 26)}
								</span>
							</li>
						{/each}
					</ul>
					{#if selCount >= 2}
						<div class="flex gap-1">
							<input
								type="text"
								bind:value={groupNameDrafts[level]}
								placeholder="Group name"
								class="flex-1 border border-(--color-border) bg-(--color-bg) px-2 py-1 font-mono text-[10px] min-w-0"
							/>
							<button
								onclick={() => createGroup(level)}
								class="border-2 border-(--color-border) px-2 py-1 font-mono text-[9px] uppercase hover:bg-(--color-fg) hover:text-(--color-bg)"
							>Group {selCount}</button>
						</div>
					{/if}
					{#if customGroups.some((g) => g.level === level)}
						<div class="mt-2 space-y-1">
							{#each customGroups.filter((g) => g.level === level) as g (g.id)}
								<div class="flex items-center gap-2 font-mono text-[10px] text-(--color-accent)">
									<span class="border border-(--color-accent) px-1 text-[9px]">●</span>
									<span class="flex-1 truncate">{g.label} ({g.memberIds.size})</span>
									<button
										onclick={() => (customGroups = customGroups.filter((x) => x.id !== g.id))}
										class="text-(--color-muted-foreground) hover:text-(--color-fg)"
									>×</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Diagram viewport: centered with padding, scrolls when content overflows -->
	<div class="w-full overflow-auto px-6 py-6 sm:px-10 sm:py-8 min-h-[70vh] flex items-center justify-center border-2 border-(--color-border) bg-(--color-bg)">
		<svg
			viewBox="0 0 {width} {height}"
			preserveAspectRatio="xMidYMid meet"
			class="w-full max-w-400 h-auto font-mono text-[11px]"
		>
			<!-- Per-link gradient defs so each flow paints in its own colours -->
			<defs>
				{#each layout.links as l, i (i)}
					{@const g = linkGradientStops(l)}
					<linearGradient id={g.id} gradientUnits="userSpaceOnUse" x1={l.source.x1 ?? 0} x2={l.target.x0 ?? 0} y1="0" y2="0">
						<stop offset="0%"  stop-color={g.src} />
						<stop offset="100%" stop-color={g.dst} />
					</linearGradient>
				{/each}
			</defs>
			<g>
				{#each layout.links as l, i (i)}
					{@const g = linkGradientStops(l)}
					<path
						d={linkPath(l)}
						fill="none"
						stroke="url(#{g.id})"
						stroke-opacity={linkOpacity(l)}
						stroke-width={Math.max(1, l.width)}
						style="transition: stroke-opacity 140ms ease-out;"
					>
						<title>{l.source.label} → {l.target.label}: {l.value.toFixed(2)}</title>
					</path>
				{/each}
			</g>
			<g>
				{#each layout.nodes as n (n.id)}
					<rect
						x={n.x0}
						y={n.y0}
						width={n.x1 - n.x0}
						height={Math.max(1, n.y1 - n.y0)}
						fill={nodeFlowFill(n)}
						opacity={nodeOpacity(n)}
						role="img"
						aria-label="{n.label} ({n.level}): {n.total_price?.toFixed?.(2) ?? n.value}"
						style="cursor: pointer; transition: opacity 140ms ease-out;"
						onmouseenter={() => (hoveredId = n.id)}
						onmouseleave={() => (hoveredId = null)}
					>
						<title>{n.label} ({n.level}): {n.total_price?.toFixed?.(2) ?? n.value}</title>
					</rect>
					{#if n.y1 - n.y0 >= MIN_LABEL_H}
						<text
							x={n.x0 < width / 2 ? n.x1 + 6 : n.x0 - 6}
							y={(n.y0 + n.y1) / 2}
							dy="0.35em"
							text-anchor={n.x0 < width / 2 ? 'start' : 'end'}
							fill="var(--color-fg)"
							opacity={nodeOpacity(n)}
							style="pointer-events: none; transition: opacity 140ms ease-out;"
						>{truncate(n.label)}</text>
					{/if}
				{/each}
			</g>
		</svg>
	</div>
</div>
