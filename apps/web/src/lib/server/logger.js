/**
 * @param {string} level
 * @param {string} prefix
 * @param {string} msg
 * @param {unknown} [ctx]
 */
const fmt = (level, prefix, msg, ctx) =>
	`${new Date().toISOString()} ${level} ${prefix} ${msg}${ctx !== undefined ? ' ' + JSON.stringify(ctx) : ''}`;

export const logger = {
	/** @param {string} prefix @param {string} msg @param {unknown} [ctx] */
	info:  (prefix, msg, ctx) => console.log(fmt('INFO ', prefix, msg, ctx)),
	/** @param {string} prefix @param {string} msg @param {unknown} [ctx] */
	warn:  (prefix, msg, ctx) => console.warn(fmt('WARN ', prefix, msg, ctx)),
	/** @param {string} prefix @param {string} msg @param {unknown} [ctx] */
	error: (prefix, msg, ctx) => console.error(fmt('ERROR', prefix, msg, ctx)),
	/** @param {string} prefix @param {string} msg @param {unknown} [ctx] */
	debug: (prefix, msg, ctx) => console.debug(fmt('DEBUG', prefix, msg, ctx)),
};
