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
export const MODULE_VERSION = "1.23.1";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
  "1.23.1": {
    releasedAt: "2026-09-19T10:15:00+02:00",
    patch: "PR-197-yeelight-state-diagnostics-spinner-v1.patch",
    changes: [
      { type: "added", description: "Device Control logs targeted Yeelight command, DEVICE_STATE, normalization and persistence events for realtime state diagnostics" }
    ]
  },

  "1.23.0": {
    releasedAt: "2026-09-19T09:15:00+02:00",
    patch: "PR-195-yeelight-realtime-entities-v1.patch",
    changes: [
      { type: "added", description: "Device Control polls registered Yeelight devices through their assigned Device Agent and publishes normalized realtime entities" },
      { type: "changed", description: "Successful Yeelight GET_STATE results are persisted in the provider-neutral Device Control state model for Entity Browser and dashboards" }
    ]
  },

  "1.22.0": {
    releasedAt: "2026-09-16T01:10:00+02:00",
    patch: "PR-194-agent-system-dashboard-editor-v1.patch",
    changes: [
      { type: "added", description: "Device and Monitoring Agent heartbeats persist host OS, OS version and processor architecture" },
      { type: "added", description: "Realtime dashboard entity cards support editable title, widget type, section and size" }
    ]
  },

  "1.21.0": {
    releasedAt: "2026-09-16T02:45:00+02:00",
    patch: "PR-193-dashboard-realtime-entity-foundation-v1.patch",
    changes: [
      { type: "added", description: "Simple Dashboards persist provider-neutral realtime entity widgets alongside metric cards" },
      { type: "added", description: "Simple Dashboard API exposes create/delete operations for realtime entity cards" }
    ]
  },

  "1.20.0": {
    releasedAt: "2026-09-16T01:15:00+02:00",
    patch: "PR-192-realtime-entity-browser-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Control exposes a cross-device provider-neutral realtime entity feed for Entity Browser and future dashboards" }
    ]
  },
  "1.19.0": {
    releasedAt: "2026-09-15T22:55:00+02:00",
    patch: "PR-189-esphome-entity-model-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Control exposes a normalized realtime entities endpoint for dashboard-oriented consumers" },
      { type: "changed", description: "ESPHome realtime state accepts a provider-neutral entity list carrying values and metadata for multiple entity types" }
    ]
  },
  "1.18.0": {
    releasedAt: "2026-09-15T21:55:00+02:00",
    patch: "PR-188-esphome-realtime-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Control synchronizes registered ESPHome devices to Device Agents for persistent Native API telemetry" },
      { type: "changed", description: "ESPHome realtime entity state is stored continuously in the existing Device Control state record" }
    ]
  },
  "1.17.0": {
    releasedAt: "2026-09-14T20:10:00+02:00",
    patch: "PR-179-esphome-provider-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Registry maps ESPHome technology to the ESPHOME Device Control provider" }
    ]
  },
  "1.16.1": {
    releasedAt: "2026-09-14T07:20:00+02:00",
    patch: "PR-175-device-agent-discovery-identity-refresh-ui-v1.patch",
    changes: [
      { type: "added", description: "Device Registry validates and enforces uniqueness for YEELIGHT_ID identities" }
    ]
  },
  "1.16.0": {
    releasedAt: "2026-09-14T06:55:00+02:00",
    patch: "PR-173-device-agent-discovered-set-name-v1.patch",
    changes: [
      { type: "added", description: "Device Control API can dispatch asynchronous provider actions to devices discovered by a Device Agent before Device Registry import" }
    ]
  },
  "1.15.0": {
    releasedAt: "2026-09-10T07:10:00+02:00",
    patch: "PR-171-device-agent-discovery-ui-v1.patch",
    changes: [
      { type: "added", description: "Device Control API can dispatch provider discovery requests to online Device Agents and expose their asynchronous results" },
      { type: "changed", description: "Device Agent capabilities now advertise provider discovery support alongside typed actions" }
    ]
  },
  "1.14.2": {
    releasedAt: "2026-09-10T06:45:00+02:00",
    patch: "PR-170-device-agent-yeelight-control-ui-v1.patch",
    changes: [
      { type: "changed", description: "Device Control command creation rejects offline Device Agents instead of leaving new interactive commands pending" },
      { type: "changed", description: "Device Control API error messages use Device Agent terminology consistently" }
    ]
  },
  "1.14.1": {
    releasedAt: "2026-09-09T06:30:00+02:00",
    patch: "PR-165-device-control-command-target-identities-v1.patch",
    changes: [
      { type: "changed", description: "Device Agent COMMAND messages include the Device Registry name and ordered identities so providers can resolve protocol-specific targets" }
    ]
  },
  "1.14.0": {
    releasedAt: "2026-09-09T06:45:00+02:00",
    patch: "PR-164-device-control-websocket-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add Device Agent CRUD, ssda_ bearer tokens and persistent outbound WebSocket control sessions" },
      { type: "added", description: "Add typed Device Control command/result/state protocol and Device Registry control-agent association" },
      { type: "security", description: "Device Control accepts typed provider actions only and never exposes arbitrary remote command execution" }
    ]
  },
  "1.13.0": {
    releasedAt: "2026-09-08T22:30:00+02:00",
    patch: "PR-160-device-health-monitoring-integration-v1.patch",
    changes: [
      { type: "added", description: "Health Profiles can aggregate enabled PING monitoring checks with ANY_UP or ALL_UP policies" },
      { type: "changed", description: "Device health combines Monitoring state with existing Last Seen, battery and RSSI rules while preserving IGNORE as the default" },
      { type: "fixed", description: "Monitoring check states now honor failure and recovery thresholds before changing stabilized UP/DOWN state" }
    ]
  },
  "1.12.0": {
    releasedAt: "2026-09-08T00:40:00+02:00",
    patch: "PR-158-monitoring-agent-connection-origin-led-strip-icon-v1.patch",
    changes: [
      { type: "added", description: "Monitoring Agent requests persist raw HTTP source IP, X-Forwarded-For and X-Real-IP metadata independently from the effective client IP" },
      { type: "added", description: "Monitoring Agent heartbeat accepts an optional localIp reported by the agent" }
    ]
  },
  "1.11.2": {
    releasedAt: "2026-09-07T23:30:00+02:00",
    patch: "PR-154-device-identity-ping-check-filter-emphasis-raspberry-pi-v1.patch",
    changes: [
      { type: "added", description: "Add Raspberry Pi to Device Registry Compute taxonomy as a single-board-computer type" }
    ]
  },
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
