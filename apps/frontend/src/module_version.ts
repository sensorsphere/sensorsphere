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
export const MODULE_VERSION = "1.9.2";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
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
