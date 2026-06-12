SELECT
    id,
    name,
    json_extract(autofix_state, '$.status')      AS status,
    json_extract(autofix_state, '$.runId')       AS run_id,
    json_extract(autofix_state, '$.startedAt')   AS started_at,
    json_extract(autofix_state, '$.progress.phase')         AS phase,
    json_extract(autofix_state, '$.progress.linesUpdated')  AS lines_updated,
    json_extract(autofix_state, '$.progress.updatedAt')     AS last_heartbeat
FROM workspace
WHERE user_id = '<user-uuid>';
