import { redirect } from '@sveltejs/kit';
import { getDashboardMetrics } from '$lib/server/dashboard-metrics';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!locals.user) redirect(302, '/');

	const metrics = await getDashboardMetrics(locals.user.id);

	return metrics;
}
