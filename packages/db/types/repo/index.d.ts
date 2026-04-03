export type Schema = typeof import("../schema");
export type Database = LibSQLDatabase<Schema> & {
    $client: import("@libsql/client/.").Client;
};
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
