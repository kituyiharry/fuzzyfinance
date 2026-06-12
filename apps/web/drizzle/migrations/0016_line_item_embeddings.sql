-- Line-item embeddings: tracks which line items had their primary /
-- secondary categories filled by the kNN suggestor (vs. set by the user).
--
-- When the user opens a line in the refinement editor and changes the
-- category, the flag is cleared on save — that line then becomes a
-- training neighbour for future suggestions. AI-suggested lines do NOT
-- feed back into the index; only user-confirmed labels do.

ALTER TABLE `receipt_line_item` ADD COLUMN `ai_suggested` INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `sale_line_item`    ADD COLUMN `ai_suggested` INTEGER NOT NULL DEFAULT 0;
