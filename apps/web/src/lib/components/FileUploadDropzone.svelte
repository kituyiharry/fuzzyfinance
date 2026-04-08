<script>
	/**
	 * @type {{
	 *   onfile:   (file: File) => void;
	 *   accept?:  string;
	 *   maxMb?:   number;
	 *   disabled?: boolean;
	 * }}
	 */
	let { onfile, accept = 'image/jpeg,image/png,image/webp,application/pdf', maxMb = 10, disabled = false } = $props();

	let isDragging = $state(false);
	let errorMsg   = $state('');

	/** @param {File} file */
	function validate(file) {
		const allowed = accept.split(',').map((s) => s.trim());
		if (!allowed.includes(file.type)) {
			errorMsg = `Unsupported type: ${file.type}`;
			return false;
		}
		if (file.size > maxMb * 1024 * 1024) {
			errorMsg = `File exceeds ${maxMb} MB limit`;
			return false;
		}
		errorMsg = '';
		return true;
	}

	/** @param {DragEvent} e */
	function onDrop(e) {
		e.preventDefault();
		isDragging = false;
		if (disabled) return;
		const file = e.dataTransfer?.files?.[0];
		if (file && validate(file)) onfile(file);
	}

	/** @param {Event} e */
	function onInput(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		const file = input.files?.[0];
		if (file && validate(file)) onfile(file);
		input.value = '';
	}

	function triggerInput() {
		if (!disabled) document.getElementById('dropzone-input')?.click();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="button"
	tabindex={disabled ? -1 : 0}
	aria-label="Upload receipt file"
	class="relative border-2 border-dashed p-10 flex flex-col items-center justify-center gap-4 transition-all select-none
		{isDragging
			? 'border-(--color-fg) bg-(--color-muted)'
			: 'border-(--color-border-subtle)'}
		{disabled
			? 'opacity-40 cursor-not-allowed'
			: 'cursor-pointer hover:border-(--color-fg) hover:bg-(--color-muted)'}"
	ondragover={(e) => { e.preventDefault(); if (!disabled) isDragging = true; }}
	ondragleave={() => (isDragging = false)}
	ondrop={onDrop}
	onkeydown={(e) => e.key === 'Enter' && triggerInput()}
	onclick={triggerInput}
>
	<input
		id="dropzone-input"
		type="file"
		{accept}
		{disabled}
		class="sr-only"
		oninput={onInput}
	/>

	<!-- Icon -->
	<div class="w-14 h-14 border-2 {isDragging ? 'border-(--color-fg)' : 'border-(--color-border-subtle)'} flex items-center justify-center transition-colors">
		{#if isDragging}
			<svg class="w-6 h-6 text-(--color-fg)" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="square" stroke-linejoin="miter" d="M19 9l-7 7-7-7"/>
			</svg>
		{:else}
			<svg class="w-6 h-6 text-(--color-muted-foreground)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="square" stroke-linejoin="miter" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
			</svg>
		{/if}
	</div>

	<div class="text-center">
		<p class="font-black uppercase tracking-widest text-xs text-(--color-fg)">
			{isDragging ? 'Drop file here' : 'Drag & drop or click to select'}
		</p>
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1 uppercase tracking-wider">
			JPEG · PNG · WEBP · PDF — max {maxMb} MB
		</p>
	</div>

	{#if errorMsg}
		<div class="flex items-center gap-2 border border-(--color-danger-border) bg-(--color-danger-muted) px-3 py-2">
			<span class="w-1.5 h-1.5 bg-(--color-danger-border) shrink-0"></span>
			<p class="font-mono text-[10px] text-(--color-danger) font-bold uppercase">{errorMsg}</p>
		</div>
	{/if}
</div>
