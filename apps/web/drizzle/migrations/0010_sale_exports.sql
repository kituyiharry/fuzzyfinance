CREATE TABLE `sale_export` (
    `id` TEXT PRIMARY KEY,
    `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `workspace_id` TEXT REFERENCES `workspace`(`id`) ON DELETE CASCADE,
    `file_name` TEXT NOT NULL,
    `sale_count` INTEGER NOT NULL DEFAULT 0,
    `row_count` INTEGER NOT NULL DEFAULT 0,
    `csv_data` TEXT NOT NULL,
    `sale_ids` TEXT NOT NULL DEFAULT '[]',
    `created_at` INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
--> statement-breakpoint
CREATE INDEX `sale_export_userId_idx` ON `sale_export` (`user_id`);
--> statement-breakpoint
CREATE INDEX `sale_export_workspaceId_idx` ON `sale_export` (`workspace_id`);
