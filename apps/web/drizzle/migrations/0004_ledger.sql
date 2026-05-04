CREATE TABLE `payable` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `receipt_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `opened_at` integer NOT NULL,
  `closed_at` integer,
  `created_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  `updated_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payable_receipt_id_unique` ON `payable` (`receipt_id`);
--> statement-breakpoint
CREATE INDEX `payable_userId_idx` ON `payable` (`user_id`);
--> statement-breakpoint
CREATE INDEX `payable_userId_status_idx` ON `payable` (`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE `payable_update` (
  `id` text PRIMARY KEY NOT NULL,
  `payable_id` text NOT NULL,
  `note` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  FOREIGN KEY (`payable_id`) REFERENCES `payable`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payable_update_payableId_idx` ON `payable_update` (`payable_id`);
--> statement-breakpoint
CREATE TABLE `receivable` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `sale_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `opened_at` integer NOT NULL,
  `closed_at` integer,
  `created_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  `updated_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receivable_sale_id_unique` ON `receivable` (`sale_id`);
--> statement-breakpoint
CREATE INDEX `receivable_userId_idx` ON `receivable` (`user_id`);
--> statement-breakpoint
CREATE INDEX `receivable_userId_status_idx` ON `receivable` (`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE `receivable_update` (
  `id` text PRIMARY KEY NOT NULL,
  `receivable_id` text NOT NULL,
  `note` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  FOREIGN KEY (`receivable_id`) REFERENCES `receivable`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receivable_update_receivableId_idx` ON `receivable_update` (`receivable_id`);
