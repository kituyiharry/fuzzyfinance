CREATE INDEX `receipt_userId_receiptDate_idx` ON `receipt` (`user_id`,`receipt_date`);--> statement-breakpoint
CREATE INDEX `receipt_userId_createdAt_idx` ON `receipt` (`user_id`,`created_at`);