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

export const MODULE_NAME = "api";
export const MODULE_VERSION = "1.11.1";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
  "1.11.1": {
    releasedAt: "2026-09-07T23:15:00+02:00",
    patch: "PR-153-device-registry-table-filter-sort-monitoring-migration-v1.patch",
    changes: [
      { type: "fixed", description: "Add the missing monitoring_agents.agent_labels JSONB migration and GIN index required by reported agent labels" }
    ]
  },
  "1.11.0": {
    releasedAt: "2026-09-07T22:10:00+02:00",
    patch: "PR-152-monitoring-agent-reported-labels-v1.patch",
    changes: [
      { type: "added", description: "Store agent-reported labels separately from SensorSphere-managed Monitoring Agent labels" },
      { type: "changed", description: "Heartbeat accepts agentLabels and treats legacy labels payloads as agent-reported metadata without overwriting managed labels" }
    ]
  },
  "1.10.0": {
    releasedAt: "2026-09-06T22:15:00+02:00",
    patch: "PR-151-monitoring-identity-targets-service-table-fonts-v1.patch",
    changes: [
      { type: "added", description: "Resolve Monitoring custom identity templates such as {{identity:IP:VPN}} against the selected Device Registry device" }
    ]
  },
  "1.9.0": {
    releasedAt: "2026-09-06T14:45:00+02:00",
    patch: "PR-150-monitoring-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add pull-based Monitoring Agent APIs with hashed bearer-token authentication, heartbeat and configuration revisions" },
      { type: "added", description: "Add generic multi-agent device monitoring checks with FAILOVER/ALL execution modes and current result state tracking" }
    ]
  },
  "1.8.3": {
    releasedAt: "2026-09-06T13:40:00+02:00",
    patch: "PR-149-service-registry-foundation-v7.patch",
    changes: [
      { type: "added", description: "Service Registry taxonomy includes WebUI and App Protocol classes and protocol-oriented types" }
    ]
  },
  "1.8.2": {
    releasedAt: "2026-09-06T13:24:00+02:00",
    patch: "PR-149-service-registry-foundation-v6.patch",
    changes: [
      { type: "changed", description: "Projected Device Registry service names are prefixed with the source device name and fall back to the access link name when no published name is set" }
    ]
  },
  "1.8.1": {
    releasedAt: "2026-09-06T12:55:00+02:00",
    patch: "PR-149-service-registry-foundation-v3.patch",
    changes: [
      { type: "fixed", description: "Map Service Registry publication metadata from Device access links instead of Device identities" }
    ]
  },
  "1.8.0": {
    releasedAt: "2026-09-06T12:45:00+02:00",
    patch: "PR-149-service-registry-foundation-v2.patch",
    changes: [
      { type: "added", description: "Service Registry API aggregates native services with read-only projections published from Device access links" },
      { type: "added", description: "Device access links persist Service Registry publication metadata without duplicating service URLs" }
    ]
  },
  "1.7.0": {
    releasedAt: "2026-09-06T12:00:00+02:00",
    patch: "PR-149-service-registry-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add Service Registry CRUD APIs for services, accounts, resources and access links" },
      { type: "added", description: "Add managed Service Registry class/type reference APIs with weak Device Registry resource links" }
    ]
  },
  "1.6.4": {
    releasedAt: "2026-09-06T11:15:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v8.patch",
    changes: [
      { type: "fixed", description: "Enforce unique IP identities across devices with conflict responses" }
    ]
  },
  "1.6.3": {
    releasedAt: "2026-09-06T10:55:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v7.patch",
    changes: [
      { type: "added", description: "Network taxonomy includes a KVM device type" },
      { type: "fixed", description: "Device identities no longer inherit the foundation-wide uniqueness constraint; MAC and IEEE remain globally unique through dedicated indexes" }
    ]
  },
  "1.6.2": {
    releasedAt: "2026-09-06T09:20:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v6.patch",
    changes: [
      { type: "added", description: "Device access links persist a configurable icon color with a blue default" }
    ]
  },
  "1.6.0": {
    releasedAt: "2026-09-06T08:00:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v1.patch",
    changes: [
      { type: "added", description: "Device Registry identities support multiple labeled MAC, IP, FQDN and IEEE addresses with one primary value per type" },
      { type: "added", description: "MAC and IEEE identities are normalized and globally protected against assignment to multiple devices" },
      { type: "fixed", description: "Device identity conflicts return HTTP 409 with the device that already owns the hardware identifier" }
    ]
  },
  "1.5.0": {
    releasedAt: "2026-09-06T07:15:00+02:00",
    patch: "PR-147-device-registry-identities-access-taxonomy-v1.patch",
    changes: [
      { type: "added", description: "Device Registry persists first-class MAC, IP, IEEE and FQDN addresses and multiple parameterized access links" },
      { type: "added", description: "Managed taxonomy APIs provide CRUD for device classes, types and technologies including icon, color and enable state" },
      { type: "changed", description: "Device classes are reference-backed and extensible instead of being restricted to a fixed database enum" }
    ]
  },
  "1.4.0": {
    releasedAt: "2026-09-05T22:40:00+02:00",
    patch: "PR-146-device-registry-reference-data-v1.patch",
    changes: [
      { type: "added", description: "Device Registry exposes reference APIs for device types and technologies" },
      { type: "added", description: "Device records support multiple reference-backed technologies while preserving foundation data" }
    ]
  },
  "1.3.2": {
    releasedAt: "2026-09-05T20:05:00+02:00",
    patch: "PR-145-device-registry-foundation-v3.patch",
    changes: [
      { type: "fixed", description: "Device Registry health profile threshold validation now accepts partial update payloads under TypeScript" }
    ]
  },
  "1.3.1": {
    releasedAt: "2026-09-05T19:30:00+02:00",
    patch: "PR-145-device-registry-foundation-v2.patch",
    changes: [
      { type: "fixed", description: "Device Registry health profile update validation no longer calls Zod partial() on a schema that already contains refinements" }
    ]
  },
  "1.3.0": {
    releasedAt: "2026-09-05T19:05:00+02:00",
    patch: "PR-145-device-registry-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Registry CRUD API with generic technical inventory, identities, hierarchy and health profiles" },
      { type: "added", description: "Optional typed links connect registry devices to existing Sensor, Asset and Gateway records without coupling the registry schema to those domains" },
      { type: "added", description: "Health evaluation derives ONLINE, WARNING, OFFLINE, UNKNOWN and DISABLED states from profile thresholds" }
    ]
  },
  "1.2.0": {
    releasedAt: "2026-08-29T20:30:00+02:00",
    patch: "PR-134-history-view-groups-v2.patch",
    changes: [
      { type: "changed", description: "History configuration API accepts grouped version 4 History views while retaining legacy formats" }
    ]
  },
  "1.1.1": {
    releasedAt: "2026-08-29T15:55:00+02:00",
    patch: "PR-132-dashboard-template-ephemeral-history-v4.patch",
    changes: [
      {
        type: "fixed",
        description: "Gateway Coverage casts legacy text IP addresses to inet before formatting them with PostgreSQL host()"
      }
    ]
  },
  "1.1.0": {
    releasedAt: "2026-08-29T08:20:00+02:00",
    patch: "PR-128-gateway-ip-web-link-v1.patch",
    changes: [
      {
        type: "changed",
        description: "Gateway IP addresses exposed without PostgreSQL inet CIDR suffix"
      }
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
        type: "added",
        description: "Module versions API endpoint"
      },
      {
        type: "changed",
        description: "Health responses now expose the API module version"
      }
    ]
  }
};
