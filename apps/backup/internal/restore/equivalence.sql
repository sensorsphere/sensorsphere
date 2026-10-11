WITH observation_sample AS (
  SELECT
    time,
    asset_metric_id,
    value_double,
    value_text,
    value_boolean,
    value_json,
    source,
    source_ref,
    quality
  FROM observations
  ORDER BY time ASC, asset_metric_id ASC
  LIMIT 100
),
observation_checksum AS (
  SELECT md5(COALESCE(string_agg(
    concat_ws('|',
      time::text,
      asset_metric_id::text,
      COALESCE(value_double::text, ''),
      COALESCE(value_text, ''),
      COALESCE(value_boolean::text, ''),
      COALESCE(value_json::text, ''),
      COALESCE(source, ''),
      COALESCE(source_ref, ''),
      COALESCE(quality::text, '')
    ),
    E'\n' ORDER BY time ASC, asset_metric_id ASC
  ), '')) AS checksum
  FROM observation_sample
)
SELECT jsonb_pretty(jsonb_build_object(
  'capturedAt', now(),
  'database', current_database(),
  'migrationLevel', (SELECT COALESCE(MAX(version), 0) FROM schema_migrations),
  'deviceRegistryDeviceCount', (SELECT COUNT(*) FROM device_registry_devices),
  'identityCount', (SELECT COUNT(*) FROM device_registry_identities),
  'entityCount', (SELECT COUNT(*) FROM device_registry_entities),
  'deviceCheckCount', (SELECT COUNT(*) FROM monitoring_checks),
  'slotCounts', jsonb_build_object(
    'deviceAgentSlots', (SELECT COUNT(*) FROM device_agent_slots),
    'monitoringAgentSlots', (SELECT COUNT(*) FROM monitoring_agent_slots),
    'monitoringCheckSlots', (SELECT COUNT(*) FROM monitoring_check_slots)
  ),
  'agentCounts', jsonb_build_object(
    'deviceAgents', (SELECT COUNT(*) FROM device_agents),
    'monitoringAgents', (SELECT COUNT(*) FROM monitoring_agents),
    'supervisorAgents', (SELECT COUNT(*) FROM supervisor_agents)
  ),
  'projectAdminCounts', jsonb_build_object(
    'projectTodoSections', (SELECT COUNT(*) FROM project_todo_sections),
    'projectTodos', (SELECT COUNT(*) FROM project_todos),
    'users', (SELECT COUNT(*) FROM users),
    'admins', (SELECT COUNT(*) FROM users WHERE lower(role) = 'admin')
  ),
  'lifecycleCounts', jsonb_build_object(
    'controlEntityExclusionsActive', (SELECT COUNT(*) FROM device_control_entity_exclusions WHERE removed_at IS NULL),
    'controlEntityExclusionsRemoved', (SELECT COUNT(*) FROM device_control_entity_exclusions WHERE removed_at IS NOT NULL)
  ),
  'observations', jsonb_build_object(
    'count', (SELECT COUNT(*) FROM observations),
    'earliest', (SELECT MIN(time) FROM observations),
    'latest', (SELECT MAX(time) FROM observations),
    'representativeSampleRows', (SELECT COUNT(*) FROM observation_sample),
    'representativeChecksum', (SELECT checksum FROM observation_checksum)
  )
));
