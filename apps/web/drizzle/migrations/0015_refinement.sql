-- Refinement feature: editable line-item categories, custom workspace
-- categories, and tax-as-line-item from Xero sync.
--
-- `kind` on line items distinguishes editable lines from system-generated
-- ones (the `tax` synthetic line written by the Xero sync, which the user
-- can re-categorise but not delete or alter the amount of). Default is
-- `'standard'` so existing rows behave unchanged.
--
-- `custom_categories_json` on workspace stores user-defined primary and
-- secondary categories that augment the built-in `categories.json`.
-- Shape: { "primary": ["Foo"], "secondary": { "Foo": ["Bar"] } }

ALTER TABLE `receipt_line_item` ADD COLUMN `kind` TEXT NOT NULL DEFAULT 'standard';
--> statement-breakpoint
ALTER TABLE `sale_line_item`    ADD COLUMN `kind` TEXT NOT NULL DEFAULT 'standard';
--> statement-breakpoint
ALTER TABLE `workspace`         ADD COLUMN `custom_categories_json` TEXT;
