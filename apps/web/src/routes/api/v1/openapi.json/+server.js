import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 spec for ChatGPT Action import.
 *
 * Paste this URL into the GPT Store action wizard. ChatGPT auto-discovers
 * the endpoints, OAuth flow, and request/response schemas.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET() {
	const base = env.ORIGIN ?? 'http://localhost:4173';

	return json({
		openapi: '3.1.0',
		info: {
			title:       'FuzzyFinance API',
			description: 'Programmatic access to a user\'s FuzzyFinance receipts.',
			version:     '1.0.0',
		},
		servers: [{ url: `${base}/api/v1` }],

		components: {
			securitySchemes: {
				fuzzyfinance_oauth: {
					type: 'oauth2',
					flows: {
						authorizationCode: {
							authorizationUrl: `${base}/api/auth/oauth2/authorize`,
							tokenUrl:         `${base}/api/auth/oauth2/token`,
							refreshUrl:       `${base}/api/auth/oauth2/token`,
							scopes: {
								'receipts.read':  'Read receipts and search the user\'s receipt history.',
								'receipts.write': 'Create new receipts on the user\'s behalf.',
								'offline_access': 'Refresh tokens without prompting the user again.',
							},
						},
					},
				},
			},
			schemas: {
				LineItem: {
					type: 'object',
					properties: {
						description:       { type: 'string' },
						qty:               { type: 'string' },
						unitPrice:         { type: 'string' },
						total:             { type: 'string' },
						unitSize:          { type: 'string' },
						unitType:          { type: 'string' },
						primaryCategory:   { type: 'string' },
						secondaryCategory: { type: 'string' },
					},
				},
				NewReceipt: {
					type: 'object',
					properties: {
						merchant:       { type: 'string', description: 'Merchant or vendor name.' },
						receiptDate:    { type: 'string', format: 'date',  description: 'YYYY-MM-DD' },
						total:          { type: 'string', description: 'Grand total as a decimal string.' },
						subtotal:       { type: 'string' },
						tax:            { type: 'string' },
						tip:            { type: 'string' },
						currency:       { type: 'string', description: 'ISO 4217 code, e.g. AUD.' },
						paymentMethod:  { type: 'string' },
						receiptNumber:  { type: 'string' },
						invoiceNumber:  { type: 'string' },
						category:       { type: 'string' },
						notes:          { type: 'string' },
						tags:           { type: 'array', items: { type: 'string' } },
						lineItems:      { type: 'array', items: { $ref: '#/components/schemas/LineItem' } },
					},
				},
				ReceiptSummary: {
					type: 'object',
					properties: {
						id:           { type: 'string', format: 'uuid' },
						merchant:     { type: 'string', nullable: true },
						receiptDate:  { type: 'string', format: 'date-time', nullable: true },
						total:        { type: 'string', nullable: true },
						currency:     { type: 'string', nullable: true },
						category:     { type: 'string', nullable: true },
						createdAt:    { type: 'string', format: 'date-time' },
					},
				},
				SearchMatch: {
					allOf: [
						{ $ref: '#/components/schemas/ReceiptSummary' },
						{ type: 'object', properties: { score: { type: 'number', description: 'Cosine similarity, 0–1.' } } },
					],
				},
			},
		},

		security: [{ fuzzyfinance_oauth: ['receipts.read'] }],

		paths: {
			'/receipts': {
				post: {
					operationId: 'createReceipt',
					summary:     'Create a transcribed receipt',
					description: 'Persist receipt data the caller has already transcribed. The system stores structured fields and indexes the receipt for semantic search.',
					security:    [{ fuzzyfinance_oauth: ['receipts.write'] }],
					requestBody: {
						required: true,
						content: { 'application/json': { schema: { $ref: '#/components/schemas/NewReceipt' } } },
					},
					responses: {
						'201': {
							description: 'Receipt created',
							content: { 'application/json': { schema: {
								type: 'object',
								properties: { id: { type: 'string' }, vectorId: { type: 'string', nullable: true } },
							} } },
						},
						'400': { description: 'Invalid body' },
						'401': { description: 'Unauthorized' },
						'403': { description: 'Missing receipts.write scope' },
					},
				},
			},
			'/receipts/recent': {
				get: {
					operationId: 'listRecentReceipts',
					summary:     'List most recently created receipts',
					description: 'Returns the caller\'s receipts in reverse-chronological order.',
					security:    [{ fuzzyfinance_oauth: ['receipts.read'] }],
					parameters: [
						{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
					],
					responses: {
						'200': {
							description: 'Receipt summaries',
							content: { 'application/json': { schema: {
								type: 'object',
								properties: { items: { type: 'array', items: { $ref: '#/components/schemas/ReceiptSummary' } } },
							} } },
						},
					},
				},
			},
			'/receipts/search': {
				get: {
					operationId: 'searchReceipts',
					summary:     'Semantic search over receipts',
					description: 'Vector search over receipt content (merchant, line items, notes). Use when the user asks "what did I buy last week", "find the coffee from Tuesday", etc.',
					security:    [{ fuzzyfinance_oauth: ['receipts.read'] }],
					parameters: [
						{ name: 'q',     in: 'query', required: true, schema: { type: 'string' } },
						{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 25, default: 10 } },
					],
					responses: {
						'200': {
							description: 'Ranked matches',
							content: { 'application/json': { schema: {
								type: 'object',
								properties: { matches: { type: 'array', items: { $ref: '#/components/schemas/SearchMatch' } } },
							} } },
						},
					},
				},
			},
			'/receipts/{id}': {
				get: {
					operationId: 'getReceipt',
					summary:     'Fetch a single receipt with line items',
					security:    [{ fuzzyfinance_oauth: ['receipts.read'] }],
					parameters: [
						{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
					],
					responses: {
						'200': { description: 'Receipt + line items' },
						'404': { description: 'Receipt not found' },
					},
				},
			},
		},
	});
}
