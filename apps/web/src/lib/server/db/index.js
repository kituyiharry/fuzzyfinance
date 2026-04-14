import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@fuzzyfinance/db';

/** @type {AsyncLocalStorage<import('drizzle-orm/d1').DrizzleD1Database<typeof schema>>} */
const store = new AsyncLocalStorage();

/**
 * Binds a D1 database to the current async context and runs fn() within it.
 * Call this once per request in hooks.server.js. All code downstream —
 * including ctx.waitUntil() callbacks — inherits this context automatically.
 *
 * @param {any} d1 - D1Database binding from platform.env.DB
 * @param {() => any} fn
 */
export const runWithDb = (d1, fn) => {
	if (!d1) {
		// Build time or missing binding — db operations will throw at call site
		return fn();
	}
	return store.run(drizzle(d1, { schema }), fn);
};

/**
 * A proxy that forwards every property access to the drizzle D1 instance
 * bound to the current async context. Works in route handlers, server load
 * functions, and waitUntil() background tasks without any extra wiring.
 *
 * @type {import('drizzle-orm/d1').DrizzleD1Database<typeof schema>}
 */
export const db = /** @type {any} */ (
	new Proxy(/** @type {any} */ ({}), {
		get(_, prop) {
			const instance = store.getStore();
			if (!instance) {
				throw new Error(
					`[db] No D1 database in the current async context. ` +
					`Ensure runWithDb() is called in hooks.server.js before any DB access.`
				);
			}
			const value = /** @type {any} */ (instance)[prop];
			return typeof value === 'function' ? value.bind(instance) : value;
		}
	})
);
