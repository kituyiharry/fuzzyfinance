import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '@fuzzyfinance/db';
import { env } from '$env/dynamic/private';
import { createTaskRepository } from '@fuzzyfinance/db';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = createClient({ url: env.DATABASE_URL });

export const db = drizzle(client, { schema });

export const taskRepository = createTaskRepository(db);
