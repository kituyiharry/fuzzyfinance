/**
 * Insert rows in chunks to avoid D1's SQLite variable limit (~100 params/statement).
 * Uses db.batch() so all chunks execute atomically in a single network round-trip.
 *
 * @param {any} db - Drizzle D1 instance
 * @param {any} table - Drizzle table reference
 * @param {any[]} rows - rows to insert
 * @param {number} chunkSize - rows per INSERT statement
 */
export async function batchInsert(db, table, rows, chunkSize = 10) {
	if (!rows.length) return;
	const chunks = [];
	for (let i = 0; i < rows.length; i += chunkSize) {
		chunks.push(rows.slice(i, i + chunkSize));
	}
	await db.batch(chunks.map((chunk) => db.insert(table).values(chunk)));
}
