ALTER TABLE `receipt` ADD `file_hash` text;--> statement-breakpoint
ALTER TABLE `receipt` ADD `receipt_number` text;--> statement-breakpoint
ALTER TABLE `receipt` ADD `invoice_number` text;--> statement-breakpoint
ALTER TABLE `receipt` ADD `duplicate_of` text;--> statement-breakpoint
CREATE INDEX `receipt_userId_fileHash_idx` ON `receipt` (`user_id`,`file_hash`);--> statement-breakpoint
CREATE INDEX `receipt_userId_receiptNumber_idx` ON `receipt` (`user_id`,`receipt_number`);