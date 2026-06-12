/**
 * Refinement helpers — shared by the PATCH/PUT endpoints for receipt and
 * sale. Keeps the Xero-lock rule and the totals-balance check in one place.
 */

/**
 * Documents pulled from an upstream accounting tool have their header
 * totals locked: the user can refine line items + categories but cannot
 * override the integration's source-of-truth amounts.
 *
 * @param {string | null | undefined} externalSource
 */
export function isExternallySourced(externalSource) {
	if (!externalSource) return false;
	// 'xero-...', and future 'qb-...', 'myob-...' all share the lock rule.
	return /^(xero|qb|myob|freshbooks)-/i.test(externalSource);
}

/**
 * Cents-level tolerance — floating-point sums of decimal-string line
 * amounts often miss by ≤ ½¢. 1 cent absolute tolerance is comfortable
 * for human-typed totals.
 */
const BALANCE_EPSILON = 0.01;

/**
 * @typedef {object} LineItemForBalance
 * @property {string | number | null | undefined} total
 * @property {'standard' | 'tax'} kind
 */

/**
 * Asserts that `sum(lineItems[].total) ≈ expectedTotal`. Used after the
 * caller validates per-line shape so the user can see "off by $X" rather
 * than a generic 400.
 *
 * Null / empty-string `expectedTotal` is treated as "no header total
 * recorded" and the check is skipped — common for legacy / partial Xero
 * syncs that landed the line items but not the header amounts. The
 * caller's tax-lock check still defends against silent tax-amount
 * changes for those docs.
 *
 * @param {LineItemForBalance[]} lineItems
 * @param {string | number | null | undefined} expectedTotal
 * @returns {{ ok: true } | { ok: false, message: string, sum: number, expected: number }}
 */
export function checkLineItemsBalance(lineItems, expectedTotal) {
	if (expectedTotal == null || expectedTotal === '') return { ok: true };
	const expected = Number(expectedTotal);
	if (!Number.isFinite(expected)) return { ok: true };
	let sum = 0;
	for (const li of lineItems) {
		const n = Number(li.total);
		if (Number.isFinite(n)) sum += n;
	}
	const delta = Math.abs(sum - expected);
	if (delta > BALANCE_EPSILON) {
		return {
			ok:       false,
			sum,
			expected,
			message:  `Line items sum to ${sum.toFixed(2)}, expected ${expected.toFixed(2)} (off by ${(sum - expected).toFixed(2)})`
		};
	}
	return { ok: true };
}

/**
 * Tax-amount preservation guard for externally-sourced docs.
 *
 * Invariant: **`sum(incoming tax lines) === sum(existing tax lines)`** —
 * but only when there ARE existing tax lines to preserve. When the DB
 * has no `kind='tax'` rows, the user is free to add or omit tax lines;
 * the standard balance check (sum of all line items must equal the
 * header total) catches any header-vs-lines mismatch downstream.
 *
 * Distribution across one or many `kind='tax'` rows is the user's
 * choice — only the sum is policed. The receipt PATCH endpoint already
 * locks `receipt.tax` separately, so it doesn't need to be re-checked
 * here.
 *
 * `expectedTaxTotal` is accepted for backwards-compat with earlier
 * callers but is no longer consulted; the existing tax rows ARE the
 * canonical authority.
 *
 * @param {Array<{ id?: string | null, total: string | number | null | undefined, kind: 'standard' | 'tax' }>} incoming
 * @param {string | number | null | undefined} _expectedTaxTotal
 * @param {Array<{ id: string, total: string | null, kind: string }>} [existingTaxLines]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkTaxAmountUntouched(incoming, _expectedTaxTotal, existingTaxLines = []) {
	let existingSum = 0;
	for (const tl of existingTaxLines) {
		const n = Number(tl.total);
		if (Number.isFinite(n)) existingSum += n;
	}

	// No prior tax to defend — user can introduce or omit tax rows freely.
	if (existingSum <= BALANCE_EPSILON) return { ok: true };

	let incomingSum = 0;
	for (const li of incoming) {
		if (li.kind !== 'tax') continue;
		const n = Number(li.total);
		if (Number.isFinite(n)) incomingSum += n;
	}

	if (Math.abs(incomingSum - existingSum) > BALANCE_EPSILON) {
		return {
			ok:      false,
			message: `Tax line totals must sum to ${existingSum.toFixed(2)} (got ${incomingSum.toFixed(2)})`
		};
	}
	return { ok: true };
}

/**
 * @deprecated Use `checkTaxAmountUntouched`. Kept temporarily to avoid
 * breaking any other importer; remove once nothing references it.
 *
 * @param {Array<{ id?: string | null, total: string | number | null | undefined, kind: 'standard' | 'tax' }>} incoming
 * @param {Array<{ id: string, total: string | null, kind: string }>} existingTaxLines
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkTaxLinesUntouched(incoming, existingTaxLines) {
	let expected = 0;
	for (const tl of existingTaxLines) {
		const n = Number(tl.total);
		if (Number.isFinite(n)) expected += n;
	}
	return checkTaxAmountUntouched(incoming, expected, existingTaxLines);
}
