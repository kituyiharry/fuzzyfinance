const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Calls the Generative Language REST API using a user OAuth Bearer token,
 * bypassing the @google/genai SDK which requires ADC and doesn't support
 * plain user tokens in a Workers environment.
 *
 * @param {{
 *   accessToken: string;
 *   model: string;
 *   parts: object[];
 *   generationConfig?: object;
 *   timeoutMs?: number;
 * }} opts
 * @returns {Promise<string>} Text of the first candidate part
 */
export async function generateWithOAuth({ accessToken, model, parts, generationConfig, timeoutMs = 25_000 }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let res;
	try {
		res = await fetch(`${GEMINI_REST_BASE}/models/${model}:generateContent`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({
				contents: [{ role: 'user', parts }],
				...(generationConfig ? { generationConfig } : {})
			}),
			signal: controller.signal
		});
	} catch (/** @type {any} */ fetchErr) {
		if (fetchErr?.name === 'AbortError') {
			const err = new Error(`Gemini extraction timed out after ${timeoutMs / 1000}s. Please try again.`);
			// @ts-ignore
			err.code = 'TIMED_OUT';
			throw err;
		}
		throw fetchErr;
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		const body = await res.text();
		const err = new Error(`Gemini API error (${res.status}): ${body}`);
		// @ts-ignore
		err.status = res.status;
		throw err;
	}

	const data = await res.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
