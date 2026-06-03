import * as z from 'zod';

/**
 * Shape of a transcribed line item posted to /api/v1/receipts.
 * All fields are optional strings to keep the surface lenient — GPTs frequently
 * omit fields they can't determine.
 */
const lineItemSchema = z.object({
	description:       z.string().max(500).optional(),
	qty:               z.string().max(32).optional(),
	unitPrice:         z.string().max(32).optional(),
	total:             z.string().max(32).optional(),
	unitSize:          z.string().max(32).optional(),
	unitType:          z.string().max(32).optional(),
	primaryCategory:   z.string().max(120).optional(),
	secondaryCategory: z.string().max(120).optional(),
});

export const newReceiptSchema = z.object({
	merchant:       z.string().min(1).max(200).optional(),
	receiptDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'receiptDate must be YYYY-MM-DD').optional(),
	total:          z.string().max(32).optional(),
	subtotal:       z.string().max(32).optional(),
	tax:            z.string().max(32).optional(),
	tip:            z.string().max(32).optional(),
	currency:       z.string().min(3).max(3).optional(),
	paymentMethod:  z.string().max(64).optional(),
	receiptNumber:  z.string().max(64).optional(),
	invoiceNumber:  z.string().max(64).optional(),
	category:       z.string().max(120).optional(),
	notes:          z.string().max(2000).optional(),
	tags:           z.array(z.string().max(64)).max(20).optional(),
	lineItems:      z.array(lineItemSchema).max(500).optional(),
});

/** @typedef {z.infer<typeof newReceiptSchema>} NewReceiptInput */
