CREATE TABLE `announcement` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`type` text DEFAULT 'info' NOT NULL,
	`show_banner` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`published_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcement_active_idx` ON `announcement` (`active`);