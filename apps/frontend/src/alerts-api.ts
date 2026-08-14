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

export interface AlertRule {
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

  assetId: string;
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

export interface AlertEvent {
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

export interface ActiveAlert {
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

  ruleName: string;
  conditionType: AlertConditionType;

  assetExternalId: string;
  assetDisplayName: string;

  metricKey: string | null;
  metricDisplayName: string | null;
  unit: string | null;
}

async function readJson<T>(
  response: Response
): Promise<T> {

  if (!response.ok) {
    const body =
      await response
        .json()
        .catch(
          () => null
        );

    throw new Error(
      body?.error
      ?? `HTTP ${response.status}`
    );
  }

  return response.json();
}

export async function getAlertRules():
Promise<AlertRule[]> {

  const response =
    await fetch(
      "/api/v1/alert-rules"
    );

  return readJson<AlertRule[]>(
    response
  );
}

export async function getActiveAlerts():
Promise<ActiveAlert[]> {

  const response =
    await fetch(
      "/api/v1/alerts/active"
    );

  return readJson<ActiveAlert[]>(
    response
  );
}

export async function acknowledgeAlert(
  id: string
): Promise<ActiveAlert> {

  const response =
    await fetch(
      `/api/v1/alerts/${id}/ack`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({})
      }
    );

  return readJson<ActiveAlert>(
    response
  );
}

export async function createAlertRule(
  input: CreateAlertRuleInput
): Promise<AlertRule> {

  const response =
    await fetch(
      "/api/v1/alert-rules",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<AlertRule>(
    response
  );
}

export async function updateAlertRule(
  id: string,
  input: UpdateAlertRuleInput
): Promise<AlertRule> {

  const response =
    await fetch(
      `/api/v1/alert-rules/${id}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<AlertRule>(
    response
  );
}

export async function deleteAlertRule(
  id: string
): Promise<void> {

  const response =
    await fetch(
      `/api/v1/alert-rules/${id}`,
      {
        method: "DELETE"
      }
    );

  if (!response.ok) {
    const body =
      await response
        .json()
        .catch(
          () => null
        );

    throw new Error(
      body?.error
      ?? `HTTP ${response.status}`
    );
  }
}

export async function getAlertHistory(
  limit: number,
  status?: AlertEventStatus
): Promise<AlertEvent[]> {

  const params =
    new URLSearchParams({
      limit:
        String(limit)
    });

  if (status) {
    params.set(
      "status",
      status
    );
  }

  const response =
    await fetch(
      `/api/v1/alerts/history?${params.toString()}`
    );

  return readJson<AlertEvent[]>(
    response
  );
}
