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
export const MODULE_VERSION = "1.44.0";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
  "1.44.0": {
    releasedAt: "2026-09-25T15:45:00+02:00",
    patch: "PR-270-compatibility-release-hardening-v1.patch",
    changes: [
      { type: "added", description: "Expose API contract version, API module version and current database migration level through runtime configuration" },
      { type: "added", description: "Define explicit API/database compatibility bounds for validated Stack Releases" }
    ]
  },
  "1.43.0": {
    releasedAt: "2026-09-25T08:30:00+02:00",
    patch: "PR-266-agent-operation-history-detached-deploy-v1.patch",
    changes: [
      { type: "added", description: "Persist Supervisor managed-agent deploy, update and remove operation history with progress details" },
      { type: "added", description: "Expose managed-agent operation history and completed-history cleanup endpoints for the Agents UI" }
    ]
  },
  "1.42.0": {
    releasedAt: "2026-09-25T08:00:00+02:00",
    patch: "PR-265-agent-action-details-reconciliation-v1.patch",
    changes: [
      { type: "added", description: "Accept and expose structured Supervisor managed-agent progress events with command correlation and elapsed time" },
      { type: "added", description: "Log managed-agent command queue, progress, result and timeout lifecycle in the API for end-to-end diagnostics" }
    ]
  },
  "1.41.2": {
    releasedAt: "2026-09-24T23:10:00+02:00",
    patch: "PR-263-agent-operation-timeout-status-hotfix-v2.patch",
    changes: [
      { type: "fixed", description: "Extend Supervisor managed-agent operations to ten minutes so slow image pulls and Raspberry Pi deployments are not marked timed out after three minutes" },
      { type: "fixed", description: "Recover stale FAILED agent update lifecycle state when the target version is subsequently reported by the running agent" }
    ]
  },
  "1.41.1": {
    releasedAt: "2026-09-24T20:50:00+02:00",
    patch: "PR-263-agent-ui-runtime-consistency-v2.patch",
    changes: [
      { type: "changed", description: "Expose INSTANCE_NAME_COLOR through runtime configuration for frontend instance-name styling" }
    ]
  },
  "1.41.0": {
    releasedAt: "2026-09-24T15:45:00+02:00",
    patch: "PR-262-agent-technical-model-unification-v1.patch",
    changes: [
      { type: "changed", description: "Unify Device, Monitoring and Supervisor Agent technical/runtime lifecycle fields while keeping functional data type-specific" },
      { type: "changed", description: "Supervisor-managed runtime reports populate the common configured version, container state and host network fields on managed agents" },
      { type: "fixed", description: "Supervisor update targets use desiredVersion independently from the configured runtime version" }
    ]
  },
  "1.40.2": {
    releasedAt: "2026-09-24T09:10:00+02:00",
    patch: "PR-259-installation-environment-v5.patch",
    changes: [
      { type: "fixed", description: "Make SENSORSPHERE_ENVIRONMENT installation-wide instead of storing an environment on each Supervisor identity" },
      { type: "added", description: "Expose the installation environment to Supervisor bootstrap generation and validate Supervisor HELLO against it" }
    ]
  },
  "1.40.1": {
    releasedAt: "2026-09-24T08:35:00+02:00",
    patch: "PR-259-sensorsphere-supervisor-environments-v2.patch",
    changes: [
      { type: "fixed", description: "Persist Supervisor deployment environments in supervisor_agents, defaulting existing Supervisor identities to DEFAULT" }
    ]
  },
  "1.40.0": {
    releasedAt: "2026-09-24T07:55:00+02:00",
    patch: "PR-259-supervisor-environment-isolation-v1.patch",
    changes: [
      { type: "added", description: "Supervisor identities carry an immutable deployment environment used to validate environment-isolated Supervisor connections" }
    ]
  },
  "1.39.5": {
    releasedAt: "2026-09-24T02:35:00+02:00",
    patch: "PR-258-device-registry-identity-deduplication-v1.patch",
    changes: [
      { type: "fixed", description: "Device Registry canonicalizes and deduplicates identities inside create/update payloads before enforcing cross-device uniqueness" }
    ]
  },
  "1.39.4": {
    releasedAt: "2026-09-24T02:20:00+02:00",
    patch: "PR-257-discovery-control-provider-persistence-v1.patch",
    changes: [
      { type: "fixed", description: "Device Registry create and update payloads accept an explicit controlProvider while preserving legacy technology-based inference" }
    ]
  },
  "1.39.3": {
    releasedAt: "2026-09-24T00:45:00+02:00",
    patch: "PR-254-proxmox-endpoint-rename-preserve-secret-v1.patch",
    changes: [
      { type: "fixed", description: "Proxmox endpoint configuration accepts an optional originalId rename hint without persisting or exposing the token secret" }
    ]
  },
  "1.39.2": {
    releasedAt: "2026-09-23T23:30:00+02:00",
    patch: "PR-249-device-agent-lifecycle-race-v1.patch",
    changes: [
      { type: "fixed", description: "Device Agent Supervisor results can no longer regress an already target-version-confirmed update back to VERIFYING or UPDATING" },
      { type: "fixed", description: "Device Agent reads defensively reconcile stale transitional lifecycle rows when the reported version already equals the requested version" },
      { type: "fixed", description: "Requesting the Device Agent version already running is treated as a successful no-op instead of starting an update that may never reconnect" }
    ]
  },
  "1.39.1": {
    releasedAt: "2026-09-23T21:20:00+02:00",
    patch: "PR-248-agent-update-reliability-ui-consistency-v1.patch",
    changes: [
      { type: "fixed", description: "Device Agent updates through explicit Supervisor associations include the management and SensorSphere agent identities required by Supervisor 0.7.2+" },
      { type: "fixed", description: "Timed-out Supervisor-managed Device and Monitoring Agent updates persist FAILED lifecycle state instead of remaining indefinitely transitional" }
    ]
  },
  "1.39.0": {
    releasedAt: "2026-09-23T20:45:00+02:00",
    patch: "PR-246-agent-lifecycle-observability-v1.patch",
    changes: [
      { type: "fixed", description: "Supervisor Monitoring Agent update results no longer regress an already heartbeat-confirmed UPDATED lifecycle back to VERIFYING" },
      { type: "added", description: "Agent release availability can be refreshed immediately from GHCR without restarting the API" }
    ]
  },
  "1.38.0": {
    releasedAt: "2026-09-23T19:15:00+02:00",
    patch: "PR-244-managed-runtime-multi-instance-v1.patch",
    changes: [
      { type: "added", description: "Supervisor managed-agent payloads expose both SensorSphere association metadata and Supervisor runtime state, including associations not currently reported at runtime" }
    ]
  },
  "1.37.1": {
    releasedAt: "2026-09-23T17:45:00+02:00",
    patch: "PR-243-monitoring-managed-update-safety-v1.patch",
    changes: [
      { type: "fixed", description: "Monitoring Agent updates require an existing exact Supervisor association and can no longer create or retarget a main instance implicitly" }
    ]
  },
  "1.37.0": {
    releasedAt: "2026-09-23T06:00:00+02:00",
    patch: "PR-242-proxmox-config-agent-ui-v1.patch",
    changes: [
      { type: "added", description: "Device Agents expose Supervisor-backed Proxmox configuration get/save/delete operations without storing provider secrets in SensorSphere" }
    ]
  },
  "1.36.0": {
    releasedAt: "2026-09-23T05:50:00+02:00",
    patch: "PR-241-agent-bulk-update-host-network-v1.patch",
    changes: [
      { type: "added", description: "Supervisor Agents persist host network interface inventory with MAC, IP, CIDR and IPv4 subnet data" }
    ]
  },
  "1.35.1": {
    releasedAt: "2026-09-23T00:20:00+02:00",
    patch: "PR-239-agent-lifecycle-deprovision-icons-v1.patch",
    changes: [
      { type: "fixed", description: "Persist Supervisor self-update REQUESTED state before sending the remote command to prevent lifecycle races" },
      { type: "fixed", description: "Supervisor self-token checks remain compatible with token_hash-only Supervisor responses" },
      { type: "changed", description: "Supervisor managed-agent responses include associated SensorSphere agent names for UI diagnostics" },
      { type: "fixed", description: "Duplicate Device and Monitoring Agent names return explicit HTTP 409 errors instead of generic server errors" }
    ]
  },
  "1.35.0": {
    releasedAt: "2026-09-23T00:15:00+02:00",
    patch: "PR-238-agent-token-runtime-table-consistency-v1.patch",
    changes: [
      { type: "fixed", description: "Check token distinguishes configured .env token from the token actually present in the running managed-agent container" },
      { type: "added", description: "Supervisor Agents support managed Labels and Agent Labels columns consistently with Device and Monitoring Agents" }
    ]
  },
  "1.34.1": {
    releasedAt: "2026-09-22T21:30:00+02:00",
    patch: "PR-237-managed-agent-delete-association-v1.patch",
    changes: [
      { type: "fixed", description: "Agent list responses expose the explicit Supervisor name and managed instance for Device and Monitoring Agents" }
    ]
  },
  "1.34.0": {
    releasedAt: "2026-09-22T20:30:00+02:00",
    patch: "PR-236-agent-lifecycle-token-ownership-v1.patch",
    changes: [
      { type: "added", description: "Device, Monitoring and Supervisor Agents expose safe token verification through Supervisor-side SHA-256 fingerprints" },
      { type: "added", description: "Successful agent updates persist last-successful update timestamp and version for durable UI history" },
      { type: "changed", description: "Device Agent updates prefer explicit Supervisor managed-agent associations before hostname compatibility fallback" }
    ]
  },
  "1.33.0": {
    releasedAt: "2026-09-22T08:55:00+02:00",
    patch: "PR-235-explicit-supervisor-agent-associations-v1.patch",
    changes: [
      { type: "added", description: "Supervisor-managed Device and Monitoring Agents have explicit immutable SensorSphere associations with agent UUID, instance and optional install directory" },
      { type: "changed", description: "Autonomous Supervisor HELLO_ACK now sends authoritative managed-agent associations and runtime reports reconcile them by association ID" },
      { type: "added", description: "Managed-agent deploy operations can bind the new local installation to the created SensorSphere agent identity" }
    ]
  },
  "1.32.4": {
    releasedAt: "2026-09-22T07:20:00+02:00",
    patch: "PR-234-agents-table-consistency-v3.patch",
    changes: [
      { type: "fixed", description: "Device Agent updates fall back to the online autonomous Supervisor managing the same host" },
      { type: "fixed", description: "Autonomous Supervisor configured target is preserved while an update is active" },
      { type: "fixed", description: "Supervisor UPDATED lifecycle is accepted only after the requested runtime version is observed" }
    ]
  },
  "1.32.3": {
    releasedAt: "2026-09-21T19:10:00+02:00",
    patch: "PR-234-agents-table-consistency-v2.patch",
    changes: [
      { type: "fixed", description: "Autonomous Supervisor update lifecycle no longer regresses to stale READY/UPDATED state while a newer update request is active" },
      { type: "added", description: "Autonomous Supervisor WebSocket connections accept direct managed-agent LIST, DEPLOY, UPDATE and REMOVE operations" }
    ]
  },
  "1.32.2": {
    releasedAt: "2026-09-21T05:20:00+02:00",
    patch: "PR-233a-autonomous-supervisor-v5-actions.patch",
    changes: [
      { type: "added", description: "Autonomous Supervisor Agents can receive self-update commands directly over their SensorSphere WebSocket connection" },
      { type: "changed", description: "Supervisor heartbeat/self-status now refreshes autonomous update lifecycle fields" }
    ]
  },
  "1.32.1": {
    releasedAt: "2026-09-21T04:45:00+02:00",
    patch: "PR-233a-autonomous-supervisor-v2-hotfix.patch",
    changes: [
      { type: "fixed", description: "Nginx proxies the autonomous Supervisor WebSocket upgrade endpoint" },
      { type: "added", description: "Autonomous Supervisor Agent identities can be edited from Device Control" }
    ]
  },
  "1.32.0": {
    releasedAt: "2026-09-21T04:10:00+02:00",
    patch: "PR-233a-autonomous-supervisor-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Control accepts independently authenticated outbound Supervisor Agent WebSocket connections" },
      { type: "added", description: "Supervisor Agent identities use dedicated one-time sssa_ bearer tokens and persist autonomous heartbeat inventory" },
      { type: "changed", description: "Legacy Supervisor state relayed through Device Agents remains available during migration" }
    ]
  },
  "1.31.0": {
    releasedAt: "2026-09-20T23:40:00+02:00",
    patch: "PR-232-agent-version-availability-v1.patch",
    changes: [
      { type: "added", description: "Device Control exposes cached latest stable GHCR versions for Device, Monitoring and Supervisor Agent images" },
      { type: "changed", description: "GHCR version lookups are cached for five minutes and degrade to per-repository UNKNOWN status on registry errors" }
    ]
  },
  "1.30.2": { releasedAt: "2026-09-20T10:25:00+02:00", patch: "PR-225-device-icons-taxonomy-scroll-v5.patch", changes: [{ type: "fixed", description: "Device Registry identity and access-link inserts use contiguous PostgreSQL parameter numbers, fixing 42P18 errors during device saves" }] },

  "1.30.1": { releasedAt: "2026-09-20T09:00:00+02:00", patch: "PR-225-device-icons-taxonomy-scroll-v4.patch", changes: [{ type: "fixed", description: "Device Registry updates explicitly type optional-field presence flags so PostgreSQL can save icon and identity changes reliably" }] },

  "1.30.0": { releasedAt: "2026-09-20T07:15:00+02:00", patch: "PR-225-device-icons-taxonomy-scroll-v1.patch", changes: [{ type: "added", description: "Device Registry persists optional per-device icon overrides" }] },

  "1.29.0": {
    releasedAt: "2026-09-20T00:20:00+02:00",
    patch: "PR-218c-managed-agents-sensorsphere-v1.patch",
    changes: [
      { type: "added", description: "Device Control can list, deploy, update and remove Supervisor-managed SensorSphere agents through a connected Device Agent" }
    ]
  },

  "1.28.3": {
    releasedAt: "2026-09-19T23:50:00+02:00",
    patch: "PR-216-supervisor-configured-version-v1.patch",
    changes: [
      { type: "fixed", description: "Successful Supervisor self-updates persist the configured Supervisor version together with the verified running version" }
    ]
  },

  "1.28.2": {
    releasedAt: "2026-09-19T23:35:00+02:00",
    patch: "PR-214-agent-update-target-cleanup-v1.patch",
    changes: [
      { type: "fixed", description: "Completed Device Agent and Supervisor updates clear their persisted target versions" }
    ]
  },

  "1.28.1": {
    releasedAt: "2026-09-19T23:20:00+02:00",
    patch: "PR-213-supervisor-update-orchestration-v2.patch",
    changes: [
      { type: "fixed", description: "Device Agent HELLO persistence explicitly types the optional Supervisor update error parameter for PostgreSQL" }
    ]
  },

  "1.28.0": {
    releasedAt: "2026-09-19T21:40:00+02:00",
    patch: "PR-213-supervisor-update-orchestration-v1.patch",
    changes: [
      { type: "added", description: "Device Control persists Supervisor Agent version, runtime state, self-update capability and update lifecycle" },
      { type: "added", description: "Supervisor Agent self-updates can be requested through the connected Device Agent and tracked to completion" }
    ]
  },

  "1.27.1": {
    releasedAt: "2026-09-19T17:30:00+02:00",
    patch: "PR-209-device-agent-update-orchestration-v1.patch",
    changes: [
      { type: "added", description: "Device Control orchestrates typed Device Agent updates through the local Supervisor Agent and verifies completion from the reconnecting agent version" },
      { type: "added", description: "Device Agents persist desired version, update lifecycle timestamps, Supervisor availability and update errors" }
    ]
  },

  "1.26.0": {
    releasedAt: "2026-09-19T11:55:00+02:00",
    patch: "PR-201-device-discovery-dedup-discard-v1.patch",
    changes: [
      { type: "added", description: "Device discovery supports persistent discard/restore decisions and exposes discarded discovery records through Device Control" },
      { type: "changed", description: "Discovery UI can aggregate the same logical device reported by multiple Device Agents without treating healthy alternate agents as registry updates" }
    ]
  },

  "1.25.0": {
    releasedAt: "2026-09-19T11:30:00+02:00",
    patch: "PR-200-device-discovery-yeelight-esphome-v1.patch",
    changes: [
      { type: "added", description: "Device Control exposes recent in-memory discovery requests so the Device Registry Discovery tab can aggregate Yeelight and ESPHome results" }
    ]
  },

  "1.24.0": {
    releasedAt: "2026-09-19T10:30:00+02:00",
    patch: "PR-199-dashboard-latency-card-move-v1.patch",
    changes: [
      { type: "fixed", description: "Latest observation lookup uses the metric/time index per metric instead of sorting the full observations set" },
      { type: "added", description: "Simple Dashboard card update APIs support moving metric and realtime cards across editable dashboards and sections" }
    ]
  },

  "1.23.2": {
    releasedAt: "2026-09-19T11:00:00+02:00",
    patch: "PR-198-yeelight-device-state-normalization-v1.patch",
    changes: [
      { type: "fixed", description: "Normalize Yeelight DEVICE_STATE payloads before persistence so partial provider state cannot replace realtime entities with OFFLINE or UNKNOWN state" }
    ]
  },

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
