<script>
	import { line, curveCatmullRom } from 'd3-shape';
	import { scaleLinear, scalePoint } from 'd3-scale';
	import { SvelteSet } from 'svelte/reactivity';

	/**
	 * @typedef {{ key: string; label: string; points: number[]; total: number }} TrendSeries
	 * @typedef {{ bucket_kind: 'day' | 'month' | 'quarter'; buckets: string[]; primary_series: TrendSeries[]; secondary_series: TrendSeries[] }} TrendlineData
	 */

	/**
	 * @type {{
	 *   data: TrendlineData;
	 *   width?: number;
	 *   height?: number;
	 *   topN?: number;
	 * }}
	 */
	let { data, width = 1100, height = 480, topN = 8 } = $props();

	const margin = { top: 20, right: 220, bottom: 48, left: 64 };

	/** @type {'primary' | 'secondary'} */
	let level = $state('primary');

	const allSeries = $derived(level === 'primary' ? data.primary_series : data.secondary_series);

	const series = $derived(
		(allSeries ?? []).slice(0, topN === 0 ? undefined : topN),
	);

	/** Hidden series keys — toggled by clicking the legend. */
	const hiddenKeys = new SvelteSet();

	const visibleSeries = $derived(series.filter((s) => !hiddenKeys.has(s.key)));

	const xScale = $derived.by(() => {
		return scalePoint()
			.domain(data.buckets)
			.range([margin.left, width - margin.right])
			.padding(0.5);
	});

	const yMax = $derived(
		Math.max(1, ...visibleSeries.flatMap((s) => s.points)),
	);

	const yScale = $derived.by(() => {
		return scaleLinear()
			.domain([0, yMax])
			.nice()
			.range([height - margin.bottom, margin.top]);
	});

	const lineGen = $derived(
		line()
			.x((/** @type {any} */ d) => xScale(d.bucket) ?? 0)
			.y((/** @type {any} */ d) => yScale(d.value))
			.curve(curveCatmullRom.alpha(0.5)),
	);

	const PALETTE = [
		'#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261',
		'#7209b7', '#06d6a0', '#118ab2', '#ef476f', '#073b4c',
		'#fb8500', '#8338ec',
	];

	/** @param {number} i */
	function colorAt(i) {
		return PALETTE[i % PALETTE.length];
	}

	/**
	 * Decimate bucket labels so they don't overlap when there are many buckets.
	 * @param {string[]} buckets
	 */
	function labelStride(buckets) {
		const target = 14;
		return Math.max(1, Math.ceil(buckets.length / target));
	}

	const stride = $derived(labelStride(data.buckets));

	const yTicks = $derived(yScale.ticks(5));

	/** @param {number} v */
	const fmtY = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);

	/** @param {TrendSeries} s */
	function pathFor(s) {
		const pts = s.points.map((value, i) => ({ bucket: data.buckets[i], value }));
		return lineGen(pts) ?? '';
	}

	function toggleHidden(/** @type {string} */ key) {
		if (hiddenKeys.has(key)) hiddenKeys.delete(key);
		else hiddenKeys.add(key);
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Controls -->
	<div class="flex items-center gap-3 border-b-2 border-(--color-border) pb-2 flex-wrap">
		<div class="flex border-2 border-(--color-border)">
			<button
				onclick={() => (level = 'primary')}
				class="px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors {level === 'primary' ? 'bg-(--color-fg) text-(--color-bg)' : 'hover:bg-(--color-muted)'}"
			>Primary</button>
			<button
				onclick={() => (level = 'secondary')}
				class="px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors border-l-2 border-(--color-border) {level === 'secondary' ? 'bg-(--color-fg) text-(--color-bg)' : 'hover:bg-(--color-muted)'}"
			>Secondary</button>
		</div>
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
			{visibleSeries.length} / {(allSeries ?? []).length} series · {data.buckets.length} {data.bucket_kind} bucket{data.buckets.length === 1 ? '' : 's'}
		</span>
		<span class="ml-auto font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground)">
			Catmull–Rom α=0.5 · click legend to hide series
		</span>
	</div>

	<!-- Chart -->
	{#if data.buckets.length === 0 || series.length === 0}
		<p class="font-mono text-[11px] text-(--color-muted-foreground) py-8 text-center">
			Not enough data for a trendline at this level.
		</p>
	{:else}
		<div class="border-2 border-(--color-border) bg-(--color-bg) p-2 overflow-x-auto">
			<svg viewBox="0 0 {width} {height}" class="w-full h-auto font-mono text-[10px]">
				<!-- Y grid + ticks -->
				<g>
					{#each yTicks as t (t)}
						<line
							x1={margin.left}
							x2={width - margin.right}
							y1={yScale(t)}
							y2={yScale(t)}
							stroke="var(--color-border)"
							stroke-opacity="0.5"
						/>
						<text
							x={margin.left - 6}
							y={yScale(t)}
							dy="0.32em"
							text-anchor="end"
							fill="var(--color-muted-foreground)"
						>{fmtY(t)}</text>
					{/each}
				</g>

				<!-- X axis labels (decimated) -->
				<g>
					{#each data.buckets as b, i (b)}
						{#if i % stride === 0 || i === data.buckets.length - 1}
							<text
								x={xScale(b) ?? 0}
								y={height - margin.bottom + 14}
								text-anchor="middle"
								fill="var(--color-muted-foreground)"
							>{b}</text>
						{/if}
					{/each}
				</g>

				<!-- Series paths -->
				<g>
					{#each visibleSeries as s, i (s.key)}
						<path
							d={pathFor(s)}
							fill="none"
							stroke={colorAt(series.findIndex((x) => x.key === s.key))}
							stroke-width="1.75"
							stroke-linejoin="round"
							stroke-linecap="round"
						>
							<title>{s.label}: total {s.total.toFixed(2)}</title>
						</path>
					{/each}
				</g>

				<!-- Series endpoints (small dots on last bucket for visual anchor) -->
				<g>
					{#each visibleSeries as s (s.key)}
						{@const lastIdx = data.buckets.length - 1}
						<circle
							cx={xScale(data.buckets[lastIdx]) ?? 0}
							cy={yScale(s.points[lastIdx])}
							r="2.5"
							fill={colorAt(series.findIndex((x) => x.key === s.key))}
						/>
					{/each}
				</g>
			</svg>
		</div>

		<!-- Legend -->
		<div class="flex flex-wrap gap-x-3 gap-y-1.5">
			{#each series as s, i (s.key)}
				{@const hidden = hiddenKeys.has(s.key)}
				<button
					onclick={() => toggleHidden(s.key)}
					class="flex items-center gap-1.5 font-mono text-[10px] hover:opacity-100 transition-opacity"
					class:opacity-40={hidden}
					title={hidden ? 'show' : 'hide'}
				>
					<span
						class="inline-block w-3 h-3 border border-(--color-border)"
						style="background: {colorAt(i)};"
					></span>
					<span class:line-through={hidden}>{s.label}</span>
					<span class="text-(--color-muted-foreground)">{s.total.toFixed(0)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
