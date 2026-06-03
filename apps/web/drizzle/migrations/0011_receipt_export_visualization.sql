CREATE TABLE `receipt_export_visualization` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`receipt_export_id` text NOT NULL,
	`analyzer_version` text NOT NULL,
	`r2_key` text NOT NULL,
	`node_count` integer DEFAULT 0 NOT NULL,
	`link_count` integer DEFAULT 0 NOT NULL,
	`generated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receipt_export_id`) REFERENCES `receipt_export`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_export_viz_userId_idx` ON `receipt_export_visualization` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_export_viz_export_version_unique` ON `receipt_export_visualization` (`receipt_export_id`, `analyzer_version`);
