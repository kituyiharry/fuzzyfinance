import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema.js";
import { workspace } from "./workspace.schema.js";

export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Auto-generated from the first user message (first 80 chars) */
    title: text("title").notNull(),
    /** JSON: Array<{ role: 'user' | 'assistant', content: string }> */
    messages: text("messages").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_userId_idx").on(table.userId),
    index("conversation_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("conversation_workspaceId_idx").on(table.workspaceId),
  ]
);

export const conversationRelations = relations(conversation, ({ one }) => ({
  user: one(user, { fields: [conversation.userId], references: [user.id] }),
}));
