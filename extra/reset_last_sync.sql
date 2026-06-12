UPDATE integration SET metadata_json = json_patch(metadata_json, json_object('lastSyncedAt', json('null'))) WHERE provider='xero' AND user_id = '';
