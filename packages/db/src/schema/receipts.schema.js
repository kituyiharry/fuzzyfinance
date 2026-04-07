import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";

/**
 * @typedef {'pending' | 'processing' | 'complete' | 'failed' | 'complete_no_sync'} ReceiptStatus
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
    r2Key:         text("r2_key"),
    rawFileName:   text("raw_file_name"),
    rawMimeType:   text("raw_mime_type"),
    rawSizeBytes:  integer("raw_size_bytes"),

    // Cloud sync
    driveFileId:   text("drive_file_id"),
    driveProvider: text("drive_provider"), // 'google' | 'microsoft'
    sheetId:       text("sheet_id"),
    sheetProvider: text("sheet_provider"), // 'google' | 'microsoft'

    // Vector index
    vectorId: text("vector_id"),

    // Last error for failed steps
    errorMessage: text("error_message"),

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
