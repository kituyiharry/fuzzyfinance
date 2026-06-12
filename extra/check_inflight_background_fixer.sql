SELECT id, name, json_extract(autofix_state, '$.startedAt') AS started_at
FROM workspace
WHERE json_extract(autofix_state, '$.status') = 'running';
