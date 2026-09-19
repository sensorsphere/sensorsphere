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

export const MODULE_NAME = "frontend";
export const MODULE_VERSION = "1.59.1";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
  "1.59.1": {
    releasedAt: "2026-09-20T01:55:00+02:00",
    patch: "PR-222-proxmox-contextual-discovery-columns-v1.patch",
    changes: [
      { type: "changed", description: "Per-agent Proxmox discovery uses contextual Type / OS, Status / MAC, Node and VMID column labels while keeping the existing sortable columns" }
    ]
  },

  "1.59.0": {
    releasedAt: "2026-09-20T01:30:00+02:00",
    patch: "PR-221b-proxmox-enrichment-ui-v1.patch",
    changes: [
      { type: "added", description: "Proxmox discovery displays guest IP, MAC, OS and guest-agent details when reported by Device Agents" },
      { type: "changed", description: "Proxmox Device Registry imports persist discovered IP, MAC and hostname identities and enriched descriptions" }
    ]
  },

  "1.58.2": {
    releasedAt: "2026-09-20T00:55:00+02:00",
    patch: "PR-220-proxmox-discovery-ux-v2.patch",
    changes: [
      { type: "fixed", description: "Device Discovery hides failed scans once a newer successful scan for the same provider and agent supersedes them" },
      { type: "fixed", description: "Device Discovery keeps the final table row fully scrollable above the viewport edge" }
    ]
  },

  "1.58.1": {
    releasedAt: "2026-09-20T01:20:00+02:00",
    patch: "PR-220-proxmox-discovery-ux-v1.patch",
    changes: [
      { type: "changed", description: "Per-agent discovery tables support sortable columns and default to Name ascending" },
      { type: "added", description: "Device Discovery includes a dedicated Scan Proxmox action" }
    ]
  },

  "1.58.0": {
    releasedAt: "2026-09-20T00:45:00+02:00",
    patch: "PR-219-proxmox-discovery-ui-import-v1.patch",
    changes: [
      { type: "added", description: "Device Discovery includes Proxmox PVE nodes, virtual machines and LXC containers reported by Device Agents" },
      { type: "added", description: "Proxmox discoveries import into Device Registry with Proxmox identity, virtualization type and parent-node relationship" }
    ]
  },

  "1.57.0": {
    releasedAt: "2026-09-20T00:20:00+02:00",
    patch: "PR-218c-managed-agents-sensorsphere-v1.patch",
    changes: [
      { type: "added", description: "Device Agents expose a Managed Agents dialog for Supervisor-managed Device and Monitoring Agent instances" }
    ]
  },

  "1.56.2": {
    releasedAt: "2026-09-19T23:55:00+02:00",
    patch: "PR-217-device-agent-version-status-column-v1.patch",
    changes: [
      { type: "changed", description: "Device Agent version and update status now share one compact column, matching the Supervisor Agent layout" }
    ]
  },

  "1.56.1": {
    releasedAt: "2026-09-19T23:35:00+02:00",
    patch: "PR-214-agent-update-target-cleanup-v1.patch",
    changes: [
      { type: "fixed", description: "Completed Device Agent and Supervisor updates no longer display stale target versions" }
    ]
  },

  "1.56.0": {
    releasedAt: "2026-09-19T21:40:00+02:00",
    patch: "PR-213-supervisor-update-orchestration-v1.patch",
    changes: [
      { type: "added", description: "Device Agents display their local Supervisor Agent version and self-update status" },
      { type: "added", description: "Supervisor Agent versions can be updated directly from the Device Agents table" }
    ]
  },

  "1.55.0": {
    releasedAt: "2026-09-19T17:30:00+02:00",
    patch: "PR-209-device-agent-update-orchestration-v1.patch",
    changes: [
      { type: "added", description: "Device Agents show Supervisor readiness and update lifecycle status" },
      { type: "added", description: "Online Device Agents with an available Supervisor can be updated to a requested version directly from SensorSphere" }
    ]
  },

  "1.54.2": {
    releasedAt: "2026-09-19T14:00:00+02:00",
    patch: "PR-204-device-discovery-copy-details-registry-layout-v1.patch",
    changes: [
      { type: "added", description: "Discovery Name, IP and MAC/ID values can be copied directly from the table" },
      { type: "changed", description: "Discovery Details exposes a concise hover summary and Registry is positioned immediately before Actions" },
      { type: "changed", description: "Discovery Registry filter can be cleared directly to All from its clear action" }
    ]
  },

  "1.54.1": {
    releasedAt: "2026-09-19T13:00:00+02:00",
    patch: "PR-203-device-discovery-filter-layout-v1.patch",
    changes: [
      { type: "changed", description: "Discovery statistic filter icons toggle their active Registry filter off when clicked again" },
      { type: "changed", description: "Discovery filters are ordered Provider, Agent, search and Registry for consistency with table columns" },
      { type: "fixed", description: "Discovery table reserves more bottom scroll space so the final row remains fully visible" }
    ]
  },

  "1.54.0": {
    releasedAt: "2026-09-19T12:20:00+02:00",
    patch: "PR-202-device-discovery-workflow-polish-v1.patch",
    changes: [
      { type: "fixed", description: "Discovery discarded rows can be shown alongside the active action filter and the final table row remains fully scrollable" },
      { type: "changed", description: "Discovery defaults to Name ascending, shows multi-agent counts inline and prompts for agent ownership when updating an unassigned multi-agent device" },
      { type: "added", description: "Discovery registry statistic cards expose compact filter actions" }
    ]
  },

  "1.53.0": {
    releasedAt: "2026-09-19T11:55:00+02:00",
    patch: "PR-201-device-discovery-dedup-discard-v1.patch",
    changes: [
      { type: "added", description: "Discovery groups multi-agent detections, explains expected registry updates, persists discarded devices and adds action filtering and sortable columns" },
      { type: "changed", description: "Discovery scan controls show Device Agent availability and disable concurrent scans" },
      { type: "fixed", description: "Collapsed navigation icon backgrounds are centered consistently" }
    ]
  },

  "1.52.0": {
    releasedAt: "2026-09-19T11:30:00+02:00",
    patch: "PR-200-device-discovery-yeelight-esphome-v1.patch",
    changes: [
      { type: "added", description: "Device Registry Discovery consolidates Yeelight and ESPHome results from discovery-capable Device Agents" },
      { type: "added", description: "Discovery supports provider/agent filtering, scan-all actions and direct import/update/open workflows for registry devices" }
    ]
  },

  "1.51.0": {
    releasedAt: "2026-09-19T10:30:00+02:00",
    patch: "PR-199-dashboard-latency-card-move-v1.patch",
    changes: [
      { type: "fixed", description: "Application startup and Dashboard navigation no longer block on the latest-observations request" },
      { type: "fixed", description: "New dashboards remain selected after creation instead of falling back to the first dashboard" },
      { type: "added", description: "Metric and realtime dashboard cards can be moved to another section or editable dashboard from a dedicated Move action" }
    ]
  },

  "1.50.2": {
    releasedAt: "2026-09-19T10:15:00+02:00",
    patch: "PR-197-yeelight-state-diagnostics-spinner-v1.patch",
    changes: [
      { type: "changed", description: "Realtime Power controls use a fixed-width spinner before the switch while a command is pending, preventing control layout shifts" }
    ]
  },

  "1.50.1": {
    releasedAt: "2026-09-19T09:30:00+02:00",
    patch: "PR-196-realtime-entity-switch-toggle-v1.patch",
    changes: [
      { type: "changed", description: "Realtime dashboard switch widgets use a single Power toggle with explicit ON/OFF state instead of separate On and Off buttons" },
      { type: "fixed", description: "Realtime dashboard switch widgets preserve the last confirmed power state while a control command is awaiting provider confirmation instead of flashing UNKNOWN" }
    ]
  },

  "1.50.0": {
    releasedAt: "2026-09-19T09:15:00+02:00",
    patch: "PR-195-yeelight-realtime-entities-v1.patch",
    changes: [
      { type: "added", description: "Realtime Entity Browser displays normalized Yeelight power, brightness, color and device properties supplied by Device Control" }
    ]
  },

  "1.49.2": {
    releasedAt: "2026-09-19T05:45:00+02:00",
    patch: "PR-150-monitoring-foundation-v7.patch",
    changes: [
      { type: "changed", description: "Device Checks and Monitoring Agents tables now fill the available Monitoring tab height with internal scrolling" }
    ]
  },

  "1.49.0": {
    releasedAt: "2026-09-16T01:10:00+02:00",
    patch: "PR-194-agent-system-dashboard-editor-v1.patch",
    changes: [
      { type: "added", description: "Agent tables display host OS, OS version and CPU architecture reported by Device and Monitoring Agents" },
      { type: "changed", description: "Add realtime entity remembers the last selected dashboard and section" },
      { type: "added", description: "Realtime dashboard widgets can be edited for title, widget type, section and size" }
    ]
  },

  "1.48.0": {
    releasedAt: "2026-09-16T02:45:00+02:00",
    patch: "PR-193-dashboard-realtime-entity-foundation-v1.patch",
    changes: [
      { type: "added", description: "Dashboards can persist realtime entity widgets selected from the Realtime Entity Browser" },
      { type: "added", description: "Realtime dashboard widgets support switch controls, binary status and generic value presentation" },
      { type: "changed", description: "Realtime Entity Browser can add provider-neutral entities directly to editable dashboards" }
    ]
  },

  "1.47.0": {
    releasedAt: "2026-09-16T01:15:00+02:00",
    patch: "PR-192-realtime-entity-browser-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Registry includes a cross-device Realtime Entity Browser with persistent sorting and filters" },
      { type: "added", description: "Realtime Entity Browser exposes provider-neutral current values, units, actionability and observation time for dashboard-oriented workflows" },
      { type: "fixed", description: "ESPHome Device Control suppresses the dialog-level vertical scrollbar so only entity rows scroll" }
    ]
  },
  "1.46.0": {
    releasedAt: "2026-09-16T00:10:00+02:00",
    patch: "PR-191-device-control-layout-filters-v1.patch",
    changes: [
      { type: "changed", description: "Device Control uses a wider fixed-height dialog with scrolling confined to ESPHome entity rows" },
      { type: "changed", description: "ESPHome entity headers and filters remain visible while entity rows scroll" },
      { type: "changed", description: "ESPHome Type and Actions filters use finite selectable values and replace the separate Actionable only filter" },
      { type: "changed", description: "Device Control emphasizes the controlled device name in the dialog title" }
    ]
  },
  "1.45.0": {
    releasedAt: "2026-09-15T23:55:00+02:00",
    patch: "PR-190-device-control-table-ux-v1.patch",
    changes: [
      { type: "changed", description: "Devices table shows the assigned Device Agent version next to its online status" },
      { type: "added", description: "ESPHome Device Control entity columns support sorting and per-column filters below the headers" },
      { type: "added", description: "ESPHome Device Control can filter the entity table to actionable entities only" }
    ]
  },
  "1.44.0": {
    releasedAt: "2026-09-15T22:55:00+02:00",
    patch: "PR-189-esphome-entity-model-foundation-v1.patch",
    changes: [
      { type: "changed", description: "ESPHome Device Control header reports the persistent Native API connection as LIVE, OFFLINE or ERROR" },
      { type: "added", description: "ESPHome Device Control displays realtime sensor, binary sensor, text sensor, number and select entities alongside light and switch" },
      { type: "changed", description: "Read-only ESPHome entities show current value, unit and observation time while light and switch retain control actions" }
    ]
  },
  "1.43.0": {
    releasedAt: "2026-09-15T21:55:00+02:00",
    patch: "PR-188-esphome-realtime-foundation-v1.patch",
    changes: [
      { type: "added", description: "ESPHome Device Control follows realtime Native API entity state while the dialog is open" },
      { type: "changed", description: "ESPHome control commands rely on telemetry as the state source of truth instead of optimistic command results" },
      { type: "added", description: "ESPHome Device Control displays LIVE/CONNECTING status for the persistent agent connection" }
    ]
  },
  "1.42.0": {
    releasedAt: "2026-09-15T06:15:00+02:00",
    patch: "PR-187-device-agent-last-seen-esphome-state-v1.patch",
    changes: [
      { type: "added", description: "Device Agents table shows relative Last seen immediately after Version with the exact timestamp on hover" },
      { type: "changed", description: "ESPHome Toggle is disabled until the selected entity has a known boolean state" }
    ]
  },
  "1.41.0": {
    releasedAt: "2026-09-15T01:20:00+02:00",
    patch: "PR-186-esphome-multi-entity-control-v1.patch",
    changes: [
      { type: "added", description: "ESPHome Device Control displays all controllable light/switch entities with per-entity state and On/Off/Toggle actions" },
      { type: "changed", description: "ESPHome Device Control dialog is wider and ESPHOME_ENTITY is treated as the persisted default instead of limiting interactive control" },
      { type: "fixed", description: "ESPHome entity controls no longer rely on a Select that can reopen after control-state refreshes" }
    ]
  },
  "1.40.1": {
    releasedAt: "2026-09-15T01:05:00+02:00",
    patch: "PR-185-esphome-entity-save-identity-payload-v1.patch",
    changes: [
      { type: "fixed", description: "Strip database identity ids before persisting ESPHOME_ENTITY from Device Control" }
    ]
  },
  "1.40.0": {
    releasedAt: "2026-09-15T00:20:00+02:00",
    patch: "PR-184-esphome-entity-selection-v1.patch",
    changes: [
      { type: "added", description: "ESPHome Device Control lists controllable light/switch entities and can persist the selected ESPHOME_ENTITY identity" },
      { type: "changed", description: "ESPHome Device Control avoids issuing GET_STATE until an entity can be resolved when multiple entities are exposed" },
      { type: "fixed", description: "Device Agent clipboard feedback coalesces its auto-dismiss timer and cleans it up when the panel unmounts" }
    ]
  },
  "1.39.3": {
    releasedAt: "2026-09-14T23:59:00+02:00",
    patch: "PR-183-discovery-provider-storage-key-hotfix-v1.patch",
    changes: [
      { type: "fixed", description: "Define the Discover devices provider localStorage key used by provider persistence" }
    ]
  },
  "1.39.2": {
    releasedAt: "2026-09-14T22:30:00+02:00",
    patch: "PR-182-discovery-provider-last-seen-width-v1.patch",
    changes: [
      { type: "changed", description: "Discover devices remembers the last selected provider when reopening the dialog" },
      { type: "changed", description: "Gateways table uses a fixed width for the Last seen column" }
    ]
  },
  "1.39.1": {
    releasedAt: "2026-09-14T21:35:00+02:00",
    patch: "PR-181-device-registry-filter-copy-feedback-v1.patch",
    changes: [
      { type: "changed", description: "Device Registry Class and Type filter options are sorted alphabetically" },
      { type: "added", description: "Device Agent and Monitoring Agent token/environment copy actions show clipboard confirmation notifications" }
    ]
  },
  "1.39.0": {
    releasedAt: "2026-09-14T20:20:00+02:00",
    patch: "PR-180-esphome-discovery-import-v1.patch",
    changes: [
      { type: "added", description: "Device Agent discovery UI supports ESPHome mDNS results and shows controllable entities" },
      { type: "added", description: "Discovered ESPHome nodes can be imported or updated in Device Registry using MAC and hostname identities" },
      { type: "changed", description: "ESPHome discovery registration uses the local Device Agent and auto-selects ESPHOME_ENTITY when exactly one controllable entity is advertised" }
    ]
  },
  "1.38.0": {
    releasedAt: "2026-09-14T20:10:00+02:00",
    patch: "PR-179-esphome-provider-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Control supports ESPHome light and switch power actions through the Device Agent Native API provider" },
      { type: "added", description: "Device Registry Address cells expose a green copy action for the primary IP address" },
      { type: "changed", description: "ESPHome Device Agent assignment documents ESPHOME_ENTITY selection for multi-entity nodes" }
    ]
  },
  "1.37.0": {
    releasedAt: "2026-09-14T18:50:00+02:00",
    patch: "PR-178-yeelight-richer-control-ui-v1.patch",
    changes: [
      { type: "added", description: "Yeelight Device Control adds HSV, color presets, Toggle, transition duration and Set default actions" },
      { type: "changed", description: "Discover devices dialog is widened by approximately 15 percent" },
      { type: "changed", description: "Device Registry technology filter options are sorted alphabetically" }
    ]
  },
  "1.36.0": {
    releasedAt: "2026-09-14T09:00:00+02:00",
    patch: "PR-177-yeelight-discovery-registry-lifecycle-v1.patch",
    changes: [
      { type: "added", description: "Yeelight discovery distinguishes New, Registered and Needs update devices using stable Yeelight ID and MAC identities" },
      { type: "added", description: "Registered Yeelight devices can be updated directly from discovery without changing their SensorSphere name or unrelated registry metadata" },
      { type: "changed", description: "Discovery updates refresh DHCP IP, MAC, Yeelight ID, model, firmware, Device Agent and provider metadata while preserving existing Device Registry configuration" }
    ]
  },
  "1.35.1": {
    releasedAt: "2026-09-14T08:20:00+02:00",
    patch: "PR-176-device-control-name-import-radar-v1.patch",
    changes: [
      { type: "fixed", description: "Device Control applies the fresh GET_STATE command result immediately so the Yeelight name is populated reliably" },
      { type: "changed", description: "Discovered Yeelight imports use a stable Yeelight-<last 6 MAC hex> Device Registry name with Yeelight ID fallback" },
      { type: "changed", description: "Device Agent discovery uses a radar icon instead of the previous target glyph" }
    ]
  },
  "1.35.0": {
    releasedAt: "2026-09-14T07:20:00+02:00",
    patch: "PR-175-device-agent-discovery-identity-refresh-ui-v1.patch",
    changes: [
      { type: "changed", description: "Device Agents tab is placed directly after Devices and discovery is visually separated from CRUD actions" },
      { type: "changed", description: "Discovery results are sorted numerically by IP and registered Yeelight devices are matched by Yeelight ID or MAC instead of DHCP address" },
      { type: "changed", description: "Discovered-device actions update only the affected row instead of launching a full discovery scan" },
      { type: "added", description: "Yeelight import includes IP, MAC and YEELIGHT_ID identities when available" }
    ]
  },
  "1.34.0": {
    releasedAt: "2026-09-14T07:10:00+02:00",
    patch: "PR-174-device-agent-discovery-import-control-v1.patch",
    changes: [
      { type: "added", description: "Discovery results can toggle Yeelight power to identify devices visually and can prefill Device Registry import from discovered metadata" },
      { type: "added", description: "Discovery identifies already registered devices by IP and opens them instead of offering a duplicate import" },
      { type: "added", description: "Yeelight Device Control displays the bulb name above Power and allows changing it with SET_NAME" }
    ]
  },
  "1.33.0": {
    releasedAt: "2026-09-14T06:55:00+02:00",
    patch: "PR-173-device-agent-discovered-set-name-v1.patch",
    changes: [
      { type: "added", description: "Discovery results add an Actions column before Name with a Set name action for discovered Yeelight devices" },
      { type: "added", description: "Set name opens an autofocus dialog, executes the action through the discovering Device Agent and automatically refreshes discovery results" }
    ]
  },
  "1.32.0": {
    releasedAt: "2026-09-10T07:10:00+02:00",
    patch: "PR-171-device-agent-discovery-ui-v1.patch",
    changes: [
      { type: "added", description: "Device Agents can launch provider discovery from SensorSphere and display discovered devices in a results dialog" },
      { type: "changed", description: "Device Agent capability badges expose whether each provider supports discovery" }
    ]
  },
  "1.31.0": {
    releasedAt: "2026-09-10T06:45:00+02:00",
    patch: "PR-170-device-agent-yeelight-control-ui-v1.patch",
    changes: [
      { type: "added", description: "Device Registry adds a Device Control dialog for online Yeelight devices assigned to a Device Agent" },
      { type: "added", description: "Yeelight Device Control supports state refresh, power, brightness, RGB color and color temperature through typed Device Agent commands" },
      { type: "changed", description: "Device action rows expose control only when the assigned Device Agent is online and the provider is Yeelight" }
    ]
  },
  "1.30.1": {
    releasedAt: "2026-09-10T06:00:00+02:00",
    patch: "PR-169-device-agent-terminology-layout-v1.patch",
    changes: [
      { type: "changed", description: "Device Registry consistently labels assigned control endpoints as Device Agents instead of Control Agents" },
      { type: "changed", description: "The Devices table shows Device Agent status below the agent name to reduce column width" }
    ]
  },
  "1.30.0": {
    releasedAt: "2026-09-10T05:00:00+02:00",
    patch: "PR-168-device-control-ui-agent-visibility-v1.patch",
    changes: [
      { type: "added", description: "Device Registry Devices replaces the Battery column with a sortable Device Agent column showing the assigned agent and its current status" },
      { type: "changed", description: "Device Agent row actions now match Monitoring Agents in icon style, size and order: edit, copy, regenerate token, delete" },
      { type: "fixed", description: "Device Registry API responses expose controlAgentId alongside the existing Device Agent summary" }
    ]
  },
  "1.29.2": {
    releasedAt: "2026-09-09T07:10:00+02:00",
    patch: "PR-167-device-agent-token-copy-environment-v1.patch",
    changes: [
      { type: "fixed", description: "Device Agent token copy uses the same clipboard fallback as Monitoring Agents so copying also works in insecure HTTP contexts" },
      { type: "changed", description: "Device Agent token dialog provides separate copy actions for the token and for SensorSphere URL plus device-agent token environment variables" }
    ]
  },
  "1.29.1": {
    releasedAt: "2026-09-09T06:30:00+02:00",
    patch: "PR-166-device-agent-dialog-event-focus-fix-v1.patch",
    changes: [
      { type: "fixed", description: "Device Agent dialog captures input values before queued state updates to avoid null currentTarget crashes while typing" },
      { type: "changed", description: "Device Agent dialogs explicitly focus the first database field, Name, when opened" }
    ]
  },
  "1.29.0": {
    releasedAt: "2026-09-09T06:45:00+02:00",
    patch: "PR-164-device-control-websocket-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add Device Agents management and Device Agent assignment to Device Registry devices" },
      { type: "changed", description: "Access Link publication indicators use a brighter green when published and a more attenuated gray otherwise" }
    ]
  },
  "1.28.3": {
    releasedAt: "2026-09-08T21:30:00+02:00",
    patch: "PR-163-access-link-service-publication-indicator-v1.patch",
    changes: [
      { type: "changed", description: "Access link glyphs show a green publication dot when published in Service Registry and a gray dot otherwise, including Device Registry and the Access Links editor" }
    ]
  },
  "1.28.2": {
    releasedAt: "2026-09-08T21:15:00+02:00",
    patch: "PR-162-device-access-identity-type-order-v1.patch",
    changes: [
      { type: "changed", description: "Device Registry access actions, Access Links and Identities & addresses tables are ordered alphabetically by type" }
    ]
  },
  "1.28.1": {
    releasedAt: "2026-09-08T21:00:00+02:00",
    patch: "PR-161-device-health-refresh-empty-unprofiled-v1.patch",
    changes: [
      { type: "fixed", description: "Device Registry refreshes device health periodically so stabilized monitoring state changes are reflected without a page reload" },
      { type: "changed", description: "Devices without a Health Profile leave the Health table cell empty instead of displaying UNKNOWN" }
    ]
  },
  "1.28.0": {
    releasedAt: "2026-09-08T22:30:00+02:00",
    patch: "PR-160-device-health-monitoring-integration-v1.patch",
    changes: [
      { type: "added", description: "Health Profiles expose Ignore, Any PING up and All PING up monitoring policies" },
      { type: "changed", description: "Health Profiles table displays and sorts the configured monitoring policy" }
    ]
  },
  "1.27.0": {
    releasedAt: "2026-09-08T00:40:00+02:00",
    patch: "PR-158-monitoring-agent-connection-origin-led-strip-icon-v1.patch",
    changes: [
      { type: "added", description: "Monitoring Agents displays agent local IP separately from the HTTP source IP, X-Forwarded-For and X-Real-IP connection metadata" },
      { type: "changed", description: "Monitoring and Device Registry check counters are green when at least one check is assigned" },
      { type: "changed", description: "LED Strip devices use a dedicated led-strip glyph instead of the generic bulb icon" }
    ]
  },
  "1.26.0": {
    releasedAt: "2026-09-08T00:25:00+02:00",
    patch: "PR-157-monitoring-table-scroll-check-counts-led-strip-v1.patch",
    changes: [
      { type: "fixed", description: "Monitoring Agents and Device Checks use the same internal scroll viewport and sticky table header as Device Registry Devices" },
      { type: "added", description: "Monitoring Agents shows the number of assigned checks and Device Registry Devices shows the number of device checks" },
      { type: "added", description: "Device Registry taxonomy includes LED Strip as an IoT Lighting device type" }
    ]
  },
  "1.25.1": {
    releasedAt: "2026-09-08T00:15:00+02:00",
    patch: "PR-156-monitoring-check-status-service-taxonomy-table-fix-v1.patch",
    changes: [
      { type: "changed", description: "Device identity PING shortcut is green when a check will be added and blue when an existing check will be edited" },
      { type: "fixed", description: "Service Registry Taxonomy tables remain visible while keeping persistent filtering and sorting" },
      { type: "fixed", description: "Raspberry Pi taxonomy switches existing records from the generic server icon to the dedicated raspberry-pi glyph" }
    ]
  },
  "1.25.0": {
    releasedAt: "2026-09-07T23:55:00+02:00",
    patch: "PR-155-monitoring-target-resolution-check-management-service-taxonomy-v1.patch",
    changes: [
      { type: "fixed", description: "Device Checks resolves PRIMARY_IP, PRIMARY_FQDN and PRIMARY_ADDRESS targets as well as symbolic identity targets" },
      { type: "changed", description: "Device identity checks use a dedicated Checks column and edit an existing matching PING check instead of creating duplicates" },
      { type: "added", description: "Raspberry Pi device taxonomy uses a dedicated raspberry glyph" },
      { type: "changed", description: "Service Registry Taxonomy classes and types gain persistent filters, active-filter emphasis and persistent sortable columns" }
    ]
  },
  "1.24.0": {
    releasedAt: "2026-09-07T23:30:00+02:00",
    patch: "PR-154-device-identity-ping-check-filter-emphasis-raspberry-pi-v1.patch",
    changes: [
      { type: "added", description: "Device IP identity actions can prefill a PING monitoring check for the selected identity and return to Edit device after completion" },
      { type: "changed", description: "Device Checks shows the resolved address below symbolic identity targets" },
      { type: "changed", description: "Active filters use a 2px primary border across Device Registry and Service Registry filter bars" },
      { type: "added", description: "Device Registry taxonomy includes Raspberry Pi as a Compute single-board-computer type" }
    ]
  },
  "1.23.0": {
    releasedAt: "2026-09-07T23:15:00+02:00",
    patch: "PR-153-device-registry-table-filter-sort-monitoring-migration-v1.patch",
    changes: [
      { type: "added", description: "Add persistent filter bars with reset and persistent column sorting to Monitoring Agents, Device Checks, Health Profiles and Device Taxonomy tables" },
      { type: "added", description: "Device Checks shows Device class, type and technologies with taxonomy icons and colors immediately after Device Name" },
      { type: "fixed", description: "Ship the missing monitoring agent_labels database migration required by agent-reported heartbeat labels" }
    ]
  },
  "1.22.0": {
    releasedAt: "2026-09-07T22:10:00+02:00",
    patch: "PR-152-monitoring-agent-reported-labels-v1.patch",
    changes: [
      { type: "added", description: "Monitoring Agents table shows agent-reported labels independently from SensorSphere-managed labels" },
      { type: "changed", description: "Generated monitor-agent environment example includes the optional AGENT_LABELS setting" }
    ]
  },
  "1.21.1": {
    releasedAt: "2026-09-06T22:11:00+02:00",
    patch: "PR-151-monitoring-identity-targets-service-table-fonts-v2.patch",
    changes: [
      { type: "fixed", description: "Monitoring Device selector opens only from explicit user interaction and stays closed during dialog rerenders and target changes" },
      { type: "fixed", description: "Monitoring check validation and save errors are displayed inside the Add/Edit check dialog" }
    ]
  },
  "1.21.0": {
    releasedAt: "2026-09-06T22:15:00+02:00",
    patch: "PR-151-monitoring-identity-targets-service-table-fonts-v1.patch",
    changes: [
      { type: "added", description: "Monitoring checks can select an existing Device Registry IP/FQDN identity and custom targets autocomplete identity templates" },
      { type: "fixed", description: "Monitoring check dialogs focus Check name instead of auto-opening the Device select" },
      { type: "changed", description: "Service Registry Services and Taxonomy tables use the same compact table typography as Device Registry" },
      { type: "changed", description: "Generated monitoring-agent environment variables contain only SensorSphere URL and bearer token" }
    ]
  },
  "1.20.4": {
    releasedAt: "2026-09-06T15:45:00+02:00",
    patch: "PR-150-monitoring-foundation-v5.patch",
    changes: [
      { type: "changed", description: "Align Device and Monitoring action columns and use the Monitoring copy action style consistently" }
    ]
  },
  "1.20.3": {
    releasedAt: "2026-09-06T15:35:00+02:00",
    patch: "PR-150-monitoring-foundation-v4.patch",
    changes: [
      { type: "changed", description: "Use the current SensorSphere browser origin in generated monitor-agent environment variables" },
      { type: "added", description: "Add copy actions for monitoring agents and monitoring checks" }
    ]
  },
  "1.20.2": {
    releasedAt: "2026-09-06T15:20:00+02:00",
    patch: "PR-150-monitoring-foundation-v3.patch",
    changes: [
      { type: "fixed", description: "Monitoring token copy works in HTTP/insecure contexts using a clipboard fallback" },
      { type: "changed", description: "Monitoring token dialog adds inline copy actions for the token and complete agent environment variables" }
    ]
  },
  "1.20.1": {
    releasedAt: "2026-09-06T15:03:00+02:00",
    patch: "PR-150-monitoring-foundation-v2.patch",
    changes: [
      { type: "fixed", description: "Capture Monitoring dialog event values before queued state updates to avoid null currentTarget crashes" }
    ]
  },
  "1.20.0": {
    releasedAt: "2026-09-06T14:45:00+02:00",
    patch: "PR-150-monitoring-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add Device Registry Monitoring tab for agents, token provisioning and generic device checks" },
      { type: "added", description: "Add monitoring summary cards, multi-agent assignment and failover configuration UI" }
    ]
  },
  "1.19.1": {
    releasedAt: "2026-09-06T15:00:00+02:00",
    patch: "PR-149-service-registry-foundation-v9.patch",
    changes: [
      { type: "changed", description: "Device and Service Registry statistics use the same visual card language as Overview with colored accent borders and badges" },
      { type: "changed", description: "Registry filter rows use the standard SensorSphere ResetFiltersAction as the first control" }
    ]
  },
  "1.19.0": {
    releasedAt: "2026-09-06T14:10:00+02:00",
    patch: "PR-149-service-registry-foundation-v8.patch",
    changes: [
      { type: "added", description: "Device and Service Registry pages add compact summary statistic cards" },
      { type: "added", description: "Registry tabs including taxonomy sub-tabs, filters and table sort preferences persist across navigation and reloads" },
      { type: "changed", description: "Device access-link tables show a compact published-service indicator" }
    ]
  },
  "1.18.2": {
    releasedAt: "2026-09-06T13:40:00+02:00",
    patch: "PR-149-service-registry-foundation-v7.patch",
    changes: [
      { type: "added", description: "Service Registry adds WebUI and App Protocol taxonomy for browser and application-protocol access links" },
      { type: "fixed", description: "Changing a Service class immediately selects a valid type from the new class" },
      { type: "fixed", description: "Empty Published service name values remain empty and use the access-link name only when projected for display" }
    ]
  },
  "1.18.1": {
    releasedAt: "2026-09-06T13:24:00+02:00",
    patch: "PR-149-service-registry-foundation-v6.patch",
    changes: [
      { type: "changed", description: "Device class, type and technology choices are sorted alphabetically in Add/Edit Device" },
      { type: "changed", description: "Published Device access links can omit a service name and use the access link name automatically" }
    ]
  },
  "1.18.0": {
    releasedAt: "2026-09-06T13:30:00+02:00",
    patch: "PR-149-service-registry-foundation-v4.patch",
    changes: [
      { type: "added", description: "Device taxonomy includes a Compute / Backup Server type for systems such as Proxmox Backup Server" },
      { type: "changed", description: "Service classes and types are presented alphabetically and service names identify native versus Device Registry projected sources with distinct icons" },
      { type: "fixed", description: "Projected Device Registry service access URLs resolve with the source device identities instead of appearing disabled without explanation" },
      { type: "changed", description: "Editing a projected service opens its exact source access link and returns to Service Registry after the source device is saved" }
    ]
  },
  "1.17.0": {
    releasedAt: "2026-09-06T12:45:00+02:00",
    patch: "PR-149-service-registry-foundation-v2.patch",
    changes: [
      { type: "added", description: "Device access links can be published as read-only projected services without duplicating their URLs" },
      { type: "added", description: "Service Registry supports native service copy, source filtering and direct navigation to a projected service source device" },
      { type: "fixed", description: "Changing a Service class clears the incompatible selected type immediately" }
    ]
  },
  "1.16.0": {
    releasedAt: "2026-09-06T12:00:00+02:00",
    patch: "PR-149-service-registry-foundation-v1.patch",
    changes: [
      { type: "added", description: "Add Service Registry UI for services, accounts, resources, access links and Device Registry links" },
      { type: "added", description: "Add managed Service Registry classes and types with icon/color taxonomy" }
    ]
  },
  "1.15.8": {
    releasedAt: "2026-09-06T11:15:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v8.patch",
    changes: [
      { type: "fixed", description: "Enforce unique IP identities across devices and align KVM color with Network" }
    ]
  },
  "1.15.7": {
    releasedAt: "2026-09-06T10:55:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v7.patch",
    changes: [
      { type: "added", description: "Network taxonomy includes a KVM device type" },
      { type: "changed", description: "Device table displays the configured Location icon and uses green for the Copy action" },
      { type: "changed", description: "Copy Device keeps original identity/address values so uniqueness checks can identify conflicts explicitly" },
      { type: "fixed", description: "Legacy global identity uniqueness is removed so duplicate non-hardware identities such as IP addresses no longer cause database 500 errors" }
    ]
  },
  "1.15.6": {
    releasedAt: "2026-09-06T09:20:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v6.patch",
    changes: [
      { type: "added", description: "Devices can be copied with reusable configuration preserved while hardware/network identities are neutralized for safe editing" },
      { type: "added", description: "Device table supports sortable columns plus dedicated Name and Address filters, with taxonomy columns ordered before Location" },
      { type: "changed", description: "Access-link icon choices are alphabetized and display their glyphs; access icons also support configurable colors" },
      { type: "changed", description: "Device Location selector displays the configured location icon in both options and the selected value" }
    ]
  },
  "1.15.5": {
    releasedAt: "2026-09-06T09:00:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v5.patch",
    changes: [
      { type: "changed", description: "Device deletion now uses the standard SensorSphere confirmation dialog pattern used by Gateways" },
      { type: "changed", description: "Device taxonomy Classes use colored icons with plain labels instead of badges" },
      { type: "fixed", description: "Device access links open with a no-referrer policy for embedded Web UIs that reject cross-site Referer headers" }
    ]
  },
  "1.15.3": {
    releasedAt: "2026-09-06T08:20:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v3.patch",
    changes: [
      { type: "fixed", description: "Device Registry now participates in the viewport-constrained AppShell layout so its device table receives a real scrollable height" },
      { type: "changed", description: "Device technology values keep their taxonomy-defined icon and color in table and filter selectors" }
    ]
  },
  "1.15.2": {
    releasedAt: "2026-09-06T07:30:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v2.patch",
    changes: [
      { type: "fixed", description: "Device Registry table viewport no longer collapses to zero height, so unfiltered devices are visible" },
      { type: "changed", description: "Device technology values render with their taxonomy-defined icon and color in the device table" }
    ]
  },
  "1.15.0": {
    releasedAt: "2026-09-06T08:00:00+02:00",
    patch: "PR-148-device-registry-usability-multi-identities-v1.patch",
    changes: [
      { type: "added", description: "Device editor manages multiple labeled identities and warns immediately when a MAC or IEEE address belongs to another device" },
      { type: "changed", description: "Class, type and technology selectors and filters display their taxonomy icons and colors" },
      { type: "fixed", description: "Device table keeps a constrained internal scroll viewport and remains visible when no filters are active" },
      { type: "changed", description: "Access-link placeholders resolve primary device identities while preserving labeled identity placeholders" }
    ]
  },
  "1.14.0": {
    releasedAt: "2026-09-06T07:15:00+02:00",
    patch: "PR-147-device-registry-identities-access-taxonomy-v1.patch",
    changes: [
      { type: "added", description: "Device Registry adds first-class MAC, IP, IEEE and FQDN/hostname fields plus searchable address display" },
      { type: "added", description: "Devices support multiple templated access links with username, port, custom parameters, placeholders and resolved previews" },
      { type: "added", description: "Device classes, types and technologies are managed from a Taxonomy tab with icon and color metadata" },
      { type: "changed", description: "Device class and type badges use taxonomy-defined icons and colors" }
    ]
  },
  "1.13.0": {
    releasedAt: "2026-09-05T22:40:00+02:00",
    patch: "PR-146-device-registry-reference-data-v1.patch",
    changes: [
      { type: "changed", description: "Device Registry navigation now appears directly below Gateway Coverage" },
      { type: "added", description: "Device types use a prefilled reference catalog grouped by device class and category" },
      { type: "added", description: "Devices can use multiple technologies selected from a prefilled reference catalog" }
    ]
  },
  "1.12.0": {
    releasedAt: "2026-09-05T19:05:00+02:00",
    patch: "PR-145-device-registry-foundation-v1.patch",
    changes: [
      { type: "added", description: "Device Registry foundation for IoT, network, compute, infrastructure and virtual equipment" },
      { type: "added", description: "Device inventory supports identities, parent relationships, locations, health profiles and optional SensorSphere Sensor, Asset and Gateway links" },
      { type: "added", description: "Device health overview evaluates last-seen, battery and RSSI thresholds while preserving UNKNOWN and DISABLED states" }
    ]
  },
  "1.11.4": {
    releasedAt: "2026-08-30T23:40:00+02:00",
    patch: "PR-144-navigation-history-controls-ui-v1.patch",
    changes: [
      { type: "changed", description: "Expanded navigation labels stay on a single line instead of wrapping" },
      { type: "changed", description: "History toolbar buttons and refresh interval selector use the same compact sizing as Add graph" }
    ]
  },
  "1.11.3": {
    releasedAt: "2026-08-30T23:25:00+02:00",
    patch: "PR-143-asset-detail-chart-single-mount-v1.patch",
    changes: [
      { type: "fixed", description: "Asset detail History mounts its ECharts graph only after the details modal enter transition completes" },
      { type: "fixed", description: "Asset detail History keeps a stable time-window endpoint for the lifetime of each details dialog opening" }
    ]
  },
  "1.11.2": {
    releasedAt: "2026-08-30T20:55:00+02:00",
    patch: "PR-142-dialog-save-asset-history-interactions-v1.patch",
    changes: [
      { type: "fixed", description: "Asset detail History waits for all requested series before rendering and avoids immediate duplicate modal refetches" },
      { type: "added", description: "Ctrl+S activates the Save action in frontend dialogs that expose a Save button" },
      { type: "fixed", description: "History graph half/full width changes apply immediately without requiring Save" }
    ]
  },
  "1.11.1": {
    releasedAt: "2026-08-30T20:45:00+02:00",
    patch: "PR-141-ui-consistency-followup-v1.patch",
    changes: [
      { type: "fixed", description: "Metric Routing no longer renders a stray color attribute beside the Decision filter" },
      { type: "changed", description: "Overview places the Current readings asset counter beside the section heading instead of consuming filter-row width" },
      { type: "changed", description: "Standard dashboard actions remain visible while another dashboard group is selected and disable when they have no Standard target" },
      { type: "changed", description: "Dashboard template editing uses a distinct template-grid edit icon instead of the dashboard rename pencil" },
      { type: "changed", description: "Asset cards use compact icon actions for Edit and View details to match other catalog views" }
    ]
  },
  "1.11.0": {
    releasedAt: "2026-08-30T20:32:00+02:00",
    patch: "PR-140-ui-harmonization-v1.patch",
    changes: [
      { type: "changed", description: "Overview keeps summary, attention and alerts visible while Current readings scroll independently" },
      { type: "changed", description: "Dashboard and Overview refresh actions display their automatic refresh interval inside the button" },
      { type: "changed", description: "Dashboard actions use compact icons beside the dashboard group instead of occupying the page header" },
      { type: "changed", description: "History controls use a denser vertical layout and blue edit actions" },
      { type: "changed", description: "Assets compact view uses the shared pencil edit action and the Asset editor fits the viewport without an internal scrollbar" },
      { type: "changed", description: "Topology navigation is temporarily disabled and Versions now appears below Project Todos" },
      { type: "fixed", description: "Metric Routing title appears above routing tabs and stray color attribute text is removed" },
      { type: "fixed", description: "Navbar build information stays on one line for each module" }
    ]
  },
  "1.10.1": {
    releasedAt: "2026-08-30T07:25:00+02:00",
    patch: "PR-139-dialog-focus-history-restore-v1.patch",
    changes: [
      { type: "fixed", description: "Dialogs now move focus from framework controls such as the close button to the first editable field" },
      { type: "fixed", description: "Dialogs whose editable content mounts after the dialog container also receive consistent first-field focus" },
      { type: "fixed", description: "History waits for the persisted configuration before rendering so returning to History no longer flashes My Views before the previously selected view" }
    ]
  },
  "1.10.0": {
    releasedAt: "2026-08-30T07:05:00+02:00",
    patch: "PR-138-history-view-rename-dialog-focus-v1.patch",
    changes: [
      { type: "fixed", description: "Project Todos dialogs no longer render stray color attribute text beside action buttons" },
      { type: "changed", description: "History views are sorted alphabetically including the built-in My Views entry" },
      { type: "added", description: "History views can be renamed from a blue edit action without changing their stable identity" },
      { type: "changed", description: "Dialogs automatically focus their first editable field, including History view creation, rename and save dialogs" },
      { type: "changed", description: "History view controls expose stable form identifiers for more consistent browser and accessibility integration" }
    ]
  },
  "1.9.2": {
    releasedAt: "2026-08-30T06:55:00+02:00",
    patch: "PR-137-history-view-interactions-v1.patch",
    changes: [
      { type: "fixed", description: "New History tabs and views start with one empty graph instead of preselecting the first Asset metrics" },
      { type: "fixed", description: "The active History tab can be deleted without stale state restoring it" },
      { type: "changed", description: "Saving Template History now persists immediately and opens the new view in regular History" },
      { type: "changed", description: "History view choices are alphabetically sorted with My Views kept first" },
      { type: "fixed", description: "New History view name input reliably receives focus when its dialog opens" }
    ]
  },
  "1.9.1": {
    releasedAt: "2026-08-29T23:15:00+02:00",
    patch: "PR-136-history-tabs-navigation-v1.patch",
    changes: [
      { type: "added", description: "Deleting a History tab now requires explicit confirmation" },
      { type: "fixed", description: "Add tab atomically creates and selects the new tab instead of restoring the first tab" },
      { type: "changed", description: "Temporary Template History navigation appears directly below History" }
    ]
  },
  "1.9.0": {
    releasedAt: "2026-08-29T23:05:00+02:00",
    patch: "PR-135-history-views-dashboard-template-ui-v1.patch",
    changes: [
      { type: "added", description: "History views can be created and deleted directly from the History view selector" },
      { type: "changed", description: "History and Alerts titles now render above their view or tab controls for consistent page hierarchy" },
      { type: "changed", description: "Dashboard template actions stay visible, selected templates use the primary color and template names have more space" }
    ]
  },
  "1.8.0": {
    releasedAt: "2026-08-29T20:30:00+02:00",
    patch: "PR-134-history-view-groups-v2.patch",
    changes: [
      { type: "added", description: "History groups tabs into named views with My Views preserving the existing configuration" },
      { type: "added", description: "Template History sessions can be saved as independent persistent History views" }
    ]
  },
  "1.7.1": {
    releasedAt: "2026-08-29T15:55:00+02:00",
    patch: "PR-132-dashboard-template-ephemeral-history-v4.patch",
    changes: [
      {
        type: "fixed",
        description: "Template History now renders exclusively instead of leaving the source dashboard visible above it"
      },
      {
        type: "fixed",
        description: "Primary navigation scrolls independently so temporary Template History does not overlap footer navigation"
      }
    ]
  },
  "1.7.0": {
    releasedAt: "2026-08-29T15:50:00+02:00",
    patch: "PR-132-dashboard-template-ephemeral-history-v3.patch",
    changes: [
      {
        type: "changed",
        description: "Template-generated History runs in a dedicated temporary navigation entry instead of replacing the persistent History page"
      },
      {
        type: "changed",
        description: "Template History removes the vertical-space banner and identifies its temporary session through the dynamic navigation item and page title"
      }
    ]
  },
  "1.6.1": {
    releasedAt: "2026-08-29T15:32:00+02:00",
    patch: "PR-132-dashboard-template-ephemeral-history-v2.patch",
    changes: [
      {
        type: "changed",
        description: "Dashboard template History launch uses the violet History navigation icon beside template edit and detach actions"
      },
      {
        type: "changed",
        description: "Ephemeral History reset and back actions are grouped beside Export tab with a compact separator"
      }
    ]
  },
  "1.6.0": {
    releasedAt: "2026-08-29T13:40:00+02:00",
    patch: "PR-132-dashboard-template-ephemeral-history-v1.patch",
    changes: [
      {
        type: "added",
        description: "Dashboard templates can open an ephemeral History view where each template metric becomes a tab, each section becomes a graph and matching Assets become curves"
      },
      {
        type: "added",
        description: "Ephemeral template History can be reset or closed without changing the dashboard template or the persisted History configuration"
      }
    ]
  },
  "1.5.3": {
    releasedAt: "2026-08-29T13:26:00+02:00",
    patch: "PR-131-project-todos-local-scroll-v4.patch",
    changes: [
      {
        type: "fixed",
        description: "Project Todos separates the constrained scroll viewport from the natural-height List and Board content so overflowing items create an internal scrollbar instead of being compressed"
      }
    ]
  },
  "1.5.2": {
    releasedAt: "2026-08-29T12:45:00+02:00",
    patch: "PR-131-project-todos-local-scroll-v3.patch",
    changes: [
      {
        type: "fixed",
        description: "Project Todos forces the List and Board content areas to consume only remaining viewport height so their internal vertical scrollbars activate"
      }
    ]
  },
  "1.5.1": {
    releasedAt: "2026-08-29T12:34:00+02:00",
    patch: "PR-131-project-todos-local-scroll-v2.patch",
    changes: [
      {
        type: "fixed",
        description: "Project Todos constrains the panel height so List and Board vertical scrollbars are visible inside their content areas"
      }
    ]
  },
  "1.5.0": {
    releasedAt: "2026-08-29T12:23:00+02:00",
    patch: "PR-131-project-todos-local-scroll-v1.patch",
    changes: [
      {
        type: "fixed",
        description: "Project Todos keeps vertical scrolling inside the List table area or the Board kanban instead of the browser page"
      }
    ]
  },
  "1.4.0": {
    releasedAt: "2026-08-29T09:32:00+02:00",
    patch: "PR-130-actions-icons-last-seen-v1.patch",
    changes: [
      {
        type: "changed",
        description: "Last seen displays relative age with the exact timestamp available on hover"
      },
      {
        type: "changed",
        description: "Table and card actions use consistent icon-only controls with tooltips for edit, delete, blacklist and reactivate actions"
      }
    ]
  },
  "1.3.0": {
    releasedAt: "2026-08-29T09:20:00+02:00",
    patch: "PR-129-gateways-compact-view-v1.patch",
    changes: [
      {
        type: "changed",
        description: "Gateway web links now use a globe icon for clearer web-interface access"
      },
      {
        type: "changed",
        description: "Compact gateway table removes Version, MAC, SSID and Assets columns"
      }
    ]
  },
  "1.2.0": {
    releasedAt: "2026-08-29T08:20:00+02:00",
    patch: "PR-128-gateway-ip-web-link-v1.patch",
    changes: [
      {
        type: "added",
        description: "Direct web interface link from gateway IP addresses"
      }
    ]
  },
  "1.1.0": {
    releasedAt: "2026-08-29T06:10:15+02:00",
    patch: "PR-127-versions-module-filter-v1.patch",
    changes: [
      {
        type: "added",
        description: "Module filter in Versions and changelog"
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
        description: "Versions and changelog user interface"
      },
      {
        type: "added",
        description: "Module version information in application navigation"
      }
    ]
  }
};
