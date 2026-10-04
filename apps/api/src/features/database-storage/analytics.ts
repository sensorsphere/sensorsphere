export interface StorageHistoryPoint {
  capturedAt: string;
  databaseBytes: number;
  allocatedRelationBytes: number;
  dataBytes: number;
  indexBytes: number;
  toastBytes: number;
  relationCount: number;
  hypertableCount: number;
  chunkCount: number;
}

export interface StorageBudget {
  warningBytes: number | null;
  criticalBytes: number | null;
  status: "UNCONFIGURED" | "OK" | "WARNING" | "CRITICAL";
  configurationError: string | null;
}

export interface StorageAnalytics {
  growth: {
    bytes24h: number | null;
    bytes7d: number | null;
    bytes30d: number | null;
    averageDailyBytes: number | null;
  };
  projection: {
    bytes30d: number | null;
    bytes90d: number | null;
    bytes180d: number | null;
    bytes365d: number | null;
  };
  budget: StorageBudget;
}

function finiteNonNegative(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function storageBudgetFromEnv(
  currentBytes: number,
  warningRaw = process.env.SENSORSPHERE_DB_STORAGE_WARNING_BYTES,
  criticalRaw = process.env.SENSORSPHERE_DB_STORAGE_CRITICAL_BYTES
): StorageBudget {
  const warningBytes = finiteNonNegative(warningRaw);
  const criticalBytes = finiteNonNegative(criticalRaw);
  const suppliedWarning = Boolean(warningRaw?.trim());
  const suppliedCritical = Boolean(criticalRaw?.trim());

  if ((suppliedWarning && warningBytes === null) || (suppliedCritical && criticalBytes === null)) {
    return {
      warningBytes,
      criticalBytes,
      status: "UNCONFIGURED",
      configurationError: "Storage budget values must be non-negative integer byte counts."
    };
  }

  if (
    warningBytes !== null &&
    criticalBytes !== null &&
    warningBytes >= criticalBytes
  ) {
    return {
      warningBytes,
      criticalBytes,
      status: "UNCONFIGURED",
      configurationError: "Storage warning budget must be lower than the critical budget."
    };
  }

  if (warningBytes === null && criticalBytes === null) {
    return {
      warningBytes: null,
      criticalBytes: null,
      status: "UNCONFIGURED",
      configurationError: null
    };
  }

  const status =
    criticalBytes !== null && currentBytes >= criticalBytes
      ? "CRITICAL"
      : warningBytes !== null && currentBytes >= warningBytes
        ? "WARNING"
        : "OK";

  return {
    warningBytes,
    criticalBytes,
    status,
    configurationError: null
  };
}

function nearestAtOrBefore(
  history: StorageHistoryPoint[],
  targetMillis: number
): StorageHistoryPoint | null {
  let selected: StorageHistoryPoint | null = null;
  for (const point of history) {
    const millis = Date.parse(point.capturedAt);
    if (!Number.isFinite(millis) || millis > targetMillis) continue;
    if (!selected || millis > Date.parse(selected.capturedAt)) selected = point;
  }
  return selected;
}

function growthForWindow(
  currentBytes: number,
  nowMillis: number,
  history: StorageHistoryPoint[],
  windowMillis: number
): number | null {
  const baseline = nearestAtOrBefore(history, nowMillis - windowMillis);
  return baseline ? currentBytes - baseline.databaseBytes : null;
}

export function calculateStorageAnalytics(
  currentBytes: number,
  generatedAt: string,
  history: StorageHistoryPoint[],
  budget = storageBudgetFromEnv(currentBytes)
): StorageAnalytics {
  const nowMillis = Date.parse(generatedAt);
  const ordered = [...history]
    .filter(point => Number.isFinite(Date.parse(point.capturedAt)))
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));

  const bytes24h = growthForWindow(currentBytes, nowMillis, ordered, 24 * 60 * 60 * 1000);
  const bytes7d = growthForWindow(currentBytes, nowMillis, ordered, 7 * 24 * 60 * 60 * 1000);
  const bytes30d = growthForWindow(currentBytes, nowMillis, ordered, 30 * 24 * 60 * 60 * 1000);

  let averageDailyBytes: number | null = null;
  if (ordered.length > 0) {
    const earliest = ordered[0]!;
    const elapsedMillis = nowMillis - Date.parse(earliest.capturedAt);
    // Avoid extrapolating a long-term growth rate from a tiny observation window.
    if (elapsedMillis >= 12 * 60 * 60 * 1000) {
      averageDailyBytes =
        (currentBytes - earliest.databaseBytes) /
        (elapsedMillis / (24 * 60 * 60 * 1000));
    }
  }

  const nonNegativeDaily =
    averageDailyBytes === null ? null : Math.max(averageDailyBytes, 0);

  return {
    growth: {
      bytes24h,
      bytes7d,
      bytes30d,
      averageDailyBytes
    },
    projection: {
      bytes30d:
        nonNegativeDaily === null
          ? null
          : Math.round(currentBytes + nonNegativeDaily * 30),
      bytes90d:
        nonNegativeDaily === null
          ? null
          : Math.round(currentBytes + nonNegativeDaily * 90),
      bytes180d:
        nonNegativeDaily === null
          ? null
          : Math.round(currentBytes + nonNegativeDaily * 180),
      bytes365d:
        nonNegativeDaily === null
          ? null
          : Math.round(currentBytes + nonNegativeDaily * 365)
    },
    budget
  };
}
