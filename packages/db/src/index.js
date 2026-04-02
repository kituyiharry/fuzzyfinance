export * as schema from './schema.js';
export * as dto    from './dto.js';
export * as repo   from './repo.js';

/**
 *  @template T
 *  @typedef {{ some: true, value: T } | { some: false }} Option
 **/

/**
 *@template T
 *@template E
 *@typedef {{ value: T, ok: true } | { ok: false, error: E }} Result
 **/

// Helper constructors (optional but convenient)

/** @template T @param {T} value @returns {Option<T>} */
export const Some = (value) => ({ some: true, value });

/** @returns {Option<never>} */
export const None = () => ({ some: false });

/** @template T @param {T} value @returns {Result<T, never>} */
export const Ok = (value) => ({ ok: true, value });

/** @template E @param {E} error @returns {Result<never, E>} */
export const Err = (error) => ({ ok: false, error });
