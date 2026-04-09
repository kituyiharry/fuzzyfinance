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
ALTER TABLE `receipt_export` ADD `receipt_ids` text DEFAULT '[]' NOT NULL;