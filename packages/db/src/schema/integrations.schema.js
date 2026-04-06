import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";

/** @typedef {'google' | 'microsoft'} IntegrationProvider */

export const integration = sqliteTable(
  "integration",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider:     text("provider").notNull(), // 'google' | 'microsoft'
    accountEmail: text("account_email"),
    accessToken:  text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }),
    /** JSON-encoded string array of granted OAuth scopes */
    scopes: text("scopes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("integration_userId_idx").on(table.userId),
    unique("integration_userId_provider_unq").on(table.userId, table.provider),
  ]
);

export const integrationRelations = relations(integration, ({ one }) => ({
  user: one(user, {
    fields: [integration.userId],
    references: [user.id],
  }),
}));
