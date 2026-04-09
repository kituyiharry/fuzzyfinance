import { SchemaType } from '@google/generative-ai';
import { GoogleGenAI } from "@google/genai";


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
 *   receiptNumber: string;
 *   invoiceNumber: string;
 *   category:      string;
 *   notes:         string;
 *   tags:          string[];
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
		}
	},
	required: ['merchant', 'date', 'total', 'currency', 'lineItems']
};

const SYSTEM_PROMPT = `You are a receipt data extraction assistant. Analyse the provided receipt image or PDF and extract all financial and contextual information. Return only valid JSON matching the schema. For any field you cannot determine, use an empty string. For amounts, return only the numeric value without currency symbols. For the date, use ISO 8601 format (YYYY-MM-DD). If no line items are visible, return an empty array. For tags, infer up to 5 short lowercase keyword tags that describe the nature of this expense (e.g. "business-meal", "transport", "recurring", "technology", "office-supplies", "entertainment", "refundable"). For receiptNumber, extract any printed receipt number, transaction reference, confirmation code, or order number. For invoiceNumber, extract any printed invoice or bill number. Use empty strings if not visible.`;

/**
 * Extracts structured receipt data from file bytes using Gemini 2.0 Flash.
 *
 * @param {Uint8Array | ArrayBuffer} fileBytes
 * @param {string} mimeType — e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @returns {Promise<ReceiptExtraction>}
 */
export async function extractReceiptData(fileBytes, mimeType) {
	// const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
	const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

	const bytes =
		fileBytes instanceof ArrayBuffer ? new Uint8Array(fileBytes) : fileBytes;

	// Base64-encode the file bytes for the inline data part
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);

	const result = await genAI.models.generateContent({
        //model: 'gemini-2.0-flash',
        model: 'gemini-3-flash-preview',
        contents: [ 
            SYSTEM_PROMPT, 
	        { inlineData: { mimeType, data: base64 } },
        ],
		config: {
			responseMimeType: 'application/json',
			responseSchema: EXTRACTION_SCHEMA
		}
	});

	// const result = await model.generateContent([
	// 	{ inlineData: { mimeType, data: base64 } },
	// 	SYSTEM_PROMPT
	// ]);

	/** @type {ReceiptExtraction} */
	const parsed =  result.text ? JSON.parse(result.text) : { error: "no response from model" };
	return parsed;
}
