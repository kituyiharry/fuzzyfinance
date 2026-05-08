import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	return json({
		apiLevel: 'v1',
		features: {
			salesSearch: true,
			exports: true,
			passkeys: true
		}
	});
}
