import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type RetentionPolicyKey =
  | "observations"
  | "gateway_device_ble_observations"
  | "measurements"
  | "observation_hourly"
  | "gateway_traffic_events"
  | "metric_routing_events";

export type RetentionRisk =
  | "LOW_RISK"
  | "REVIEW_REQUIRED"
  | "DESTRUCTIVE";

export type RetentionMechanism =
  | "timescale"
  | "application";

export interface RetentionDefinition {
  key: RetentionPolicyKey;
  label: string;
  relation: string;
  mechanism: RetentionMechanism;
  preferredUnit: "hours" | "days";
  defaultSeconds: number | null;
  minimumSeconds: number;
  maximumSeconds: number;
  allowUnlimited: boolean;
  notes: string[];
}

export interface BackupSafetyStatus {
  required: boolean;
  ok: boolean;
  maxAgeHours: number;
  statePath: string;
  backupId: string | null;
  completedAt: string | null;
  ageHours: number | null;
  reason: string | null;
  verificationBasis: "successful-create" | null;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const RETENTION_DEFINITIONS: RetentionDefinition[] = [
  {
    key: "observations",
    label: "Observations · raw",
    relation: "observations",
    mechanism: "timescale",
    preferredUnit: "days",
    defaultSeconds: 90 * DAY,
    minimumSeconds: 7 * DAY,
    maximumSeconds: 3650 * DAY,
    allowUnlimited: true,
    notes: [
      "Long-range history still reads raw observations until DB-4 aggregation routing is complete."
    ]
  },
  {
    key: "gateway_device_ble_observations",
    label: "BLE observations · raw",
    relation: "gateway_device_ble_observations",
    mechanism: "timescale",
    preferredUnit: "days",
    defaultSeconds: 30 * DAY,
    minimumSeconds: DAY,
    maximumSeconds: 3650 * DAY,
    allowUnlimited: true,
    notes: [
      "Reducing this window removes historical BLE gateway/device coverage samples."
    ]
  },
  {
    key: "measurements",
    label: "Measurements · raw",
    relation: "measurements",
    mechanism: "timescale",
    preferredUnit: "days",
    defaultSeconds: null,
    minimumSeconds: DAY,
    maximumSeconds: 3650 * DAY,
    allowUnlimited: true,
    notes: [
      "Measurements feed sensor history, latest-value and alerting paths; finite retention is destructive."
    ]
  },
  {
    key: "observation_hourly",
    label: "Observations · hourly aggregate",
    relation: "observation_hourly",
    mechanism: "timescale",
    preferredUnit: "days",
    defaultSeconds: 365 * DAY,
    minimumSeconds: 30 * DAY,
    maximumSeconds: 3650 * DAY,
    allowUnlimited: true,
    notes: [
      "Hourly aggregate history is the long-term tier planned for DB-4."
    ]
  },
  {
    key: "gateway_traffic_events",
    label: "Gateway traffic diagnostics",
    relation: "gateway_traffic_events",
    mechanism: "application",
    preferredUnit: "hours",
    defaultSeconds: 48 * HOUR,
    minimumSeconds: 6 * HOUR,
    maximumSeconds: 90 * DAY,
    allowUnlimited: true,
    notes: [
      "The ingestion service evaluates this setting hourly; DELETE frees reusable PostgreSQL space but does not normally shrink the relation file."
    ]
  },
  {
    key: "metric_routing_events",
    label: "Metric routing diagnostics",
    relation: "metric_routing_events",
    mechanism: "application",
    preferredUnit: "hours",
    defaultSeconds: 48 * HOUR,
    minimumSeconds: 6 * HOUR,
    maximumSeconds: 90 * DAY,
    allowUnlimited: true,
    notes: [
      "The ingestion service evaluates this setting hourly; DELETE frees reusable PostgreSQL space but does not normally shrink the relation file."
    ]
  }
];

const definitionByKey = new Map(
  RETENTION_DEFINITIONS.map(definition => [definition.key, definition])
);

export function retentionDefinition(
  key: unknown
): RetentionDefinition {
  if (typeof key !== "string") {
    throw retentionError(400, "Retention policy key is required");
  }
  const definition = definitionByKey.get(key as RetentionPolicyKey);
  if (!definition) {
    throw retentionError(400, "Unsupported retention policy: " + key);
  }
  return definition;
}

export function validateRetentionSeconds(
  definition: RetentionDefinition,
  value: unknown
): number | null {
  if (value === null) {
    if (!definition.allowUnlimited) {
      throw retentionError(400, definition.label + " cannot be unlimited");
    }
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw retentionError(
      400,
      "retentionSeconds must be a positive integer or null for unlimited"
    );
  }

  if (
    value < definition.minimumSeconds ||
    value > definition.maximumSeconds
  ) {
    throw retentionError(
      400,
      definition.label + " retention must be between " +
        definition.minimumSeconds + " and " +
        definition.maximumSeconds + " seconds"
    );
  }

  return value;
}

export function retentionRisk(
  currentSeconds: number | null,
  requestedSeconds: number | null
): RetentionRisk {
  if (currentSeconds === requestedSeconds) return "LOW_RISK";

  if (requestedSeconds === null) {
    return "REVIEW_REQUIRED";
  }

  if (currentSeconds === null || requestedSeconds < currentSeconds) {
    return "DESTRUCTIVE";
  }

  return "REVIEW_REQUIRED";
}

export function retentionError(
  statusCode: number,
  message: string
): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

interface BackupRunState {
  command?: unknown;
  completedAt?: unknown;
  status?: unknown;
  phase?: unknown;
  backupId?: unknown;
}

export async function readBackupSafetyStatus(
  statePath: string,
  maxAgeHours: number,
  required: boolean,
  nowMs = Date.now()
): Promise<BackupSafetyStatus> {
  const base: BackupSafetyStatus = {
    required,
    ok: !required,
    maxAgeHours,
    statePath,
    backupId: null,
    completedAt: null,
    ageHours: null,
    reason: null,
    verificationBasis: null
  };

  if (!required) return base;

  try {
    const runsPath = path.join(statePath, "runs");
    const entries = await readdir(runsPath, { withFileTypes: true });
    const successfulCreates: Array<{
      backupId: string;
      completedAt: string;
      completedMs: number;
    }> = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(runsPath, entry.name), "utf8");
        const run = JSON.parse(raw) as BackupRunState;
        if (
          run.command !== "create" ||
          run.status !== "SUCCESS" ||
          run.phase !== "COMPLETE" ||
          typeof run.backupId !== "string" ||
          typeof run.completedAt !== "string"
        ) {
          continue;
        }
        const completedMs = Date.parse(run.completedAt);
        if (!Number.isFinite(completedMs)) continue;
        successfulCreates.push({
          backupId: run.backupId,
          completedAt: run.completedAt,
          completedMs
        });
      } catch {
        // Ignore a malformed historical state file and continue safely.
      }
    }

    successfulCreates.sort(
      (left, right) => right.completedMs - left.completedMs
    );
    const latest = successfulCreates[0];
    if (!latest) {
      return {
        ...base,
        ok: false,
        reason: "No successful Backup V2 create run was found"
      };
    }

    const ageHours = Math.max(
      0,
      (nowMs - latest.completedMs) / (60 * 60 * 1000)
    );
    const ok = ageHours <= maxAgeHours;

    return {
      ...base,
      ok,
      backupId: latest.backupId,
      completedAt: latest.completedAt,
      ageHours,
      reason: ok
        ? null
        : "Latest verified Recovery Point is older than " +
          maxAgeHours + " hours",
      verificationBasis: "successful-create"
    };
  } catch {
    return {
      ...base,
      ok: false,
      reason: "Backup V2 state is unavailable to the API"
    };
  }
}

export function retentionManagementSettings(): {
  backupStatePath: string;
  backupMaxAgeHours: number;
} {
  const parsed = Number(
    process.env.SENSORSPHERE_DB_RETENTION_BACKUP_MAX_AGE_HOURS ?? "26"
  );
  const backupMaxAgeHours =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= 24 * 30
      ? Math.trunc(parsed)
      : 26;

  return {
    backupStatePath:
      process.env.SENSORSPHERE_BACKUP_STATE_VIEW_PATH?.trim() || "/backup-state",
    backupMaxAgeHours
  };
}
