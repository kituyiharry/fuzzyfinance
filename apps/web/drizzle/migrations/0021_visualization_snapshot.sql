-- Coupled expense + revenue snapshot. One row holds pointers to both a
-- `receipt_export` (expense side) and a `sale_export` (revenue side) for
-- the same date range, so the visualization listing can show paired
-- entries and the viewer can render both sides side-by-side.
--
-- Either side may be NULL: if a date range has no qualifying
-- documents on one side, the snapshot is still saved with the other
-- side populated, so the user can later add the missing side without
-- losing the other.
--
-- Deleting a snapshot does NOT cascade to the underlying exports
-- automatically — the delete endpoint runs an explicit cleanup so
-- the cascading R2 + visualization-row teardown stays in one place.

CREATE TABLE `visualization_snapshot` (
    `id`                TEXT PRIMARY KEY NOT NULL,
    `user_id`           TEXT NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
    `workspace_id`      TEXT REFERENCES `workspace` (`id`) ON DELETE CASCADE,

    /* Human-readable label — defaults to the range in the endpoint. */
    `label`             TEXT NOT NULL DEFAULT '',
    `range_start`       TEXT NOT NULL,  -- YYYY-MM-DD
    `range_end`         TEXT NOT NULL,  -- YYYY-MM-DD

    /* Receipt export ID (expense side) or NULL when no expense data. */
    `receipt_export_id` TEXT REFERENCES `receipt_export` (`id`) ON DELETE SET NULL,
    /* Sale export ID (revenue side) or NULL when no revenue data. */
    `sale_export_id`    TEXT REFERENCES `sale_export` (`id`) ON DELETE SET NULL,

    `created_at`        INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
--> statement-breakpoint
CREATE INDEX `visualization_snapshot_userId_idx` ON `visualization_snapshot` (`user_id`);
--> statement-breakpoint
CREATE INDEX `visualization_snapshot_workspaceId_idx` ON `visualization_snapshot` (`workspace_id`);
