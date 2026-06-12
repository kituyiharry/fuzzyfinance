/**
 * Combined category catalogue: the built-in JSON merged with any
 * user-defined entries stored on the workspace.
 *
 * Built-in shape (apps/web/src/lib/server/categories.json):
 *   [{ primary: string, secondary: string[] }]
 *
 * Workspace custom shape (workspace.customCategoriesJson):
 *   { primary: string[], secondary: Record<string, string[]> }
 *
 * The merged result is what the refinement UI's category picker
 * renders. `custom: true` marks entries the user added themselves
 * so the UI can badge / allow removal of them.
 */

import builtin from './categories.json';

/**
 * @typedef {{ primary: string, secondary: string[], custom: boolean }} CategoryEntry
 */

/**
 * @param {{ customCategoriesJson?: string | null } | null | undefined} workspace
 * @returns {CategoryEntry[]}
 */
export function loadCategoriesForWorkspace(workspace) {
	const custom = _parseCustom(workspace?.customCategoriesJson);

	/** @type {CategoryEntry[]} */
	const out = builtin.map((c) => ({
		primary:   c.primary,
		secondary: [...c.secondary, ...((custom.secondary[c.primary]) ?? [])],
		custom:    false
	}));

	for (const p of custom.primary) {
		if (!out.find((m) => m.primary === p)) {
			out.push({
				primary:   p,
				secondary: custom.secondary[p] ?? [],
				custom:    true
			});
		}
	}
	return out;
}

/**
 * Reads the raw custom-categories JSON for a workspace (no merge).
 * Used by add/remove endpoints when mutating.
 *
 * @param {string | null | undefined} raw
 * @returns {{ primary: string[], secondary: Record<string, string[]> }}
 */
export function _parseCustom(raw) {
	if (!raw) return { primary: [], secondary: {} };
	try {
		const v = JSON.parse(raw);
		return {
			primary:   Array.isArray(v?.primary)      ? v.primary.filter((/** @type {any} */ x) => typeof x === 'string') : [],
			secondary: (v?.secondary && typeof v.secondary === 'object') ? v.secondary : {}
		};
	} catch {
		return { primary: [], secondary: {} };
	}
}

/**
 * Compact a custom-categories object so empty arrays and duplicate
 * entries don't survive round-trips.
 *
 * @param {{ primary: string[], secondary: Record<string, string[]> }} c
 */
export function _normaliseCustom(c) {
	const primary = Array.from(new Set(c.primary.map((p) => p.trim()).filter(Boolean)));
	/** @type {Record<string, string[]>} */
	const secondary = {};
	for (const [k, vs] of Object.entries(c.secondary)) {
		const cleaned = Array.from(new Set((vs ?? []).map((s) => String(s).trim()).filter(Boolean)));
		if (cleaned.length > 0) secondary[k] = cleaned;
	}
	return { primary, secondary };
}
