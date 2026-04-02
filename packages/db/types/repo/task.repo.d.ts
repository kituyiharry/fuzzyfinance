/**
 * @import {Task, CreateTask} from "../schema"
 * @typedef {typeof import("../schema")} Schema
 *
 * @import  { LibSQLDatabase } from 'drizzle-orm/libsql'
 * @import  { DrizzleD1Database } from 'drizzle-orm/d1'
 *
 * @typedef {LibSQLDatabase<Schema> & { $client: import('@libsql/client/.').Client }} Database
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
export type Schema = typeof import("../schema");
export type Database = LibSQLDatabase<Schema> & {
    $client: import("@libsql/client/.").Client;
};
import type { Task } from "../schema";
import type { CreateTask } from "../schema";
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
