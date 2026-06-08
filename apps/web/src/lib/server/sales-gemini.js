import { SchemaType } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import categories from '$lib/server/categories.json';
import { generateWithOAuth } from '$lib/server/gemini-rest';

const _PRIMARY_NAMES = categories.map((c) => c.primary);
const _CATEGORY_HIERARCHY = categories
	.map((c) => `${c.primary}: ${c.secondary.join(', ')}`)
	.join('\n');

const GEMINI_TIMEOUT_MS = 25_000;

/**
 * @typedef {{
 *   relevant:       boolean;
 *   relevanceReason: string;
 *   documentTitle: string;
 *   date:          string;
 *   totalRevenue:  string;
 *   totalCost:     string;
 *   totalMargin:   string;
 *   currency:      string;
 *   category:      string;
 *   notes:         string;
 *   tags:          string[];
 *   lineItems:     Array<{
 *     description:      string;
 *     type:             string;
 *     unitsSold:        string;
 *     buyPrice:         string;
 *     sellPrice:        string;
 *     margin:           string;
 *     total:            string;
 *     totalCost:        string;
 *     unitSize:         string;
 *     unitType:         string;
 *     primaryCategory:  string;
 *     secondaryCategory: string;
 *   }>;
 * }} SaleExtraction
 */

const EXTRACTION_SCHEMA = {
	type: SchemaType.OBJECT,
	properties: {
		relevant: {
			type: SchemaType.BOOLEAN,
			description: 'true if this document is a revenue record — including: sales invoices, revenue invoices, sales orders, purchase orders, income records, shift reports, end-of-day reports, daily sales/revenue summaries, cash register/till reports, and POS summary reports. false if it is something else entirely (e.g. an ID card, personal photo, non-financial document, or an expense receipt for money paid out rather than income received).'
		},
		relevanceReason: {
			type: SchemaType.STRING,
			description: 'If relevant is false, briefly explain what the document appears to be. Empty string if relevant is true.'
		},
		documentTitle: {
			type: SchemaType.STRING,
			description: 'Title or heading of the document — e.g. "Sales Invoice", "Shift Report", "End of Day Summary", "Daily Sales Report", or any other heading visible on the document.'
		},
		date: {
			type: SchemaType.STRING,
			description: 'Sale or report date in ISO 8601 format (YYYY-MM-DD). Empty string if not visible.'
		},
		totalRevenue: {
			type: SchemaType.STRING,
			description: 'Total sell/revenue amount as a decimal string without currency symbols.'
		},
		totalCost: {
			type: SchemaType.STRING,
			description: 'Total buy/cost amount as a decimal string. Empty string if not on the document (e.g. services-only).'
		},
		totalMargin: {
			type: SchemaType.STRING,
			description: 'Total margin (revenue minus cost) as a decimal string. Empty string if cost is not available.'
		},
		currency: {
			type: SchemaType.STRING,
			description: 'ISO 4217 currency code, e.g. USD, GBP, KES.'
		},
		category: {
			type: SchemaType.STRING,
			description: 'Exactly one of: "products" (physical goods only), "services" (services only), "mixed" (both).'
		},
		notes: {
			type: SchemaType.STRING,
			description: 'Any qualitative context about this sale — customer, purpose, special terms, etc.'
		},
		tags: {
			type: SchemaType.ARRAY,
			items: { type: SchemaType.STRING },
			description: 'Up to 5 short lowercase keyword tags, e.g. "wholesale", "retail", "recurring", "b2b", "seasonal".'
		},
		lineItems: {
			type: SchemaType.ARRAY,
			items: {
				type: SchemaType.OBJECT,
				properties: {
					description: {
						type: SchemaType.STRING,
						description: 'Product name, service description, or item category. For shift/end-of-day reports, each row in the sales breakdown is a line item.'
					},
					type: {
						type: SchemaType.STRING,
						description: 'Exactly "product" or "service".'
					},
					unitsSold: {
						type: SchemaType.STRING,
						description: 'Number of units sold as a string. Empty string for services.'
					},
					buyPrice: {
						type: SchemaType.STRING,
						description: 'Unit buy/cost price as a decimal string. Empty string for services or if not on the document.'
					},
					sellPrice: {
						type: SchemaType.STRING,
						description: 'Unit sell price as a decimal string; or the total fee for a service if no per-unit breakdown.'
					},
					margin: {
						type: SchemaType.STRING,
						description: 'Margin as a decimal fraction string (e.g. "0.35" for 35%). Empty string if not calculable.'
					},
					total: {
						type: SchemaType.STRING,
						description: 'Total sell value for this line item as a decimal string.'
					},
					totalCost: {
						type: SchemaType.STRING,
						description: 'Total cost for this line item as a decimal string. Empty string for services.'
					},
					unitSize: {
						type: SchemaType.STRING,
						description: 'Numeric size or quantity measurement of a single unit of this product as a decimal string, e.g. "0.784" for 0.784 kg, "2" for a 2-litre bottle, "40" for a 40-pack. Empty string if the item description does not include a measurement.'
					},
					unitType: {
						type: SchemaType.STRING,
						description: 'Unit label for the size measurement, e.g. "kg", "g", "L", "ml", "oz", "lb", "pk", "ct", "m". Empty string if unitSize is empty.'
					},
					primaryCategory: {
						type: SchemaType.STRING,
						enum: [..._PRIMARY_NAMES, 'Other'],
						description: 'Primary category for this line item. Must be one of the defined primary categories or "Other" if none fits.'
					},
					secondaryCategory: {
						type: SchemaType.STRING,
						description: 'Secondary category within the chosen primaryCategory. Must be one of the valid secondary values for that primary. Use empty string if primaryCategory is "Other".'
					}
				},
				required: ['description', 'type', 'sellPrice', 'total', 'unitSize', 'unitType', 'primaryCategory', 'secondaryCategory']
			}
		}
	},
	required: ['relevant', 'date', 'totalRevenue', 'currency', 'category', 'lineItems']
};

