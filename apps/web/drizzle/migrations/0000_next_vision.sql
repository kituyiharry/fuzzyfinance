CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `integration` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_email` text,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` integer,
	`scopes` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `integration_userId_idx` ON `integration` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_userId_provider_unq` ON `integration` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`merchant_name` text,
	`receipt_date` integer,
	`total` text,
	`subtotal` text,
	`tax` text,
	`tip` text,
	`currency` text,
	`payment_method` text,
	`category` text,
	`notes` text,
	`line_items_json` text,
	`r2_key` text,
	`raw_file_name` text,
	`raw_mime_type` text,
	`raw_size_bytes` integer,
	`drive_file_id` text,
	`drive_provider` text,
	`sheet_id` text,
	`sheet_provider` text,
	`vector_id` text,
	`error_message` text,
	`ai_extracted_json` text,
	`corrected_fields` text,
	`tags` text,
	`file_hash` text,
	`receipt_number` text,
	`invoice_number` text,
	`duplicate_of` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_userId_idx` ON `receipt` (`user_id`);--> statement-breakpoint
CREATE INDEX `receipt_status_idx` ON `receipt` (`status`);--> statement-breakpoint
CREATE INDEX `receipt_userId_receiptDate_idx` ON `receipt` (`user_id`,`receipt_date`);--> statement-breakpoint
CREATE INDEX `receipt_userId_createdAt_idx` ON `receipt` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `receipt_userId_fileHash_idx` ON `receipt` (`user_id`,`file_hash`);--> statement-breakpoint
CREATE INDEX `receipt_userId_receiptNumber_idx` ON `receipt` (`user_id`,`receipt_number`);--> statement-breakpoint
CREATE TABLE `receipt_line_item` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`description` text,
	`qty` text,
	`unit_price` text,
	`total` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_line_item_receiptId_idx` ON `receipt_line_item` (`receipt_id`);--> statement-breakpoint
CREATE TABLE `receipt_export` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`receipt_count` integer DEFAULT 0 NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`csv_data` text NOT NULL,
	`receipt_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_export_userId_idx` ON `receipt_export` (`user_id`);--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_userId_idx` ON `conversation` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversation_userId_createdAt_idx` ON `conversation` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sale` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`document_title` text,
	`sale_date` integer,
	`total_revenue` text,
	`total_cost` text,
	`total_margin` text,
	`currency` text,
	`category` text,
	`notes` text,
	`tags` text,
	`line_items_json` text,
	`r2_key` text,
	`raw_file_name` text,
	`raw_mime_type` text,
	`raw_size_bytes` integer,
	`file_hash` text,
	`drive_file_id` text,
	`drive_provider` text,
	`sheet_id` text,
	`sheet_provider` text,
	`vector_id` text,
	`ai_extracted_json` text,
	`corrected_fields` text,
	`error_message` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_userId_idx` ON `sale` (`user_id`);--> statement-breakpoint
CREATE INDEX `sale_userId_status_idx` ON `sale` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `sale_userId_saleDate_idx` ON `sale` (`user_id`,`sale_date`);--> statement-breakpoint
CREATE INDEX `sale_userId_fileHash_idx` ON `sale` (`user_id`,`file_hash`);--> statement-breakpoint
CREATE TABLE `sale_line_item` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`description` text,
	`type` text,
	`units_sold` text,
	`buy_price` text,
	`sell_price` text,
	`margin` text,
	`total` text,
	`total_cost` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_line_item_saleId_idx` ON `sale_line_item` (`sale_id`);