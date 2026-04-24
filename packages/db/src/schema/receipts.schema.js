import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";

/**
 * @typedef {'pending' | 'processing' | 'staged' | 'complete' | 'failed' | 'complete_no_sync'} ReceiptStatus
 */

export const receipt = sqliteTable(
  "receipt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /* @type {import('drizzle-orm/sqlite-core').SQLiteColumn<any>} */

    status: text("status").notNull().default("pending"),

    // Extracted fields
    merchantName:  text("merchant_name"),
    receiptDate:   integer("receipt_date", { mode: "timestamp_ms" }),
    total:         text("total"),
    subtotal:      text("subtotal"),
    tax:           text("tax"),
    tip:           text("tip"),
    currency:      text("currency"),
    paymentMethod: text("payment_method"),
    category:      text("category"),
    notes:         text("notes"),
    /** JSON-encoded array of line items — denormalised read cache */
    lineItemsJson: text("line_items_json"),

    // Source file
    r2Key:        text("r2_key"),
    rawFileName:  text("raw_file_name"),
    rawMimeType:  text("raw_mime_type"),
    rawSizeBytes: integer("raw_size_bytes"),
    /** Timestamp after which the R2 object may be deleted by the cleanup cron.
     *  Set to now+7d at commit time. NULL means the object hasn't been synced yet;
     *  the cron falls back to createdAt+30d for those (abandoned uploads). */
    r2ExpiresAt:  integer("r2_expires_at", { mode: "timestamp_ms" }),

    // Cloud sync
    driveFileId:   text("drive_file_id"),
    driveProvider: text("drive_provider"), // 'google' | 'microsoft'
    sheetId:       text("sheet_id"),
    sheetProvider: text("sheet_provider"), // 'google' | 'microsoft'

    // Vector index
    vectorId: text("vector_id"),

    // Last error for failed steps
    errorMessage: text("error_message"),

    // AI extraction snapshot (set once at extraction time, never mutated)
    aiExtractedJson: text("ai_extracted_json"),

    // JSON string[] of field names the user corrected vs AI snapshot
    correctedFields: text("corrected_fields"),

    // JSON string[] of AI-inferred keyword tags, e.g. '["business-meal","transport"]'
    tags: text("tags"),

    // Duplicate detection
    fileHash:      text("file_hash"),      // SHA-256 hex of raw uploaded file bytes
    receiptNumber: text("receipt_number"), // e.g. "RCP-1234", "TXN-5678"
    invoiceNumber: text("invoice_number"), // e.g. "INV-2024-001"
    duplicateOf:   text("duplicate_of"),   // receipt.id of suspected duplicate (soft ref)

    // Authenticity assessment — set at extraction time, null if not yet assessed
    // risk: 'low' | 'medium' | 'high'
    authenticityRisk:    text("authenticity_risk"),
    // JSON string[] of specific signals, e.g. '["AI generator signature in metadata"]'
    authenticitySignals: text("authenticity_signals"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("receipt_userId_idx").on(table.userId),
    index("receipt_status_idx").on(table.status),
    index("receipt_userId_receiptDate_idx").on(table.userId, table.receiptDate),
    index("receipt_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("receipt_userId_fileHash_idx").on(table.userId, table.fileHash),
    index("receipt_userId_receiptNumber_idx").on(table.userId, table.receiptNumber),
  ]
);

export const receiptLineItem = sqliteTable(
  "receipt_line_item",
  {
    id:          text("id").primaryKey(),
    receiptId:   text("receipt_id")
      .notNull()
      .references(() => receipt.id, { onDelete: "cascade" }),
    description: text("description"),
    qty:         text("qty"),
    unitPrice:   text("unit_price"),
    total:       text("total"),
    sortOrder:   integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("receipt_line_item_receiptId_idx").on(table.receiptId),
  ]
);

export const receiptRelations = relations(receipt, ({ one, many }) => ({
  user:      one(user,   { fields: [receipt.userId],    references: [user.id] }),
  lineItems: many(receiptLineItem),
}));

export const receiptLineItemRelations = relations(receiptLineItem, ({ one }) => ({
  receipt: one(receipt, { fields: [receiptLineItem.receiptId], references: [receipt.id] }),
}));
