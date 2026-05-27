import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";
import { workspace } from "./workspace.schema.js";

export const receiptExport = sqliteTable(
  "receipt_export",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),

    /** Suggested filename, e.g. "export_2026-04-08_5receipts.csv" */
    fileName: text("file_name").notNull(),

    /** Number of receipts included in the export */
    receiptCount: integer("receipt_count").notNull().default(0),

    /** Number of data rows in the CSV (one per line item, or one per receipt if no items) */
    rowCount: integer("row_count").notNull().default(0),

    /** The full CSV content */
    csvData: text("csv_data").notNull(),

    /** JSON: string[] of receipt UUIDs included in this export */
    receiptIds: text("receipt_ids").notNull().default('[]'),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("receipt_export_userId_idx").on(table.userId),
    index("receipt_export_workspaceId_idx").on(table.workspaceId),
  ]
);
