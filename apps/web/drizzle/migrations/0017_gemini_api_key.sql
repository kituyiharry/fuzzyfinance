-- Per-workspace Gemini API key. Used as the second-priority credential
-- source for the Gemini-based category classifier; OAuth via the user's
-- Google integration (with the generative-language.retriever scope) is
-- tried first. Either alone is enough; neither present skips Gemini.
--
-- Stored as plaintext for now. A future migration can flip this to an
-- encrypted column wrapped by Workers secrets without renaming.

ALTER TABLE `workspace` ADD COLUMN `gemini_api_key` TEXT;
