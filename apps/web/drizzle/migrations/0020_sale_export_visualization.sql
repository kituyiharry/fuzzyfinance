-- Mirror of `receipt_export_visualization` for the revenue side of the
-- equation. Visualization listing + viewer now serve both sides:
-- each `sale_export` row can carry its own analyzer-versioned viz JSON
-- in R2, keyed under `visualizations/{userId}/{exportId}/{version}.json`
-- the same way receipt exports already are.

CREATE TABLE `sale_export_visualization` (
    `id`                TEXT PRIMARY KEY NOT NULL,
    `user_id`           TEXT NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
    `workspace_id`      TEXT REFERENCES `workspace` (`id`) ON DELETE CASCADE,
    `sale_export_id`    TEXT NOT NULL REFERENCES `sale_export` (`id`) ON DELETE CASCADE,
    `analyzer_version`  TEXT NOT NULL,
    `r2_key`            TEXT NOT NULL,
    `node_count`        INTEGER NOT NULL DEFAULT 0,
    `link_count`        INTEGER NOT NULL DEFAULT 0,
    `generated_at`      INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
--> statement-breakpoint
CREATE INDEX `sale_export_viz_userId_idx` ON `sale_export_visualization` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_export_viz_export_version_unique`
    ON `sale_export_visualization` (`sale_export_id`, `analyzer_version`);
