<script>
	/**
	 * @type {{
	 *   onfile: (file: File) => void;
	 *   accept?: string;
	 *   maxMb?: number;
	 *   disabled?: boolean;
	 * }}
	 */
	let { onfile, accept = 'image/jpeg,image/png,image/webp,application/pdf', maxMb = 10, disabled = false } = $props();

	let isDragging  = $state(false);
	let errorMsg    = $state('');

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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="button"
	tabindex={disabled ? -1 : 0}
	aria-label="Upload receipt file"
	class="relative border-2 border-dashed {isDragging ? 'border-(--color-fg) bg-(--nav-active-bg)' : 'border-(--color-border)'} p-10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer {disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-(--color-fg)'}"
	ondragover={(e) => { e.preventDefault(); isDragging = true; }}
	ondragleave={() => (isDragging = false)}
	ondrop={onDrop}
	onkeydown={(e) => e.key === 'Enter' && !disabled && document.getElementById('dropzone-input')?.click()}
	onclick={() => !disabled && document.getElementById('dropzone-input')?.click()}
>
	<input
		id="dropzone-input"
		type="file"
		{accept}
		{disabled}
		class="sr-only"
		oninput={onInput}
	/>

	<div class="w-12 h-12 border-2 border-(--color-border) flex items-center justify-center font-black text-lg text-(--color-muted-foreground)">
		+
	</div>

	<div class="text-center">
		<p class="font-black uppercase tracking-widest text-xs text-(--color-fg)">
			{isDragging ? 'DROP FILE HERE' : 'DRAG & DROP OR CLICK TO SELECT'}
		</p>
		<p class="font-mono text-[10px] text-(--color-muted-foreground) mt-1">
			JPEG · PNG · WEBP · PDF — max {maxMb} MB
		</p>
	</div>

	{#if errorMsg}
		<p class="font-mono text-[10px] text-red-600 font-bold uppercase">{errorMsg}</p>
	{/if}
</div>
