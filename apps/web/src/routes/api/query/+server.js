import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { inArray, sql } from 'drizzle-orm';
import { searchReceipts } from '$lib/server/vectorize';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { getGeminiAccessToken } from '$lib/server/token-refresh';

const SYSTEM_PROMPT = `You are FuzzyFinance's financial assistant. You help users understand their receipt and spending data. Be concise — answer in 1–4 sentences unless a list or breakdown is specifically requested. You are given two types of data: (1) a spending summary with aggregated totals across all receipts, and (2) individual receipts most relevant to the query. Use the spending summary to answer aggregation questions (totals, most/least, averages, breakdowns). Use individual receipts to answer specific lookup questions. Do not fabricate receipts, merchants, or amounts.`;

/**
 * Pulls aggregate spending data directly from the DB so the LLM can answer
 * questions like "which merchant do I spend the most with" accurately.
 *
 * @param {string} userId
 */
async function getSpendingSummary(userId) {
	const [merchants, categories, monthly] = await Promise.all([
		db.all(sql`
			SELECT merchant_name AS merchant,
			       ROUND(SUM(CAST(total AS REAL)), 2) AS totalSpend,
			       COUNT(*) AS receiptCount
			FROM receipt
			WHERE user_id = ${userId}
			  AND status IN ('complete', 'complete_no_sync', 'staged')
			  AND total IS NOT NULL
			  AND merchant_name IS NOT NULL
			GROUP BY merchant_name
			ORDER BY totalSpend DESC
			LIMIT 15
		`),
		db.all(sql`
			SELECT category,
			       ROUND(SUM(CAST(total AS REAL)), 2) AS totalSpend,
			       COUNT(*) AS receiptCount
			FROM receipt
			WHERE user_id = ${userId}
			  AND status IN ('complete', 'complete_no_sync', 'staged')
			  AND total IS NOT NULL
			  AND category IS NOT NULL
			GROUP BY category
			ORDER BY totalSpend DESC
		`),
		db.all(sql`
			SELECT strftime('%Y-%m', datetime(receipt_date / 1000, 'unixepoch')) AS month,
			       ROUND(SUM(CAST(total AS REAL)), 2) AS totalSpend,
			       COUNT(*) AS receiptCount
			FROM receipt
			WHERE user_id = ${userId}
			  AND status IN ('complete', 'complete_no_sync', 'staged')
			  AND total IS NOT NULL
			  AND receipt_date IS NOT NULL
			GROUP BY month
			ORDER BY month DESC
			LIMIT 12
		`)
	]);

	/** @type {any[]} */ const merchantRows  = merchants;
	/** @type {any[]} */ const categoryRows = categories;
	/** @type {any[]} */ const monthlyRows  = monthly;

	const lines = [];

	if (merchantRows.length) {
		lines.push('Top merchants by total spend:');
		for (const r of merchantRows) {
			lines.push(`  • ${r.merchant}: ${r.totalSpend} (${r.receiptCount} receipt${r.receiptCount === 1 ? '' : 's'})`);
		}
	}

	if (categoryRows.length) {
		lines.push('Spend by category:');
		for (const r of categoryRows) {
			lines.push(`  • ${r.category}: ${r.totalSpend} (${r.receiptCount} receipt${r.receiptCount === 1 ? '' : 's'})`);
		}
	}

	if (monthlyRows.length) {
		lines.push('Monthly spend (most recent first):');
		for (const r of monthlyRows) {
			lines.push(`  • ${r.month}: ${r.totalSpend} (${r.receiptCount} receipt${r.receiptCount === 1 ? '' : 's'})`);
		}
	}

	return lines.length ? lines.join('\n') : 'No spending data available yet.';
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env?.VECTORIZE || !platform?.env?.AI) error(503, 'Search service unavailable');

	const body = await request.json();
	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if (!query) error(400, 'Missing query');

	/** @type {Array<{ role: string; content: string }>} */
	const history = Array.isArray(body?.history) ? body.history.slice(-10) : []; // cap history at 10 turns

	// ── Fetch spending summary + semantic search in parallel ──────────
	const [matches, spendingSummary] = await Promise.all([
		searchReceipts(platform.env, locals.user.id, query, 8),
		getSpendingSummary(locals.user.id)
	]);

	let receiptContext = 'No individual receipts matched this query.';
	let contextCount = 0;

	if (matches.length) {
		const ids = matches.map((m) => m.id);
		const rows = await db.select().from(schema.receipt).where(inArray(schema.receipt.id, ids));

		// Sort by similarity score
		const scored = rows
			.map((r) => ({ ...r, score: matches.find((m) => m.id === r.id)?.score ?? 0 }))
			.sort((a, b) => b.score - a.score);

		contextCount = scored.length;
		receiptContext = scored.map((r) => {
			const date = r.receiptDate
				? new Date(r.receiptDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
				: 'unknown date';
			return [
				`Merchant: ${r.merchantName ?? 'Unknown'}`,
				`Date: ${date}`,
				r.total    ? `Total: ${r.total} ${r.currency ?? ''}`.trim() : null,
				r.category ? `Category: ${r.category}` : null,
				r.receiptNumber ? `Receipt No: ${r.receiptNumber}` : null,
				r.tags     ? `Tags: ${JSON.parse(r.tags ?? '[]').join(', ')}` : null,
				r.notes    ? `Notes: ${r.notes}` : null,
			].filter(Boolean).join(', ');
		}).map((s) => `• ${s}`).join('\n');
	}

	// ── Build full prompt ─────────────────────────────────────────────
	const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	const historyText = history.length
		? history.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
		: '';

	const fullPrompt = [
		`${SYSTEM_PROMPT} Today's date is ${today}.`,
		`Spending summary (aggregated across all receipts):\n${spendingSummary}`,
		`Individual receipts most relevant to this query:\n${receiptContext}`,
		historyText ? `Previous conversation:\n${historyText}` : null,
		`User: ${query}`
	].filter(Boolean).join('\n\n');

	// ── Call Gemini ───────────────────────────────────────────────────
	const geminiToken = await getGeminiAccessToken(locals.user.id);
	const genAI = geminiToken
		? new GoogleGenAI({ httpOptions: { headers: { Authorization: `Bearer ${geminiToken}` } } })
		: new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

	let answer;
	try {
		const result = await genAI.models.generateContent({
			model: 'gemini-3-flash-preview',
			contents: [fullPrompt]
		});
		answer = result.text?.trim() ?? "I couldn't generate a response. Please try again.";
	} catch (/** @type {any} */ err) {
		const msg = String(err?.message ?? err);
		if (err?.status === 429 || /429|rate.?limit|quota|resource.?exhausted/i.test(msg)) {
			return json(
				{ error: 'rate_limited', message: 'Gemini API rate limit reached. Please wait a moment before querying again.' },
				{ status: 429 }
			);
		}
		return json({ error: 'server_error', message: 'Query failed. Please try again.' }, { status: 500 });
	}

	return json({ answer, contextCount });
}
