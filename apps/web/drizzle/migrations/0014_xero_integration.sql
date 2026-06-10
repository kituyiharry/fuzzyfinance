-- Xero integration: document origin tracking on receipt + sale.
--
-- `external_source` — discriminator for where the row came from. NULL for
-- legacy manual uploads. Examples once Xero sync lands:
--   'xero-invoice-accrec'   sales invoice (revenue)
--   'xero-invoice-accpay'   accounts-payable invoice (expense)
--   'xero-bank-tx-spend'    bank transaction, outflow
--   'xero-bank-tx-receive'  bank transaction, inflow
--   'upload'                explicit tag for manual-upload rows (optional)
--
-- `external_account_id` — the upstream entity's stable ID (Xero InvoiceID
-- GUID, BankTransactionID, etc.) used for idempotent upsert on resync.

ALTER TABLE `receipt` ADD COLUMN `external_source`     TEXT;
--> statement-breakpoint
ALTER TABLE `receipt` ADD COLUMN `external_account_id` TEXT;
--> statement-breakpoint
ALTER TABLE `sale`    ADD COLUMN `external_source`     TEXT;
--> statement-breakpoint
ALTER TABLE `sale`    ADD COLUMN `external_account_id` TEXT;
--> statement-breakpoint
CREATE INDEX `receipt_userId_externalSource_externalAccountId_idx`
    ON `receipt` (`user_id`, `external_source`, `external_account_id`);
--> statement-breakpoint
CREATE INDEX `sale_userId_externalSource_externalAccountId_idx`
    ON `sale`    (`user_id`, `external_source`, `external_account_id`);
