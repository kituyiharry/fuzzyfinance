import { SchemaType } from '@google/generative-ai';
import { GoogleGenAI } from "@google/genai";
import { env } from '$env/dynamic/private';

const GEMINI_TIMEOUT_MS = 25_000;

/**
 * @typedef {{
 *   relevant:            boolean;
 *   relevanceReason:     string;
 *   merchant:            string;
 *   date:                string;
 *   total:               string;
 *   subtotal:            string;
 *   tax:                 string;
 *   tip:                 string;
 *   currency:            string;
 *   paymentMethod:       string;
 *   receiptNumber:       string;
 *   invoiceNumber:       string;
 *   category:            string;
 *   notes:               string;
 *   tags:                string[];
 *   lineItems:           Array<{ description: string; qty: string; unitPrice: string; total: string }>;
 *   authenticityRisk:    string;
 *   authenticitySignals: string[];
 * }} ReceiptExtraction
 */

const EXTRACTION_SCHEMA = {
	type: SchemaType.OBJECT,
	properties: {
		relevant: {
			type: SchemaType.BOOLEAN,
			description: 'true if this document is a receipt, invoice, bill, or expense record. false if it is something else entirely (e.g. an ID card, personal photo, blank page, social media screenshot, or unrelated document).'
		},
		relevanceReason: {
			type: SchemaType.STRING,
			description: 'If relevant is false, briefly explain what the document appears to be. Empty string if relevant is true.'
		},
		merchant:      { type: SchemaType.STRING, description: 'Merchant or vendor name' },
		date:          { type: SchemaType.STRING, description: 'Transaction date in ISO 8601 format (YYYY-MM-DD)' },
		total:         { type: SchemaType.STRING, description: 'Grand total amount as a decimal string' },
		subtotal:      { type: SchemaType.STRING, description: 'Pre-tax subtotal as a decimal string' },
		tax:           { type: SchemaType.STRING, description: 'Tax amount as a decimal string' },
		tip:           { type: SchemaType.STRING, description: 'Tip or gratuity as a decimal string' },
		currency:      { type: SchemaType.STRING, description: 'ISO 4217 currency code, e.g. USD, GBP' },
		paymentMethod: { type: SchemaType.STRING, description: 'e.g. Visa, Cash, Apple Pay' },
		receiptNumber: { type: SchemaType.STRING, description: 'Receipt number, transaction ID, confirmation code, or order number printed on the receipt. Empty string if not present.' },
		invoiceNumber: { type: SchemaType.STRING, description: 'Invoice number or bill number if this is a formal invoice. Empty string if not present.' },
		category:      { type: SchemaType.STRING, description: 'Business expense category, e.g. Meals, Travel, Office Supplies' },
		notes:         { type: SchemaType.STRING, description: 'Qualitative context — what was purchased, any unusual items, business purpose' },
		tags: {
			type: SchemaType.ARRAY,
			items: { type: SchemaType.STRING },
			description: 'Up to 5 short keyword tags inferred from the receipt context, e.g. "business-meal", "recurring", "technology", "transport", "refundable".'
		},
		lineItems: {
			type: SchemaType.ARRAY,
			items: {
				type: SchemaType.OBJECT,
				properties: {
					description: { type: SchemaType.STRING },
					qty:         { type: SchemaType.STRING },
					unitPrice:   { type: SchemaType.STRING },
					total:       { type: SchemaType.STRING }
				},
				required: ['description', 'qty', 'unitPrice', 'total']
			}
		},
		authenticityRisk: {
			type: SchemaType.STRING,
			description: 'Your visual authenticity assessment of this receipt. One of: "low" (appears to be a genuine receipt), "medium" (some concerns but not conclusive), "high" (strong visual signs of fabrication or AI generation). Evaluate: font consistency, whether line-item totals and subtotals add up correctly, presence of realistic thermal-print artifacts or paper texture, plausibility of merchant name and items for the stated category, any signs of digital compositing or cut-and-paste, and whether the layout matches real POS output.'
		},
		authenticitySignals: {
			type: SchemaType.ARRAY,
			items: { type: SchemaType.STRING },
			description: 'Specific visual observations that informed the authenticityRisk rating. Empty array if risk is "low". Examples: "subtotal and tax do not sum to the stated total", "font face changes mid-receipt", "thermal paper grain pattern is absent", "item prices are implausibly uniform round numbers", "merchant logo appears digitally inserted".'
		}
	},
	required: ['relevant', 'merchant', 'date', 'total', 'currency', 'lineItems', 'authenticityRisk', 'authenticitySignals']
};

