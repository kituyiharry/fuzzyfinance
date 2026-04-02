<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<header class="border-b-4 border-black bg-white px-8 py-4">
	<div class="mx-auto flex max-w-7xl items-center justify-between">
		<div class="text-2xl font-black tracking-tighter uppercase">
			<a href={resolve('/')} class="no-underline hover:bg-transparent hover:text-black">
				FuzzyFinance<span class="bg-black px-1 text-white">.xlsx</span>
			</a>
		</div>

		<nav>
			<ul class="flex gap-8">
				<li class="relative">
					<a
						href={resolve('/')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname ===
						'/'
							? 'bg-black px-2 py-1 text-white'
							: ''}"
					>
						Home
					</a>
				</li>
				<li>
					<a
						href={resolve('/about')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname ===
						'/about'
							? 'bg-black px-2 py-1 text-white'
							: ''}"
					>
						About
					</a>
				</li>
				<li>
					<a
						href={resolve('/sverdle')}
						class="text-xs font-bold tracking-widest uppercase no-underline {page.url.pathname.startsWith(
							'/sverdle'
						)
							? 'bg-black px-2 py-1 text-white'
							: ''}"
					>
						Sverdle
					</a>
				</li>
			</ul>
		</nav>
	</div>
</header>

<style>
	a {
		transition: all 0.1s ease-in-out;
	}
</style>
