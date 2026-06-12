-- If you want to force-clear a stuck row right now without waiting out the 15-minute window:
UPDATE workspace
SET    autofix_state = json_object('status', 'idle')
WHERE  id = '<workspace-id>';

