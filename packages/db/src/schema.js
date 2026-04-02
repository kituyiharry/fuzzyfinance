import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * @typedef {typeof task.$inferSelect} Task
 * @typedef {typeof task.$inferInsert} CreateTask
 * Task table schema.
 */
export const task = sqliteTable('task', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

export * from './auth.schema.js';