const SYSTEM_PROMPT = `You are a revenue document extraction assistant.

First, determine whether the provided document is a revenue record. This includes: sales invoices, revenue invoices, sales orders, purchase orders, income records, shift reports, end-of-day reports, daily sales/revenue summaries, cash register/till reports, and POS summary reports. If it is NOT (e.g. it is a personal expense receipt, ID card, personal photo, blank page, or any non-revenue document), set relevant to false and relevanceReason to a brief explanation — then return empty/default values for all other fields.

If it IS a sales document, set relevant to true, relevanceReason to empty string, and extract all financial data. Return only valid JSON matching the schema.

IMPORTANT — Shift reports and end-of-day/till summaries: these documents list the items or product categories sold during a shift or day. Every item or product line shown IS a line item and must be extracted into the lineItems array. Do not return an empty lineItems array for these documents. The document total is the totalRevenue for that period.

For products: extract units sold, buy price (cost), sell price, and margin if visible. Compute margin as (sellPrice - buyPrice) / sellPrice if not stated.
For each line item, extract unitSize and unitType if the product description includes a size or quantity measurement: e.g. "FullCream Milk 2L" → unitSize "2", unitType "L"; "Tangold Seedless 0.784 kg" → unitSize "0.784", unitType "kg"; "Flushable Wipe 40pk" → unitSize "40", unitType "pk". Use empty strings for both if no measurement is present.
For services: leave unitsSold, buyPrice, and totalCost empty. The sellPrice is the service fee.
For mixed documents: classify each line item individually.
For totalMargin: compute as totalRevenue minus totalCost if both are present and not stated.
For amounts: return only the numeric value without currency symbols.
For dates: use ISO 8601 format (YYYY-MM-DD). Empty string if not visible.
For tags: infer up to 5 short lowercase tags describing the nature of this sale.

For each line item, also classify it using the following category taxonomy. Choose the most specific primaryCategory and a secondaryCategory from its list. Use "Other" for primaryCategory only if no category fits, and leave secondaryCategory as an empty string in that case.

${_CATEGORY_HIERARCHY}`;

/**
 * Extracts structured sales data from file bytes using Gemini.
 *
 * @param {Uint8Array | ArrayBuffer} fileBytes
 * @param {string} mimeType — e.g. 'image/jpeg', 'application/pdf'
 * @param {string | null} [accessToken] - Google OAuth access token; falls back to GEMINI_API_KEY when absent
 * @returns {Promise<SaleExtraction>}
 */
export async function extractSaleData(fileBytes, mimeType, accessToken = null) {
	const bytes = fileBytes instanceof ArrayBuffer ? new Uint8Array(fileBytes) : fileBytes;
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
	const base64 = btoa(binary);

	const generationConfig = {
		responseMimeType: 'application/json',
		responseSchema: EXTRACTION_SCHEMA
	};

	let text;
	try {
		if (accessToken) {
			text = await generateWithOAuth({
				accessToken,
				model: 'gemini-3-flash-preview',
				parts: [
					{ text: SYSTEM_PROMPT },
					{ inlineData: { mimeType, data: base64 } }
				],
				generationConfig,
				timeoutMs: GEMINI_TIMEOUT_MS
			});
		} else {
			const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
			const result = await _withTimeout(
				genAI.models.generateContent({
					// model: 'gemini-3-flash-preview',
		            model: 'gemini-3.5-flash',
					contents: [
						SYSTEM_PROMPT,
						{ inlineData: { mimeType, data: base64 } }
					],
					config: generationConfig
				}),
				GEMINI_TIMEOUT_MS
			);
			text = result.text;
		}
	} catch (/** @type {any} */ err) {
		const msg = String(err?.message ?? err);
		if (err?.status === 429 || /429|rate.?limit|quota|resource.?exhausted/i.test(msg)) {
			const rateLimitErr = new Error('Gemini API rate limit reached. Please wait a moment and try again.');
			// @ts-ignore
			rateLimitErr.code = 'RATE_LIMITED';
			throw rateLimitErr;
		}
		if (err?.code === 'TIMED_OUT' || err?.code === 'NOT_RELEVANT') throw err;
		throw err;
	}

	/** @type {SaleExtraction} */
	const parsed = text ? JSON.parse(text) : {};

	if (parsed.relevant === false) {
		const reason = parsed.relevanceReason?.trim() || 'Document does not appear to be a sales record.';
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