const SYSTEM_PROMPT = `You are a receipt data extraction assistant.

First, determine whether the provided document is a receipt, invoice, bill, or expense record. If it is NOT (e.g. it is an ID card, passport, personal photo, screenshot of a social media post, blank page, or any non-financial document), set relevant to false and relevanceReason to a brief explanation — then return empty/default values for all other fields.

If it IS a financial/receipt document, set relevant to true, relevanceReason to empty string, and extract all information. Return only valid JSON matching the schema. For any field you cannot determine, use an empty string. For amounts, return only the numeric value without currency symbols. For the date, use ISO 8601 format (YYYY-MM-DD). If no line items are visible, return an empty array. For tags, infer up to 5 short lowercase keyword tags. For receiptNumber, extract any printed receipt number, transaction reference, confirmation code, or order number. For invoiceNumber, extract any printed invoice or bill number. Use empty strings if not visible.

Additionally, assess the visual authenticity of the document for the authenticityRisk and authenticitySignals fields. Check whether: line-item prices sum to the subtotal, tax and subtotal sum to the total, fonts are consistent throughout, the layout matches genuine POS terminal output, thermal-paper grain or realistic printing artifacts are present, and no signs of digital compositing are visible. Set authenticityRisk to "low" for clearly genuine receipts, "medium" for minor concerns, or "high" for strong signs of fabrication. Always populate authenticitySignals with any specific concerns; leave it as an empty array only when risk is "low".`;

/**
 * Extracts structured receipt data from file bytes using Gemini.
 *
 * @param {Uint8Array | ArrayBuffer} fileBytes
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @param {string[]} [preAuthSignals] - signals from pre-extraction metadata scan to include as context
 * @returns {Promise<ReceiptExtraction>}
 */
export async function extractReceiptData(fileBytes, mimeType, preAuthSignals = []) {
	const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

	const bytes = fileBytes instanceof ArrayBuffer ? new Uint8Array(fileBytes) : fileBytes;
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
	const base64 = btoa(binary);

	const preAuthNote = preAuthSignals.length
		? `\n\nPre-extraction file metadata scan detected the following signals before visual analysis — factor these into your authenticityRisk and authenticitySignals assessment:\n${preAuthSignals.map((s) => `• ${s}`).join('\n')}`
		: '';

	/** @type {import('@google/genai').GenerateContentResponse} */
	let result;
	try {
		result = await _withTimeout(
			genAI.models.generateContent({
				model: 'gemini-3-flash-preview',
				contents: [
					SYSTEM_PROMPT + preAuthNote,
					{ inlineData: { mimeType, data: base64 } }
				],
				config: {
					responseMimeType: 'application/json',
					responseSchema: EXTRACTION_SCHEMA
				}
			}),
			GEMINI_TIMEOUT_MS
		);
	} catch (/** @type {any} */ err) {
		const msg = String(err?.message ?? err);
		if (err?.status === 429 || /429|rate.?limit|quota|resource.?exhausted/i.test(msg)) {
			const rateLimitErr = new Error('Gemini API rate limit reached. Please wait a moment and try again.');
			// @ts-ignore
			rateLimitErr.code = 'RATE_LIMITED';
			throw rateLimitErr;
		}
		if (err?.code === 'TIMED_OUT') throw err;
		throw err;
	}

	/** @type {ReceiptExtraction} */
	const parsed = result.text ? JSON.parse(result.text) : {};

	if (parsed.relevant === false) {
		const reason = parsed.relevanceReason?.trim() || 'Document does not appear to be a receipt or expense record.';
		const err = new Error(reason);
		// @ts-ignore
		err.code = 'NOT_RELEVANT';
		throw err;
	}

	return parsed;
}

/**
 * Races a promise against a timeout. Rejects with code='TIMED_OUT' if exceeded.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function _withTimeout(promise, ms) {
	/** @type {ReturnType<typeof setTimeout>} */
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => {
			const err = new Error(`Gemini extraction timed out after ${ms / 1000}s. Please try again.`);
			// @ts-ignore
			err.code = 'TIMED_OUT';
			reject(err);
		}, ms);
	});
	return /** @type {Promise<T>} */ (
		Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
	);
}
