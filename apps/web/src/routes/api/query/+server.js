import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { inArray } from 'drizzle-orm';
import { searchReceipts } from '$lib/server/vectorize';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

const SYSTEM_PROMPT = `You are FuzzyFinance's financial assistant. You help users understand their receipt and spending data. Be concise — answer in 1–4 sentences unless a list or breakdown is specifically requested. Base your answers only on the provided receipt data. If no relevant data is found, say so clearly. Do not fabricate receipts, merchants, or amounts.`;

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals, platform }) {
	if (!locals.user) error(401, 'Unauthorized');
	if (!platform?.env?.VECTORIZE || !platform?.env?.AI) error(503, 'Search service unavailable');

	const body = await request.json();
	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if (!query) error(400, 'Missing query');

	/** @type {Array<{ role: string; content: string }>} */
	const history = Array.isArray(body?.history) ? body.history.slice(-10) : []; // cap history at 10 turns

	// ── Semantic search for relevant receipts ─────────────────────────
	const matches = await searchReceipts(platform.env, locals.user.id, query, 8);

	let receiptContext = 'No matching receipts found in the user\'s data.';
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
		`Relevant receipts:\n${receiptContext}`,
		historyText ? `Previous conversation:\n${historyText}` : null,
		`User: ${query}`
	].filter(Boolean).join('\n\n');

	// ── Call Gemini ───────────────────────────────────────────────────
	let answer;
	try {
		const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
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
