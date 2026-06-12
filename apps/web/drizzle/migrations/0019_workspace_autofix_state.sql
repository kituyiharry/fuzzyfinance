-- Workspace-scoped AutoFix coordination.
-- JSON-encoded text storing the current job state:
--   {
--     status:       'idle' | 'running',
--     startedAt?:   ISO-8601,
--     completedAt?: ISO-8601,
--     summary?:     { uniqueDescriptions, linesUpdated, headersUpdated, skipped },
--     error?:       string
--   }
--
-- Used by /api/workspaces/[id]/autofix as a soft mutex so a second user
-- click while a run is still in flight returns 409 instead of starting a
-- duplicate. Stale-lock recovery is enforced in the endpoint (any
-- `running` state older than 15 minutes is treated as abandoned).

ALTER TABLE `workspace` ADD COLUMN `autofix_state` TEXT;
