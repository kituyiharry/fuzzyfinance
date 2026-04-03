import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { schema } from '@fuzzyfinance/db';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = createClient({ url: env.DATABASE_URL });

export const db = drizzle(client, { schema });

// export const taskRepository = repo.createTaskRepository(db);
