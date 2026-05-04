import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";
import { receipt } from "./receipts.schema.js";
import { sale } from "./sales.schema.js";

export const payable = sqliteTable("payable", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  receiptId: text("receipt_id").notNull().references(() => receipt.id, { onDelete: "cascade" }),
  status:    text("status").notNull().default("open"),
  openedAt:  integer("opened_at",  { mode: "timestamp_ms" }).notNull(),
  closedAt:  integer("closed_at",  { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date()).notNull(),
}, (t) => [
  unique("payable_receipt_id_unique").on(t.receiptId),
  index("payable_userId_idx").on(t.userId),
  index("payable_userId_status_idx").on(t.userId, t.status),
]);

export const payableUpdate = sqliteTable("payable_update", {
  id:        text("id").primaryKey(),
  payableId: text("payable_id").notNull().references(() => payable.id, { onDelete: "cascade" }),
  note:      text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, (t) => [
  index("payable_update_payableId_idx").on(t.payableId),
]);

export const receivable = sqliteTable("receivable", {
  id:       text("id").primaryKey(),
  userId:   text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  saleId:   text("sale_id").notNull().references(() => sale.id, { onDelete: "cascade" }),
  status:   text("status").notNull().default("open"),
  openedAt: integer("opened_at",  { mode: "timestamp_ms" }).notNull(),
  closedAt: integer("closed_at",  { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date()).notNull(),
}, (t) => [
  unique("receivable_sale_id_unique").on(t.saleId),
  index("receivable_userId_idx").on(t.userId),
  index("receivable_userId_status_idx").on(t.userId, t.status),
]);

export const receivableUpdate = sqliteTable("receivable_update", {
  id:           text("id").primaryKey(),
  receivableId: text("receivable_id").notNull().references(() => receivable.id, { onDelete: "cascade" }),
  note:         text("note").notNull(),
  createdAt:    integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, (t) => [
  index("receivable_update_receivableId_idx").on(t.receivableId),
]);

export const payableRelations = relations(payable, ({ one, many }) => ({
  user:    one(user,    { fields: [payable.userId],    references: [user.id] }),
  receipt: one(receipt, { fields: [payable.receiptId], references: [receipt.id] }),
  updates: many(payableUpdate),
}));

export const payableUpdateRelations = relations(payableUpdate, ({ one }) => ({
  payable: one(payable, { fields: [payableUpdate.payableId], references: [payable.id] }),
}));

export const receivableRelations = relations(receivable, ({ one, many }) => ({
  user:    one(user, { fields: [receivable.userId], references: [user.id] }),
  sale:    one(sale, { fields: [receivable.saleId], references: [sale.id] }),
  updates: many(receivableUpdate),
}));

export const receivableUpdateRelations = relations(receivableUpdate, ({ one }) => ({
  receivable: one(receivable, { fields: [receivableUpdate.receivableId], references: [receivable.id] }),
}));
