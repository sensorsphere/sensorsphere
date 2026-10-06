export type ModuleChangeType =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "deprecated"
  | "security";

export interface ModuleChange {
  type: ModuleChangeType;
  description: string;
}

export interface ModuleChangelogEntry {
  releasedAt: string;
  patch: string;
  changes: ModuleChange[];
}

export const MODULE_NAME = "ingestion-service";
export const MODULE_VERSION = "1.0.3";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
  "1.0.3": {
    releasedAt: "2026-10-06T12:32:24Z",
    patch: "PR-335-diagnostic-event-timescale-retention-v1.patch",
    changes: [
      { type: "changed", description: "Remove row-by-row gateway traffic and metric routing retention loops; retention is now owned exclusively by TimescaleDB policies" },
      { type: "changed", description: "Keep diagnostic event ingestion writes unchanged while native one-hour Timescale chunks handle expiry" }
    ]
  },
  "1.0.2": {
    releasedAt: "2026-10-05T22:17:23Z",
    patch: "PR-333-database-retention-management-v1.patch",
    changes: [
      { type: "changed", description: "Read gateway traffic and metric routing retention from persistent DB-3 settings before every hourly retention pass" },
      { type: "added", description: "Support unlimited diagnostic-event retention as an explicit no-purge policy" }
    ]
  },
  "1.0.1": {
    releasedAt: "2026-09-29T06:30:25+02:00",
    patch: "PR-287-auth-ux-device-agent-recreate-v1.patch",
    changes: [
      { type: "fixed", description: "Republish Ingestion with runtime component build/version reporting enabled for Build information" }
    ]
  },
  "1.0.0": {
    releasedAt: "2026-08-29T05:59:35+02:00",
    patch: "PR-126-module-versioning-foundation-v1.patch",
    changes: [
      {
        type: "added",
        description: "Module versioning foundation and structured changelog"
      },
      {
        type: "changed",
        description: "Runtime component reporting now includes module version and changelog"
      }
    ]
  }
};
