import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Platform announcements — written directly to the database (no admin UI in apps/web).
 * Used for release notes, maintenance notices, and informational banners.
 */
export const announcement = sqliteTable('announcement', {
	id:    text('id').primaryKey(),
	title: text('title').notNull(),
	/** Plain text or markdown body */
	body:  text('body'),
	/** 'info' | 'warning' | 'maintenance' | 'release' */
	type:  text('type').notNull().default('info'),
	/** When true, rendered as a dismissible banner across all dashboard pages */
	showBanner: integer('show_banner', { mode: 'boolean' }).notNull().default(false),
	active:     integer('active',      { mode: 'boolean' }).notNull().default(true),
	/** When the announcement became visible to users */
	publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
	/** Optional: announcement auto-hides after this timestamp */
	expiresAt:   integer('expires_at',   { mode: 'timestamp_ms' }),
	createdAt:   integer('created_at',   { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
}, (table) => [
	index('announcement_active_idx').on(table.active),
]);
