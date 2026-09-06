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
export const MODULE_VERSION = "1.15.6";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
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
