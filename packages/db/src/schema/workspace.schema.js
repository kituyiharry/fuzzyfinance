import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema.js';

export const workspace = sqliteTable('workspace', {
    id:        text('id').primaryKey(),
    userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name:      text('name').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    /** Folder name suffix for Drive sync, e.g. "Claude" → "FuzzyFinance Receipts for Claude". NULL for the default/personal workspace. */
    driveSlug: text('drive_slug'),
    /** ISO-4217 baseline currency for analysis. Receipts/sales in other currencies
     *  are excluded from visualizations until per-currency conversion is integrated. */
    preferredCurrency: text('preferred_currency').notNull().default('AUD'),
    /** User-defined categories that augment the built-in catalogue in
     *  apps/web/src/lib/server/categories.json. Shape:
     *  { primary: string[], secondary: Record<string, string[]> } */
    customCategoriesJson: text('custom_categories_json'),
    /** AutoFix job-coordination blob. See migration 0019 for shape. */
    autofixState: text('autofix_state'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .$onUpdate(() => new Date()).notNull(),
}, (t) => [
    index('workspace_userId_idx').on(t.userId),
]);

export const workspaceMember = sqliteTable('workspace_member', {
    id:          text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId:      text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role:        text('role').notNull().default('member'),
    invitedAt:   integer('invited_at',  { mode: 'timestamp_ms' }),
    joinedAt:    integer('joined_at',   { mode: 'timestamp_ms' }),
    createdAt:   integer('created_at',  { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, (t) => [
    unique('workspace_member_unique').on(t.workspaceId, t.userId),
    index('workspace_member_workspaceId_idx').on(t.workspaceId),
    index('workspace_member_userId_idx').on(t.userId),
]);

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
    user:    one(user, { fields: [workspace.userId], references: [user.id] }),
    members: many(workspaceMember),
}));

export const workspaceMemberRelations = relations(workspaceMember, ({ one }) => ({
    workspace: one(workspace, { fields: [workspaceMember.workspaceId], references: [workspace.id] }),
    user:      one(user,      { fields: [workspaceMember.userId],      references: [user.id] }),
}));
