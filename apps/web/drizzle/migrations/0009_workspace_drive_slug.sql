ALTER TABLE `workspace` ADD COLUMN `drive_slug` TEXT;
--> statement-breakpoint
UPDATE `workspace` SET `drive_slug` = `name` WHERE `is_default` = 0;
