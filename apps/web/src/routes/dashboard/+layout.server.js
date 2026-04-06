/** @type import("./$types").LayoutServerLoad */ export const load = async ({ locals }) => {
        return {
        user: locals.user,
        session: locals.session,
    };
};
