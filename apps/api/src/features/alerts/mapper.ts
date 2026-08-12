import type {
  ActiveAlertDto,
  AlertEventDto,
  AlertRuleDto
} from "./dto.js";

import type {
  ActiveAlertRecord,
  AlertEventRecord,
  AlertRuleRecord
} from "./repository.js";

export function mapAlertRuleToDto(
  record: AlertRuleRecord
): AlertRuleDto {

  return {
    id:
      record.id,

    name:
      record.name,

    description:
      record.description,

    enabled:
      record.enabled,

    severity:
      record.severity,

    conditionType:
      record.condition_type,

    assetId:
      record.asset_id,

    assetMetricId:
      record.asset_metric_id,

    thresholdMin:
      record.threshold_min,

    thresholdMax:
      record.threshold_max,

    durationSeconds:
      record.duration_seconds,

    cooldownSeconds:
      record.cooldown_seconds,

    metadata:
      record.metadata,

    createdAt:
      record.created_at.toISOString(),

    updatedAt:
      record.updated_at.toISOString()
  };
}

export function mapAlertEventToDto(
  record: AlertEventRecord
): AlertEventDto {

  return {
    id:
      record.id,

    ruleId:
      record.rule_id,

    assetId:
      record.asset_id,

    assetMetricId:
      record.asset_metric_id,

    status:
      record.status,

    severity:
      record.severity,

    openedAt:
      record.opened_at.toISOString(),

    acknowledgedAt:
      record.acknowledged_at
        ? record.acknowledged_at
            .toISOString()
        : null,

    resolvedAt:
      record.resolved_at
        ? record.resolved_at
            .toISOString()
        : null,

    currentValue:
      record.current_value,

    triggerValue:
      record.trigger_value,

    message:
      record.message,

    metadata:
      record.metadata,

    createdAt:
      record.created_at.toISOString(),

    updatedAt:
      record.updated_at.toISOString()
  };
}

export function mapActiveAlertToDto(
  record: ActiveAlertRecord
): ActiveAlertDto {

  return {
    ...mapAlertEventToDto(
      record
    ),

    ruleName:
      record.rule_name,

    conditionType:
      record.condition_type,

    assetExternalId:
      record.asset_external_id,

    assetDisplayName:
      record.asset_display_name,

    metricKey:
      record.metric_key,

    metricDisplayName:
      record.metric_display_name,

    unit:
      record.unit
  };
}
