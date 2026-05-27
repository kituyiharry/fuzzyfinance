CREATE TABLE `workspace` (
    `id` TEXT PRIMARY KEY,
    `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `name` TEXT NOT NULL,
    `is_default` INTEGER NOT NULL DEFAULT 0,
    `created_at` INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    `updated_at` INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
--> statement-breakpoint
CREATE INDEX `workspace_userId_idx` ON `workspace` (`user_id`);
--> statement-breakpoint
CREATE TABLE `workspace_member` (
    `id` TEXT PRIMARY KEY,
    `workspace_id` TEXT NOT NULL REFERENCES `workspace`(`id`) ON DELETE CASCADE,
    `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `role` TEXT NOT NULL DEFAULT 'member',
    `invited_at` INTEGER,
    `joined_at` INTEGER,
    `created_at` INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_member_unique` ON `workspace_member` (`workspace_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX `workspace_member_workspaceId_idx` ON `workspace_member` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `workspace_member_userId_idx` ON `workspace_member` (`user_id`);
--> statement-breakpoint
ALTER TABLE `receipt` ADD COLUMN `workspace_id` TEXT REFERENCES `workspace`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `sale` ADD COLUMN `workspace_id` TEXT REFERENCES `workspace`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `receipt_export` ADD COLUMN `workspace_id` TEXT REFERENCES `workspace`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `conversation` ADD COLUMN `workspace_id` TEXT REFERENCES `workspace`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX `receipt_workspaceId_idx` ON `receipt` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `sale_workspaceId_idx` ON `sale` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `receipt_export_workspaceId_idx` ON `receipt_export` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `conversation_workspaceId_idx` ON `conversation` (`workspace_id`);
--> statement-breakpoint
INSERT INTO `workspace` (`id`, `user_id`, `name`, `is_default`)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))),
    `id`, 'Personal', 1
FROM `user`;
--> statement-breakpoint
UPDATE `receipt` SET `workspace_id` = (
    SELECT `id` FROM `workspace` WHERE `user_id` = `receipt`.`user_id` AND `is_default` = 1 LIMIT 1
) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `sale` SET `workspace_id` = (
    SELECT `id` FROM `workspace` WHERE `user_id` = `sale`.`user_id` AND `is_default` = 1 LIMIT 1
) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `receipt_export` SET `workspace_id` = (
    SELECT `id` FROM `workspace` WHERE `user_id` = `receipt_export`.`user_id` AND `is_default` = 1 LIMIT 1
) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `conversation` SET `workspace_id` = (
    SELECT `id` FROM `workspace` WHERE `user_id` = `conversation`.`user_id` AND `is_default` = 1 LIMIT 1
) WHERE `workspace_id` IS NULL;
