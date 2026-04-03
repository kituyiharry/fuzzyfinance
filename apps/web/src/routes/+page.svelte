<script>
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import { authClient } from '$lib/auth-client';

	const loginWithGoogle = async () => {
		await authClient.signIn.social({
			provider: 'google',
			callbackURL: '/dashboard'
		});
	};
</script>

<svelte:head>
	<title>Login | FuzzyFinance</title>
</svelte:head>

<div
	class="flex flex-1 items-center min-w-xs justify-center bg-[#f3f4f6] p-8"
>
	<Card class="w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" title="System Authentication">
		<div class="mb-8 flex flex-col gap-4">
			<p class="text-sm font-mono italic text-gray-600">
				PLEASE PROVIDE GOOGLE CREDENTIALS TO ACCESS FUZZYFINANCE SPREADSHEET ENGINE V1.0
			</p>
			<div class="h-0.5 w-full bg-black/10"></div>
		</div>

		<div class="flex flex-col gap-6">
			<Button onclick={loginWithGoogle} variant="primary" class="flex items-center justify-center gap-3 py-4 text-lg">
				<svg class="h-5 w-5 fill-white" viewBox="0 0 24 24">
					<path
						d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.162-1.9 4.162-1.228 1.228-3.14 2.56-6.42 2.56-5.14 0-9.2-4.16-9.2-9.2s4.06-9.2 9.2-9.2c2.78 0 4.86 1.08 6.36 2.52l2.308-2.308C18.6 1.08 15.86 0 12.48 0 6.2 0 1.1 5.1 1.1 11.3s5.1 11.3 11.3 11.3c3.42 0 6.02-1.12 8.04-3.2 2.08-2.08 2.74-4.98 2.74-7.34 0-.72-.06-1.42-.18-2.06H12.48z"
					/>
				</svg>
				Sign in with Google
			</Button>

			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2">
					<div class="h-px flex-1 bg-black/20"></div>
					<span class="text-[10px] font-bold text-gray-400">OR</span>
					<div class="h-px flex-1 bg-black/20"></div>
				</div>
				<p class="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
					Corporate SSO Mandatory for all personnel
				</p>
			</div>

			<div class="mt-4 flex flex-col gap-2">
				<div class="flex items-center justify-between text-[10px] font-black uppercase text-gray-500">
					<span>STATUS: STANDBY</span>
					<span>IP: 127.0.0.1</span>
				</div>
				<div class="h-1 w-full bg-gray-200">
					<div class="h-full w-1/3 bg-black"></div>
				</div>
			</div>
		</div>
	</Card>
</div>

<style>
	:global(body) {
		display: flex;
		flex-direction: column;
	}
</style>
