import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";
import { workspace } from "./workspace.schema.js";

export const saleExport = sqliteTable(
  "sale_export",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),

    /** Suggested filename, e.g. "fuzzyfinance_sales_export_2026-05-28_3sales.csv" */
    fileName: text("file_name").notNull(),

    /** Number of sales included in the export */
    saleCount: integer("sale_count").notNull().default(0),

    /** Number of data rows in the CSV (one per line item, or one per sale if no items) */
    rowCount: integer("row_count").notNull().default(0),

    /** The full CSV content */
    csvData: text("csv_data").notNull(),

    /** JSON: string[] of sale UUIDs included in this export */
    saleIds: text("sale_ids").notNull().default('[]'),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("sale_export_userId_idx").on(table.userId),
    index("sale_export_workspaceId_idx").on(table.workspaceId),
  ]
);

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

/**
 * Coupled expense + revenue snapshot. Either FK may be NULL — useful when
 * a saved date range only has one side. Delete endpoint runs explicit
 * cleanup (R2 + cascading viz rows) rather than relying on FK cascades.
 */
export const visualizationSnapshot = sqliteTable(
  "visualization_snapshot",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),

    label:       text("label").notNull().default(""),
    rangeStart:  text("range_start").notNull(),  // YYYY-MM-DD
    rangeEnd:    text("range_end").notNull(),    // YYYY-MM-DD

    receiptExportId: text("receipt_export_id")
      .references(() => receiptExport.id, { onDelete: "set null" }),
    saleExportId: text("sale_export_id")
      .references(() => saleExport.id, { onDelete: "set null" }),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("visualization_snapshot_userId_idx").on(table.userId),
    index("visualization_snapshot_workspaceId_idx").on(table.workspaceId),
  ]
);

export const saleExportVisualization = sqliteTable(
  "sale_export_visualization",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),
    saleExportId: text("sale_export_id")
      .notNull()
      .references(() => saleExport.id, { onDelete: "cascade" }),

    /** Semver of the Rust aggregation logic. Bumped to invalidate stale viz. */
    analyzerVersion: text("analyzer_version").notNull(),

    /** R2 object key under the fuzzyfinance-exports bucket. */
    r2Key: text("r2_key").notNull(),

    /** Cached counts so the list page doesn't need to fetch the full JSON. */
    nodeCount: integer("node_count").notNull().default(0),
    linkCount: integer("link_count").notNull().default(0),

    generatedAt: integer("generated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("sale_export_viz_userId_idx").on(table.userId),
    uniqueIndex("sale_export_viz_export_version_unique")
      .on(table.saleExportId, table.analyzerVersion),
  ]
);

export const receiptExportVisualization = sqliteTable(
  "receipt_export_visualization",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),
    receiptExportId: text("receipt_export_id")
      .notNull()
      .references(() => receiptExport.id, { onDelete: "cascade" }),

    /** Semver of the Rust aggregation logic. Bumped to invalidate stale viz. */
    analyzerVersion: text("analyzer_version").notNull(),

    /** R2 object key under the fuzzyfinance-exports bucket. */
    r2Key: text("r2_key").notNull(),

    /** Cached counts so the list page doesn't need to fetch the full JSON. */
    nodeCount: integer("node_count").notNull().default(0),
    linkCount: integer("link_count").notNull().default(0),

    generatedAt: integer("generated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("receipt_export_viz_userId_idx").on(table.userId),
    uniqueIndex("receipt_export_viz_export_version_unique")
      .on(table.receiptExportId, table.analyzerVersion),
  ]
);
