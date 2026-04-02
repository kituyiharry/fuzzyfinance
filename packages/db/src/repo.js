import { eq } from 'drizzle-orm';
import { task } from './schema.js';

/**
 * @import {Task, CreateTask} from "./schema.js"
 * @typedef {typeof import("./schema")} Schema
 *
 * @import  { LibSQLDatabase } from 'drizzle-orm/libsql' 
 * @import  { DrizzleD1Database } from 'drizzle-orm/d1'
 *
 * @typedef {LibSQLDatabase<Schema> & { $client: import('@libsql/client/.').Client }} Database
 */

/**
 * @param {Database} db
 */
export function createTaskRepository(db) {
	return {
		/**
		 * @returns {Promise<Task[]>}
		 */
		async findAll() {
			const tasks = await db.select().from(task);
			return tasks;
		},

		/**
		 * @param {CreateTask} data
		 * @returns {Promise<Task>}
		 */
		async create(data) {
			const [newTask] = await db.insert(task).values(data).returning();
			return newTask;
		},

		/**
		 * @param {string} id
		 * @returns {Promise<Task | undefined>}
		 */
		async findById(id) {
			const [found] = await db.select().from(task).where(eq(task.id, id));
			return found;
		},

		/**
		 * @param {string} id
		 * @returns {Promise<void>}
		 */
		async delete(id) {
			await db.delete(task).where(eq(task.id, id));
		}
	};
}
