import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";
import { workspace } from "./workspace.schema.js";

export const sale = sqliteTable(
  "sale",
  {
    id:     text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),

    /** 'pending' | 'processing' | 'staged' | 'complete' | 'failed' | 'complete_no_sync' */
    status: text("status").notNull().default("pending"),

    // ── Extracted fields ─────────────────────────────────────────────────
    documentTitle: text("document_title"),
    saleDate:      integer("sale_date", { mode: "timestamp_ms" }),
    totalRevenue:  text("total_revenue"),
    totalCost:     text("total_cost"),    // null for services-only documents
    totalMargin:   text("total_margin"),  // null if cost unavailable
    currency:      text("currency"),
    /** 'products' | 'services' | 'mixed' */
    category:      text("category"),
    notes:         text("notes"),
    /** JSON: string[] */
    tags:          text("tags"),
    /** Denormalized line items JSON cache */
    lineItemsJson: text("line_items_json"),

    // ── File metadata ────────────────────────────────────────────────────
    r2Key:        text("r2_key"),
    rawFileName:  text("raw_file_name"),
    rawMimeType:  text("raw_mime_type"),
    rawSizeBytes: integer("raw_size_bytes"),
    /** SHA-256 hex of raw file bytes */
    fileHash:     text("file_hash"),
    /** Timestamp after which the R2 object may be deleted by the cleanup cron.
     *  Set to now+7d at commit time. NULL = not yet synced; cron falls back to
     *  createdAt+30d for abandoned uploads. */
    r2ExpiresAt:  integer("r2_expires_at", { mode: "timestamp_ms" }),

    // ── Cloud sync ───────────────────────────────────────────────────────
    driveFileId:   text("drive_file_id"),
    /** 'google' | 'microsoft' */
    driveProvider: text("drive_provider"),
    sheetId:       text("sheet_id"),
    /** 'google' | 'microsoft' */
    sheetProvider: text("sheet_provider"),

    // ── AI + vector ──────────────────────────────────────────────────────
    vectorId:        text("vector_id"),
    aiExtractedJson: text("ai_extracted_json"),
    /** JSON: string[] of field names user corrected vs AI snapshot */
    correctedFields: text("corrected_fields"),
    errorMessage:    text("error_message"),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("sale_userId_idx").on(table.userId),
    index("sale_userId_status_idx").on(table.userId, table.status),
    index("sale_userId_saleDate_idx").on(table.userId, table.saleDate),
    index("sale_userId_fileHash_idx").on(table.userId, table.fileHash),
    index("sale_workspaceId_idx").on(table.workspaceId),
  ]
);

export const saleLineItem = sqliteTable(
  "sale_line_item",
  {
    id:     text("id").primaryKey(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sale.id, { onDelete: "cascade" }),

    description: text("description"),
    /** 'product' | 'service' */
    type:        text("type"),
    /** Units sold — null for services */
    unitsSold:   text("units_sold"),
    /** Unit cost price — null for services or when not on document */
    buyPrice:    text("buy_price"),
    /** Unit sell price, or total fee for a service */
    sellPrice:   text("sell_price"),
    /** Margin as decimal string e.g. '0.35' — null if not calculable */
    margin:      text("margin"),
    /** Total sell value for this line item */
    total:       text("total"),
    /** Total cost for this line item — null for services */
    totalCost:        text("total_cost"),
    unitSize:         text("unit_size"),
    unitType:         text("unit_type"),
    primaryCategory:  text("primary_category"),
    secondaryCategory: text("secondary_category"),
    sortOrder:        integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("sale_line_item_saleId_idx").on(table.saleId),
  ]
);

export const saleRelations = relations(sale, ({ one, many }) => ({
  user:      one(user, { fields: [sale.userId], references: [user.id] }),
  lineItems: many(saleLineItem),
}));

export const saleLineItemRelations = relations(saleLineItem, ({ one }) => ({
  sale: one(sale, { fields: [saleLineItem.saleId], references: [sale.id] }),
}));
