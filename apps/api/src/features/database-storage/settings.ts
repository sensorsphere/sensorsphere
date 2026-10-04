export interface DatabaseStorageSettings {
  snapshotIntervalHours: number;
  snapshotRetentionDays: number;
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!raw?.trim()) return fallback;
  if (!/^\d+$/.test(raw.trim())) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

export function databaseStorageSettings(): DatabaseStorageSettings {
  return {
    snapshotIntervalHours: positiveInteger(
      process.env.SENSORSPHERE_DB_STORAGE_SNAPSHOT_INTERVAL_HOURS,
      6,
      1,
      168
    ),
    snapshotRetentionDays: positiveInteger(
      process.env.SENSORSPHERE_DB_STORAGE_SNAPSHOT_RETENTION_DAYS,
      90,
      1,
      3650
    )
  };
}
