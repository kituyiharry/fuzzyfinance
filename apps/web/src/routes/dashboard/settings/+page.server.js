import { redirect } from '@sveltejs/kit';

/** @type import("./$types").PageServerLoad */
export const load = async ({ locals }) => {
	if (!locals.user) redirect(302, '/');
	return {
		user: locals.user,
		session: locals.session,
	};
};
