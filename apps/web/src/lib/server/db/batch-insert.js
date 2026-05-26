/** D1's hard limit on bound parameters per SQL statement. */
const D1_MAX_VARS = 100;

/**
 * Insert rows in chunks to avoid D1's 100-variable-per-statement limit.
 * Chunk size is calculated automatically from the row's column count so it
 * stays valid as the schema grows. Uses db.batch() for a single round-trip.
 *
 * @param {any} db - Drizzle D1 instance
 * @param {any} table - Drizzle table reference
 * @param {any[]} rows - rows to insert
 * @param {number} [chunkSize] - override auto-calculated rows per INSERT statement
 */
export async function batchInsert(db, table, rows, chunkSize) {
	if (!rows.length) return;
	const numCols = Object.keys(rows[0]).length;
	const effectiveChunkSize = chunkSize ?? Math.max(1, Math.floor(D1_MAX_VARS / numCols));
	const chunks = [];
	for (let i = 0; i < rows.length; i += effectiveChunkSize) {
		chunks.push(rows.slice(i, i + effectiveChunkSize));
	}
	await db.batch(chunks.map((chunk) => db.insert(table).values(chunk)));
}
