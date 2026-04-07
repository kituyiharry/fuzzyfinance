import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

/**
 * @typedef {{
 *   merchant:      string;
 *   date:          string;
 *   total:         string;
 *   subtotal:      string;
 *   tax:           string;
 *   tip:           string;
 *   currency:      string;
 *   paymentMethod: string;
 *   category:      string;
 *   notes:         string;
 *   lineItems:     Array<{ description: string; qty: string; unitPrice: string; total: string }>;
 * }} ReceiptExtraction
 */

const EXTRACTION_SCHEMA = {
	type: SchemaType.OBJECT,
	properties: {
		merchant:      { type: SchemaType.STRING, description: 'Merchant or vendor name' },
		date:          { type: SchemaType.STRING, description: 'Transaction date in ISO 8601 format (YYYY-MM-DD)' },
		total:         { type: SchemaType.STRING, description: 'Grand total amount as a decimal string' },
		subtotal:      { type: SchemaType.STRING, description: 'Pre-tax subtotal as a decimal string' },
		tax:           { type: SchemaType.STRING, description: 'Tax amount as a decimal string' },
		tip:           { type: SchemaType.STRING, description: 'Tip or gratuity as a decimal string' },
		currency:      { type: SchemaType.STRING, description: 'ISO 4217 currency code, e.g. USD, GBP' },
		paymentMethod: { type: SchemaType.STRING, description: 'e.g. Visa, Cash, Apple Pay' },
		category:      { type: SchemaType.STRING, description: 'Business expense category, e.g. Meals, Travel, Office Supplies' },
		notes:         { type: SchemaType.STRING, description: 'Qualitative context — what was purchased, any unusual items, business purpose' },
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
		}
	},
	required: ['merchant', 'date', 'total', 'currency', 'lineItems']
};

const SYSTEM_PROMPT = `You are a receipt data extraction assistant. Analyse the provided receipt image or PDF and extract all financial and contextual information. Return only valid JSON matching the schema. For any field you cannot determine, use an empty string. For amounts, return only the numeric value without currency symbols. For the date, use ISO 8601 format (YYYY-MM-DD). If no line items are visible, return an empty array.`;

/**
 * Extracts structured receipt data from file bytes using Gemini 2.0 Flash.
 *
 * @param {Uint8Array | ArrayBuffer} fileBytes
 * @param {string} mimeType — e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @returns {Promise<ReceiptExtraction>}
 */
export async function extractReceiptData(fileBytes, mimeType) {
	const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

	const model = genAI.getGenerativeModel({
		model: 'gemini-2.0-flash',
		generationConfig: {
			responseMimeType: 'application/json',
			responseSchema: EXTRACTION_SCHEMA
		}
	});

	const bytes =
		fileBytes instanceof ArrayBuffer ? new Uint8Array(fileBytes) : fileBytes;

	// Base64-encode the file bytes for the inline data part
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);

	const result = await model.generateContent([
		{ inlineData: { mimeType, data: base64 } },
		SYSTEM_PROMPT
	]);

	const text = result.response.text();
	/** @type {ReceiptExtraction} */
	const parsed = JSON.parse(text);
	return parsed;
}
