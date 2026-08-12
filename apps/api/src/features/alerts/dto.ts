export type AlertSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type AlertConditionType =
  | "ABOVE"
  | "BELOW"
  | "BETWEEN"
  | "OUTSIDE"
  | "OFFLINE"
  | "NO_DATA";

export type AlertEventStatus =
  | "ACTIVE"
  | "ACKNOWLEDGED"
  | "RESOLVED";

export interface AlertRuleDto {
  id: string;

  name: string;
  description: string | null;

  enabled: boolean;

  severity: AlertSeverity;
  conditionType: AlertConditionType;

  assetId: string | null;
  assetMetricId: string | null;

  thresholdMin: number | null;
  thresholdMax: number | null;

  durationSeconds: number;
  cooldownSeconds: number;

  metadata:
    Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRuleInput {
  name: string;
  description?: string | null;

  enabled?: boolean;

  severity: AlertSeverity;
  conditionType: AlertConditionType;

  assetId?: string | null;
  assetMetricId?: string | null;

  thresholdMin?: number | null;
  thresholdMax?: number | null;

  durationSeconds?: number;
  cooldownSeconds?: number;

  metadata?:
    Record<string, unknown>;
}

export interface UpdateAlertRuleInput {
  name?: string;
  description?: string | null;

  enabled?: boolean;

  severity?: AlertSeverity;
  conditionType?: AlertConditionType;

  assetId?: string | null;
  assetMetricId?: string | null;

  thresholdMin?: number | null;
  thresholdMax?: number | null;

  durationSeconds?: number;
  cooldownSeconds?: number;

  metadata?:
    Record<string, unknown>;
}

export interface AlertEventDto {
  id: string;

  ruleId: string;
  assetId: string;
  assetMetricId: string | null;

  status: AlertEventStatus;
  severity: AlertSeverity;

  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;

  currentValue: number | null;
  triggerValue: number | null;

  message: string;

  metadata:
    Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface ActiveAlertDto
extends AlertEventDto {
  ruleName: string;
  conditionType: AlertConditionType;

  assetExternalId: string;
  assetDisplayName: string;

  metricKey: string | null;
  metricDisplayName: string | null;
  unit: string | null;
}

export interface CreateAlertEventInput {
  ruleId: string;
  assetId: string;
  assetMetricId?: string | null;

  severity: AlertSeverity;

  currentValue?: number | null;
  triggerValue?: number | null;

  message: string;

  metadata?:
    Record<string, unknown>;
}

export interface AcknowledgeAlertInput {
  acknowledgedBy?: string | null;
  comment?: string | null;
}
