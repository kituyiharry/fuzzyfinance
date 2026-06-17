// NOTE: Changing any of these requires that updates be made to the Unit types
// in hedaz-libs as well to prevent misclassification during analysis
/**
 * Canonical unit type -> aliases (all lowercase).
 * Lookup is case-insensitive: normalizeUnitType('KG') === 'kg'.
 * Unknown inputs pass through trimmed and unchanged.
 */
const UNIT_MAP = {
	// ── Weight ───────────────────────────────────────────────────────────
	'kg':  ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
	'g':   ['g', 'gm', 'gms', 'gram', 'grams'],
	'mg':  ['mg', 'milligram', 'milligrams'],
	'lb':  ['lb', 'lbs', 'pound', 'pounds'],
	'oz':  ['oz', 'ounce', 'ounces'],
	't':   ['t', 'ton', 'tons', 'tonne', 'tonnes'],

	// ── Volume ───────────────────────────────────────────────────────────
	'L':   ['l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'],
	'ml':  ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
	'cl':  ['cl', 'centilitre', 'centilitres', 'centiliter', 'centiliters'],
	'fl oz': ['fl oz', 'fl.oz', 'floz', 'fluid oz', 'fluid ounce', 'fluid ounces'],

	// ── Count / Pack ─────────────────────────────────────────────────────
	'pk':   ['pk', 'pks', 'pack', 'packs'],
	'ct':   ['ct', 'count', 'counts'],
	'pcs':  ['pcs', 'pc', 'piece', 'pieces'],
	'ea':   ['ea', 'each'],
	'box':  ['box', 'boxes', 'bx'],
	'doz':  ['doz', 'dozen', 'dozens', 'dz'],
	'roll': ['roll', 'rolls'],
	'bag':  ['bag', 'bags'],
	'can':  ['can', 'cans'],
	'btl':  ['btl', 'btls', 'bottle', 'bottles'],
	'sht':  ['sht', 'sheet', 'sheets'],
	'pair': ['pair', 'pairs', 'pr'],

	// ── Length ───────────────────────────────────────────────────────────
	'm':   ['m', 'meter', 'meters', 'metre', 'metres'],
	'cm':  ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
	'mm':  ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
	'km':  ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
	'ft':  ['ft', 'foot', 'feet'],
	'in':  ['in', 'inch', 'inches'],
	'yd':  ['yd', 'yds', 'yard', 'yards'],

	// ── Area ─────────────────────────────────────────────────────────────
	'sqm': ['sqm', 'sq m', 'sq.m', 'm2', 'square meter', 'square meters', 'square metre', 'square metres'],
	'sqft': ['sqft', 'sq ft', 'sq.ft', 'ft2', 'square foot', 'square feet'],
};

/**
 * Canonical unit types grouped for UI selects.
 * Each entry is a group label + the canonical abbreviations that belong to it.
 */
export const UNIT_TYPES = [
	{ group: 'Weight',       types: ['kg', 'g', 'mg', 'lb', 'oz', 't'] },
	{ group: 'Volume',       types: ['L', 'ml', 'cl', 'fl oz'] },
	{ group: 'Count / Pack', types: ['pk', 'ct', 'pcs', 'ea', 'box', 'doz', 'roll', 'bag', 'can', 'btl', 'sht', 'pair'] },
	{ group: 'Length',       types: ['m', 'cm', 'mm', 'km', 'ft', 'in', 'yd'] },
	{ group: 'Area',         types: ['sqm', 'sqft'] },
];

/** @type {Map<string, string>} */
const _lookup = new Map();
for (const [canonical, aliases] of Object.entries(UNIT_MAP)) {
	for (const alias of aliases) {
		_lookup.set(alias, canonical);
	}
}

/**
 * Normalizes a raw unit type string to its canonical abbreviation.
 * Case-insensitive. Unknown values are returned trimmed and unchanged.
 *
 * @param {string | null | undefined} raw
 * @returns {string | null | undefined}
 */
export function normalizeUnitType(raw) {
	if (!raw) return raw;
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;
	return _lookup.get(trimmed.toLowerCase()) ?? trimmed;
}

/**
 * Heuristic unit extraction from a product description.
 *
 * Scans for `<number><optional space><unit>` patterns and returns the
 * first match whose unit token is in the alias table. Used as a fallback
 * when Gemini didn't classify the line (embeddings-only hits, or when
 * the user manually fills a category but not a size). Returns null when
 * no recognised unit appears in the text.
 *
 * Examples:
 *   "FullCream Milk 2L"          → { size: "2",     type: "L"  }
 *   "Tangold Seedless 0.784 kg"  → { size: "0.784", type: "kg" }
 *   "Flushable Wipe 40pk"        → { size: "40",    type: "pk" }
 *   "Random thing"               → null
 *
 * @param {string | null | undefined} description
 * @returns {{ size: string, type: string } | null}
 */
export function extractUnitsFromDescription(description) {
	if (!description) return null;
	// Number (allowing decimals with `.` or `,`) followed by an optional
	// space and a 1-8 letter unit word. Globally iterated so multiple
	// matches can be evaluated; the first known unit wins.
	const re = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{1,8})/g;
	let match;
	while ((match = re.exec(description)) !== null) {
		const raw = match[2].toLowerCase();
		const canonical = _lookup.get(raw);
		if (!canonical) continue;
		return { size: match[1].replace(',', '.'), type: canonical };
	}
	return null;
}
