-- Roll back the per-workspace `gemini_api_key` column added in 0017.
-- Policy decision: API keys live in Worker secrets (`GEMINI_API_KEY`),
-- never in the database. The `gemini-classify.js` credential resolver
-- reads from `$env/dynamic/private`; per-workspace customisation isn't
-- needed for this pivot.
--
-- SQLite's `ALTER TABLE DROP COLUMN` is available from 3.35 (Workers D1
-- ships with a newer version), so this is a clean structural drop.

ALTER TABLE `workspace` DROP COLUMN `gemini_api_key`;
