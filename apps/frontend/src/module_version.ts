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
export const MODULE_VERSION = "1.5.2";

export const MODULE_CHANGELOG:
Record<string, ModuleChangelogEntry> = {
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
