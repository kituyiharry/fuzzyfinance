/**
 * @import {Task, CreateTask} from "./schema.js"
 * @typedef {import('drizzle-orm/libsql').LibSQLDatabase} Database
 */
/**
 * @param {Database} db
 */
export function createTaskRepository(db: Database): {
    /**
     * @returns {Promise<Task[]>}
     */
    findAll(): Promise<Task[]>;
    /**
     * @param {CreateTask} data
     * @returns {Promise<Task>}
     */
    create(data: CreateTask): Promise<Task>;
    /**
     * @param {string} id
     * @returns {Promise<Task | undefined>}
     */
    findById(id: string): Promise<Task | undefined>;
    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    delete(id: string): Promise<void>;
};
export type Database = import("drizzle-orm/libsql").LibSQLDatabase;
import type { Task } from "./schema.js";
import type { CreateTask } from "./schema.js";
