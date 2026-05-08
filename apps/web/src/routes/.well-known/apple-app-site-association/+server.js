import { json } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET() {
	return json({
		webcredentials: {
			apps: ['X9338M5DGF.app.fuzzies']
		}
	});
}
