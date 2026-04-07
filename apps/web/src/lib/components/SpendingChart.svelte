<script>
	/**
	 * @type {{
	 *   data:   Array<{ day: string; totalAmount: number; receiptCount: number }>;
	 *   label?: string;
	 *   class?: string;
	 * }}
	 */
	let { data, label = 'SPENDING', class: className = '' } = $props();

	/** @type {7 | 30} */
	let window = $state(7);

	const viewW  = 700;
	const viewH  = 130;
	const padL   = 0;
	const padB   = 28; // room for x-axis labels
	const chartH = viewH - padB;

	let sliced = $derived(data.slice(-window));

	let maxAmount = $derived(Math.max(...sliced.map((d) => d.totalAmount), 0.01));

	let bars = $derived(
		sliced.map((d, i) => {
			const barW   = (viewW - padL) / sliced.length;
			const gap    = Math.max(barW * 0.15, 2);
			const x      = padL + i * barW + gap / 2;
			const w      = barW - gap;
			const pct    = d.totalAmount / maxAmount;
			const h      = Math.max(pct * (chartH - 4), d.totalAmount > 0 ? 2 : 0);
			const y      = chartH - h;
			return { x, y, w, h, day: d.day, totalAmount: d.totalAmount, receiptCount: d.receiptCount };
		})
	);

	/** @param {number} n */
	const fmt = (n) => {
		if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
		return `$${n.toFixed(2)}`;
	};

	/** @param {string} day YYYY-MM-DD */
	const shortDay = (day) => {
		if (!day) return '';
		const [, m, d] = day.split('-');
		return `${m}/${d}`;
	};

	// Decide how many x-labels to show so they don't overlap
	let labelStep = $derived(sliced.length <= 7 ? 1 : Math.ceil(sliced.length / 7));

	/** @type {number | null} */
	let hoveredIdx = $state(null);
</script>

<div class="flex flex-col gap-3 {className}">
	<!-- Controls -->
	<div class="flex items-center justify-between">
		<span class="font-mono text-[9px] uppercase tracking-widest text-(--color-muted-foreground) font-bold">
			{label}
		</span>
		<div class="flex gap-1">
			{#each ([7, 30]) as w (w)}
				<button
					onclick={() => (window = /** @type {7|30} */ (w))}
					class="font-mono text-[9px] uppercase font-black px-2 py-1 border {window === w ? 'border-(--color-fg) bg-(--nav-active-bg) text-(--nav-active-fg)' : 'border-(--color-border) text-(--color-muted-foreground) hover:border-(--color-fg)'} transition-all"
				>
					{w}D
				</button>
			{/each}
		</div>
	</div>

	{#if sliced.length === 0 || maxAmount <= 0.01}
		<div class="h-24 flex items-center justify-center border-2 border-(--color-border) border-dashed">
			<span class="font-mono text-[10px] uppercase text-(--color-muted-foreground)">
				NO SPENDING DATA FOR THIS PERIOD
			</span>
		</div>
	{:else}
		<!-- Tooltip -->
		{#if hoveredIdx !== null && bars[hoveredIdx]}
			{@const b = bars[hoveredIdx]}
			<div class="flex gap-6 font-mono text-[10px] text-(--color-fg) border-b border-(--color-border) pb-2">
				<span>{b.day}</span>
				<span class="font-black">{fmt(b.totalAmount)}</span>
				<span class="text-(--color-muted-foreground)">{b.receiptCount} receipt{b.receiptCount === 1 ? '' : 's'}</span>
			</div>
		{:else}
			<div class="h-[22px]"></div>
		{/if}

		<!-- SVG chart -->
		<svg
			viewBox="0 0 {viewW} {viewH}"
			class="w-full overflow-visible"
			role="img"
			aria-label="{label} bar chart"
		>
			<!-- Baseline -->
			<line
				x1={padL} y1={chartH}
				x2={viewW} y2={chartH}
				stroke="var(--color-border)"
				stroke-width="1"
			/>

			<!-- Bars -->
			{#each bars as bar, i (bar.day)}
				<rect
					x={bar.x}
					y={bar.y}
					width={bar.w}
					height={bar.h}
					fill={hoveredIdx === i ? 'var(--color-accent, var(--color-fg))' : 'var(--color-fg)'}
					opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1}
					class="transition-opacity duration-100 cursor-pointer"
					onmouseenter={() => (hoveredIdx = i)}
					onmouseleave={() => (hoveredIdx = null)}
					role="presentation"
				/>

				<!-- X-axis label -->
				{#if i % labelStep === 0}
					<text
						x={bar.x + bar.w / 2}
						y={viewH - 4}
						text-anchor="middle"
						font-family="monospace"
						font-size="9"
						fill="var(--color-muted-foreground)"
					>
						{shortDay(bar.day)}
					</text>
				{/if}
			{/each}
		</svg>
	{/if}
</div>
