import { error } from '@sveltejs/kit';

/**
 * Guard for /api/v1/* endpoints. Throws 401 if the request is unauthenticated
 * (no valid Bearer token), 403 if the token lacks the required scope.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string} scope  e.g. 'receipts.read', 'receipts.write'
 */
export function requireScope(event, scope) {
	if (!event.locals.user) error(401, 'Unauthorized');
	if (!event.locals.tokenScopes?.has(scope)) error(403, `Missing required scope: ${scope}`);
}
