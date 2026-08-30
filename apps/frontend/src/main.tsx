import React from "react";

import { activeFilterStyles } from "./filterStyles";
import { BadgeSelect } from "./BadgeSelect";
import ReactDOM from "react-dom/client";

import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Burger,
  Button,
  Card,
  Container,
  Group,
  Loader,
  MantineProvider,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  useMantineColorScheme
} from "@mantine/core";

import "@mantine/core/styles.css";

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery
} from "@tanstack/react-query";

import {
  createAsset,
  createAssetType,
  createManufacturer,
  createTag,
  deleteAsset,
  deleteAssetType,
  deleteManufacturer,
  deleteTag,
  getAssetClassification,
  getAssets,
  getGateways,
  getLocations,
  getLatestObservations,
  getMetricDisplaySettings,
  getRuntimeConfig,
  getModuleVersions,
  getFrontendBuildDate,
  getSimpleDashboards,
  getProjectTodos,
  getSensors,
  updateAsset,
  updateAssetLocation,
  updateAssetType,
  updateManufacturer,
  updateTag
} from "./api";

import {
  AssetLatestCard
} from "./AssetLatestCard";

import {
  AddMetricToDashboardModal
} from "./AddMetricToDashboardModal";
import { DashboardMetricAction } from "./DashboardMetricAction";
import { EditActionIcon } from "./TableActionIcons";

import {
  SensorCatalog
} from "./SensorCatalog";

import {
  GatewayCatalog
} from "./GatewayCatalog";

import {
  InventoryPanel
} from "./InventoryPanel";

import {
  TopologyPanel
} from "./TopologyPanel";

import {
  SimpleDashboardPanel
} from "./SimpleDashboardPanel";

import {
  AlertPanel
} from "./AlertPanel";

import {
  HistoryPanel,
  type HistoryTemplateLaunchConfig
} from "./HistoryPanel";

import {
  getActiveAlerts
} from "./alerts-api";

import type {
  Asset,
  AssetMetric,
  AssetTypeMetadata,
  CreateAssetInput,
  Location,
  ManufacturerMetadata,
  TagMetadata,
  UpdateAssetInput
} from "./types";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import {
  LocationIcon,
  getLocationIconName
} from "./LocationIcon";

import {
  ResetFiltersAction
} from "./ResetFiltersAction";
import { LocationFilterField, LocationSelect, locationIdsForScope, matchesLocationFilter } from "./LocationFilterControls";

import {
  SortableTableHeader,
  compareTableValues,
  type SortDirection
} from "./SortableTableHeader";

import {
  GatewayCoveragePanel
} from "./GatewayCoveragePanel";

import {
  MetricRoutingPanel
} from "./MetricRoutingPanel";

import {
  ProjectTodosPanel
} from "./ProjectTodosPanel";

import {
  VersionsPanel
} from "./VersionsPanel";

import {
  MODULE_VERSION as FRONTEND_MODULE_VERSION
} from "./module_version";

import "./styles.css";

const queryClient =
  new QueryClient();

function formatBuildDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "short",
      timeStyle: "short"
    }
  ).format(date);
}

const favicon =
  document.querySelector<HTMLLinkElement>(
    'link[rel="icon"]'
  ) ?? document.createElement("link");

favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = "/sensorsphere-app.svg?v=26";
document.head.appendChild(favicon);

import {
  NavigationIcon,
  type PageKey
} from "./NavigationIcon";
import { defaultMetricColor } from "./metricVisuals";

function ThemeSelector() {
  const {
    colorScheme,
    setColorScheme
  } = useMantineColorScheme();

  return (
    <Select
      size="xs"
      w={132}
      aria-label="Select theme"
      value={colorScheme}
      onChange={value => {
        if (value === "light" || value === "dark" || value === "auto") {
          setColorScheme(value);
        }
      }}
      data={[
        { value: "light", label: "☀ Light" },
        { value: "dark", label: "☾ Dark" },
        { value: "auto", label: "◐ System" }
      ]}
      allowDeselect={false}
    />
  );
}

const PAGE_LABELS:
Record<PageKey, string> = {
  dashboard:
    "Dashboard",

  dashboards:
    "Dashboards",

  assets:
    "Assets",

  history:
    "History",

  alerts:
    "Alerts",

  inventory:
    "Inventory",

  topology:
    "Topology",

  sensors:
    "Sensors",

  gateways:
    "Gateways",

  "metric-routing":
    "Metric Routing",

  "gateway-coverage":
    "Gateway Coverage",

  versions:
    "Versions",

  todos:
    "Project Todos"
};

function isPageKey(
  value: unknown
): value is PageKey {

  return (
    value === "dashboard" ||
    value === "dashboards" ||
    value === "assets" ||
    value === "history" ||
    value === "alerts" ||
    value === "inventory" ||
    value === "topology" ||
    value === "sensors" ||
    value === "gateways" ||
    value === "metric-routing" ||
    value === "gateway-coverage" ||
    value === "versions" ||
    value === "todos"
  );
}

function isAssetHealthFilter(
  value: unknown
): value is
  | "all"
  | "online"
  | "warning"
  | "offline" {

  return (
    value === "all" ||
    value === "online" ||
    value === "warning" ||
    value === "offline"
  );
}

function isAssetView(
  value: unknown
): value is
  | "cards"
  | "compact" {

  return (
    value === "cards" ||
    value === "compact"
  );
}

function formatAge(
  ageSeconds: number | null
): string {

  if (ageSeconds === null) {
    return "Never";
  }

  if (ageSeconds < 60) {
    return `${ageSeconds} sec ago`;
  }

  const minutes =
    Math.floor(
      ageSeconds / 60
    );

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours} h ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return `${days} day${
    days > 1
      ? "s"
      : ""
  } ago`;
}

function latestMetricValue(
  observations: Array<{
    metricKey: string;
    value: unknown;
  }>,
  metricKey: string
): number | string | null {

  const observation =
    observations.find(
      current =>
        current.metricKey ===
        metricKey
    );

  if (!observation) {
    return null;
  }

  if (
    typeof observation.value ===
      "number" ||
    typeof observation.value ===
      "string"
  ) {
    return observation.value;
  }

  return null;
}

function dashboardIntentKey(kind: "sensor" | "gateway"): string {
  return `dashboard.edit.${kind}`;
}

function setDashboardEditIntent(
  kind: "sensor" | "gateway",
  id: string
): void {
  window.sessionStorage.setItem(
    dashboardIntentKey(kind),
    id
  );
}

function attentionAccent(
  color: string
): React.CSSProperties {
  return {
    borderLeft: `4px solid var(--mantine-color-${color}-6)`,
    background:
      `linear-gradient(135deg, color-mix(in srgb, var(--mantine-color-${color}-6) 8%, transparent), transparent 45%)`
  };
}

interface AssetFormState {
  id: string | null;
  externalId: string;
  description: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  assetType: string;
  protocol: string;
  enabled: boolean;
  tags: string[];
  locationId: string | null;
  warningAfterSeconds: number;
  offlineAfterSeconds: number;
}

function emptyAssetForm(): AssetFormState {
  return {
    id: null,
    externalId: "",
    description: "",
    manufacturer: "",
    model: "",
    firmwareVersion: "",
    assetType: "device",
    protocol: "",
    enabled: true,
    tags: [],
    locationId: null,
    warningAfterSeconds: 300,
    offlineAfterSeconds: 600
  };
}

function assetFormFromAsset(
  asset: Asset
): AssetFormState {
  return {
    id: asset.id,
    externalId: asset.externalId,
    description: asset.description ?? "",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    firmwareVersion: asset.firmwareVersion ?? "",
    assetType: asset.assetType,
    protocol: asset.protocol ?? "",
    enabled: asset.enabled,
    tags: asset.tags,
    locationId: asset.location?.id ?? null,
    warningAfterSeconds: asset.health.warningAfterSeconds,
    offlineAfterSeconds: asset.health.offlineAfterSeconds
  };
}

type ClassificationKind = "assetType" | "manufacturer" | "tag";

interface ClassificationEditorState {
  kind: ClassificationKind;
  originalId: string | null;
  key: string;
  name: string;
  description: string;
}

function emptyClassificationEditor(kind: ClassificationKind): ClassificationEditorState {
  return {
    kind,
    originalId: null,
    key: "",
    name: "",
    description: ""
  };
}

function Dashboard() {

  React.useEffect(() => {
    const editableFieldSelector =
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), select:not([disabled])';

    const focusFirstField = (dialog: Element): void => {
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          dialog.contains(active) &&
          active.matches(editableFieldSelector)
        ) {
          return;
        }

        dialog.querySelector<HTMLElement>(editableFieldSelector)?.focus();
      });
    };

    const observer = new MutationObserver(mutations => {
      const dialogs = new Set<Element>();

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (node.matches('[role="dialog"]')) dialogs.add(node);
          node.querySelectorAll('[role="dialog"]').forEach(dialog => dialogs.add(dialog));

          const containingDialog = node.closest('[role="dialog"]');
          if (containingDialog) dialogs.add(containingDialog);
        }
      }

      dialogs.forEach(focusFirstField);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const handleDialogSaveShortcut = (event: KeyboardEvent): void => {
      if (
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }

      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"]')
      ).filter(dialog => {
        const style = window.getComputedStyle(dialog);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      const dialog = dialogs.at(-1);
      if (!dialog) return;

      const saveButton = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>("button")
      ).find(button =>
        !button.disabled &&
        button.textContent?.trim() === "Save"
      );

      if (!saveButton) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      saveButton.click();
    };

    window.addEventListener("keydown", handleDialogSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleDialogSaveShortcut, true);
  }, []);

  const [
    dashboardRefreshing,
    setDashboardRefreshing
  ] = React.useState(false);

  const [
    dashboardRefreshedAt,
    setDashboardRefreshedAt
  ] = React.useState<Date | null>(null);

  const runtimeConfigQuery =
    useQuery({
      queryKey:
        ["runtime-config"],

      queryFn:
        getRuntimeConfig,

      staleTime:
        Infinity
    });

  const frontendBuildQuery =
    useQuery({
      queryKey:
        ["frontend-build-date"],

      queryFn:
        getFrontendBuildDate,

      staleTime:
        Infinity
    });

  const moduleVersionsQuery =
    useQuery({
      queryKey:
        ["module-versions"],

      queryFn:
        getModuleVersions,

      refetchInterval:
        60_000
    });

  const projectTodosQuery =
    useQuery({
      queryKey:
        ["project-todos"],

      queryFn:
        getProjectTodos,

      refetchInterval:
        30_000
    });

  const instanceName =
    runtimeConfigQuery.data
      ?.instanceName
      ?.trim()
    || "SensorSphere";

  const apiBuildDate =
    runtimeConfigQuery.data
      ?.builds
      ?.api;

  const ingestionBuildDate =
    runtimeConfigQuery.data
      ?.builds
      ?.ingestion;


  const apiModuleVersion =
    moduleVersionsQuery.data
      ?.find(item => item.module === "api")
      ?.version
    ?? null;

  const ingestionModuleVersion =
    moduleVersionsQuery.data
      ?.find(
        item => item.module === "ingestion-service"
      )
      ?.version
    ?? null;

  const [
    activePage,
    setActivePage
  ] =
    usePersistentState<PageKey>(
      "navigation.page",
      "dashboard",
      isPageKey
    );

  const [
    historyTemplateLaunch,
    setHistoryTemplateLaunch
  ] = React.useState<HistoryTemplateLaunchConfig | null>(null);

  const [
    templateHistoryActive,
    setTemplateHistoryActive
  ] = React.useState(false);

  const [
    navbarOpened,
    setNavbarOpened
  ] =
    React.useState(false);

  const [
    navbarCollapsed,
    setNavbarCollapsed
  ] =
    usePersistentState<boolean>(
      "navigation.navbarCollapsed",
      false,
      (
        value
      ): value is boolean =>
        typeof value ===
        "boolean"
    );

  React.useEffect(
    () => {
      document.title =
        instanceName;
    },
    [instanceName]
  );

  const navigateTo =
    (
      page: PageKey
    ): void => {

      setTemplateHistoryActive(
        false
      );

      setActivePage(
        page
      );

      setNavbarOpened(
        false
      );
    };

  const [
    assetSearch,
    setAssetSearch
  ] =
    usePersistentState<string>(
      "assets.search",
      "",
      (
        value
      ): value is string =>
        typeof value ===
        "string"
    );

  const [
    assetHealthFilter,
    setAssetHealthFilter
  ] =
    usePersistentState<
      "all"
      | "online"
      | "warning"
      | "offline"
    >(
      "assets.health",
      "all",
      isAssetHealthFilter
    );

  const [
    assetEnabledFilter,
    setAssetEnabledFilter
  ] =
    usePersistentState<
      "all"
      | "enabled"
      | "disabled"
    >(
      "assets.enabled",
      "all",
      (
        value
      ): value is
        | "all"
        | "enabled"
        | "disabled" =>
          value === "all" ||
          value === "enabled" ||
          value === "disabled"
    );

  const [
    assetLocationFilter,
    setAssetLocationFilter
  ] =
    usePersistentState<
      string | null
    >(
      "assets.locationId",
      null,
      (
        value
      ): value is string | null =>
        value === null ||
        typeof value ===
          "string"
    );

  const [locationIncludeDescendants, setLocationIncludeDescendants] =
    usePersistentState<boolean>(
      "filters.locationIncludeDescendants",
      true,
      (value): value is boolean => typeof value === "boolean"
    );

  const [
    assetTypeFilter,
    setAssetTypeFilter
  ] = usePersistentState<string | null>(
    "assets.assetType",
    null,
    (value): value is string | null => value === null || typeof value === "string"
  );

  const [
    assetManufacturerFilter,
    setAssetManufacturerFilter
  ] = usePersistentState<string | null>(
    "assets.manufacturer",
    null,
    (value): value is string | null => value === null || typeof value === "string"
  );

  const [
    assetTagFilter,
    setAssetTagFilter
  ] = usePersistentState<string | null>(
    "assets.tag",
    null,
    (value): value is string | null => value === null || typeof value === "string"
  );

  const [
    assetView,
    setAssetView
  ] =
    usePersistentState<
      "cards"
      | "compact"
    >(
      "assets.view",
      "cards",
      isAssetView
    );

  const [
    assetTableSortKey,
    setAssetTableSortKey
  ] = React.useState("name");

  const [
    assetTableSortDirection,
    setAssetTableSortDirection
  ] = React.useState<SortDirection>("asc");

  const [
    assetForm,
    setAssetForm
  ] = React.useState<AssetFormState | null>(null);

  const [
    assetPendingDelete,
    setAssetPendingDelete
  ] = React.useState<Asset | null>(null);

  const [
    dashboardMetricTarget,
    setDashboardMetricTarget
  ] = React.useState<{ asset: Asset; metric: AssetMetric } | null>(null);

  const openDashboardMetricTarget = React.useCallback((asset: Asset, metricId: string) => {
    const metric = asset.metrics.find(item => item.id === metricId);
    if (metric) setDashboardMetricTarget({ asset, metric });
  }, []);

  const [
    classificationManagerOpen,
    setClassificationManagerOpen
  ] = React.useState(false);

  const [
    classificationEditor,
    setClassificationEditor
  ] = React.useState<ClassificationEditorState>(
    emptyClassificationEditor("assetType")
  );

  const [
    currentReadingSearch,
    setCurrentReadingSearch
  ] =
    usePersistentState<string>(
      "dashboard.currentReadings.search",
      "",
      (
        value
      ): value is string =>
        typeof value ===
        "string"
    );

  const [
    currentReadingLocation,
    setCurrentReadingLocation
  ] =
    usePersistentState<string | null>(
      "dashboard.currentReadings.location",
      null,
      (value): value is string | null =>
        value === null ||
        typeof value === "string"
    );



  const [
    currentReadingStatus,
    setCurrentReadingStatus
  ] =
    usePersistentState<
      "all" | "enabled" | "disabled"
    >(
      "dashboard.currentReadings.status",
      "all",
      value =>
        value === "all" ||
        value === "enabled" ||
        value === "disabled"
    );

  const [
    currentReadingHealth,
    setCurrentReadingHealth
  ] =
    usePersistentState<
      "all" | "online" | "warning" | "offline"
    >(
      "dashboard.currentReadings.health",
      "all",
      isAssetHealthFilter
    );

  const sensorsQuery =
    useQuery({
      queryKey:
        ["sensors"],

      queryFn:
        getSensors,

      refetchInterval:
        30_000
    });

  const assetsQuery =
    useQuery({
      queryKey:
        ["assets"],

      queryFn:
        getAssets,

      refetchInterval:
        30_000
    });

  const simpleDashboardsQuery =
    useQuery({
      queryKey: ["simple-dashboards"],
      queryFn: getSimpleDashboards,
      refetchInterval: 30_000
    });

  const metricDisplaySettingsQuery =
    useQuery({
      queryKey: ["metric-display-settings"],
      queryFn: getMetricDisplaySettings,
      refetchInterval: 60_000
    });

  const metricDisplayColors = new Map(
    (metricDisplaySettingsQuery.data ?? []).map(setting => [setting.metricKey, setting.color])
  );

  const metricColorForKey = (metricKey: string): string =>
    metricDisplayColors.get(metricKey) ?? defaultMetricColor(metricKey);

  const assetClassificationQuery =
    useQuery({
      queryKey: ["asset-classification"],
      queryFn: getAssetClassification,
      refetchInterval: 60_000
    });

  const locationsQuery =
    useQuery({
      queryKey:
        ["locations"],

      queryFn:
        getLocations,

      refetchInterval:
        60_000
    });

  const saveAssetMutation =
    useMutation({
      mutationFn:
        async (form: AssetFormState) => {
          const commonInput = {
            externalId: form.externalId.trim(),
            description: form.description.trim() || null,
            manufacturer: form.manufacturer.trim() || null,
            model: form.model.trim() || null,
            firmwareVersion: form.firmwareVersion.trim() || null,
            assetType: form.assetType.trim(),
            protocol: form.protocol.trim() || null,
            enabled: form.enabled,
            tags: form.tags
          };

          let saved: Asset;

          if (form.id) {
            const updateInput: UpdateAssetInput = {
              ...commonInput,
              warningAfterSeconds: form.warningAfterSeconds,
              offlineAfterSeconds: form.offlineAfterSeconds
            };

            saved = await updateAsset(
              form.id,
              updateInput
            );
          } else {
            const createInput: CreateAssetInput = commonInput;
            saved = await createAsset(createInput);
          }

          if (
            saved.location?.id !== form.locationId
          ) {
            saved = await updateAssetLocation(
              saved.id,
              form.locationId
            );
          }

          return saved;
        },

      onSuccess:
        async () => {
          setAssetForm(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["assets"] }),
            queryClient.invalidateQueries({ queryKey: ["latest-observations"] })
          ]);
        }
    });

  const deleteAssetMutation =
    useMutation({
      mutationFn:
        (assetId: string) =>
          deleteAsset(assetId),

      onSuccess:
        async () => {
          setAssetPendingDelete(null);
          setAssetForm(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["assets"] }),
            queryClient.invalidateQueries({ queryKey: ["latest-observations"] })
          ]);
        }
    });

  const saveClassificationMutation =
    useMutation({
      mutationFn: async (editor: ClassificationEditorState) => {
        if (editor.kind === "assetType") {
          const payload = {
            key: editor.key.trim().toLowerCase(),
            name: editor.name.trim(),
            description: editor.description.trim() || null
          };
          return editor.originalId
            ? updateAssetType(editor.originalId, payload)
            : createAssetType(payload);
        }

        if (editor.kind === "manufacturer") {
          return editor.originalId
            ? updateManufacturer(editor.originalId, editor.name.trim())
            : createManufacturer(editor.name.trim());
        }

        return editor.originalId
          ? updateTag(editor.originalId, editor.name.trim())
          : createTag(editor.name.trim());
      },
      onSuccess: async () => {
        setClassificationEditor(
          emptyClassificationEditor(classificationEditor.kind)
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["asset-classification"] }),
          queryClient.invalidateQueries({ queryKey: ["assets"] })
        ]);
      }
    });

  const deleteClassificationMutation =
    useMutation({
      mutationFn: async (input: { kind: ClassificationKind; id: string }) => {
        if (input.kind === "assetType") {
          await deleteAssetType(input.id);
        } else if (input.kind === "manufacturer") {
          await deleteManufacturer(input.id);
        } else {
          await deleteTag(input.id);
        }
      },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["asset-classification"] }),
          queryClient.invalidateQueries({ queryKey: ["assets"] })
        ]);
      }
    });

  const gatewaysQuery =
    useQuery({
      queryKey:
        ["gateways"],

      queryFn:
        getGateways,

      refetchInterval:
        30_000
    });

  const observationsQuery =
    useQuery({
      queryKey:
        ["latest-observations"],

      queryFn:
        getLatestObservations,

      refetchInterval:
        30_000
    });

  const activeAlertsQuery =
    useQuery({
      queryKey:
        ["active-alerts"],

      queryFn:
        getActiveAlerts,

      refetchInterval:
        30_000
    });

  React.useEffect(
    () => {

      if (
        assetLocationFilter ===
          null
      ) {
        return;
      }

      const locations = locationsQuery.data ?? [];

      if (locations.length === 0) {
        return;
      }

      const exists = locations.some(location => location.id === assetLocationFilter);

      if (!exists) {
        setAssetLocationFilter(
          null
        );
      }

    },
    [
      assetLocationFilter,
      locationsQuery.data,
      setAssetLocationFilter
    ]
  );

  if (
    assetsQuery.isLoading ||
    gatewaysQuery.isLoading ||
    observationsQuery.isLoading ||
    sensorsQuery.isLoading
  ) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (
    assetsQuery.isError ||
    gatewaysQuery.isError ||
    observationsQuery.isError ||
    sensorsQuery.isError
  ) {
    return (
      <Container py="xl">
        <Text c="red">
          Unable to load SensorSphere data.
        </Text>
      </Container>
    );
  }

  const assets =
    assetsQuery.data ?? [];

  const gateways =
    gatewaysQuery.data ?? [];

  const observations =
    observationsQuery.data ?? [];

  const observationsByAsset =
    new Map<
      string,
      typeof observations
    >();

  for (
    const observation
    of observations
  ) {

    const current =
      observationsByAsset.get(
        observation.assetId
      ) ?? [];

    current.push(
      observation
    );

    observationsByAsset.set(
      observation.assetId,
      current
    );
  }

  const sensors =
    sensorsQuery.data ?? [];

  const sensorsByUid =
    new Map(
      sensors.map(sensor => [
        sensor.uid,
        sensor
      ])
    );

  const isAssetEnabled =
    (asset: Asset): boolean =>
      asset.sensor
        ? sensorsByUid.get(
            asset.sensor.uid
          )?.enabled ?? asset.enabled
        : asset.enabled;

  const enabledAssets =
    assets.filter(
      isAssetEnabled
    ).length;

  const onlineAssets =
    assets.filter(
      asset =>
        asset.health.status ===
        "online"
    );

  const warningAssets =
    assets.filter(
      asset =>
        asset.health.status ===
        "warning"
    );

  const offlineAssets =
    assets.filter(
      asset =>
        asset.health.status ===
        "offline"
    );

  const sortedAssets =
    [...assets]
      .sort(
        (left, right) => {

          const leftName =
            left.sensor?.name
            ?? left.name
            ?? left.externalId;

          const rightName =
            right.sensor?.name
            ?? right.name
            ?? right.externalId;

          return leftName.localeCompare(
            rightName,
            undefined,
            {
              sensitivity: "base"
            }
          );
        }
      );

  const normalizedCurrentReadingSearch =
    currentReadingSearch
      .trim()
      .toLowerCase();

  const currentReadingLocationIds = locationIdsForScope(
    locationsQuery.data ?? [],
    currentReadingLocation,
    locationIncludeDescendants
  );


  const currentReadingAssets =
    sortedAssets.filter(
      asset => {
        const matchesLocation = matchesLocationFilter(
          asset.location?.id,
          currentReadingLocation,
          currentReadingLocationIds
        );

        const matchesStatus =
          currentReadingStatus === "all" ||
          (
            currentReadingStatus === "enabled"
              ? isAssetEnabled(asset)
              : !isAssetEnabled(asset)
          );

        const matchesHealth =
          currentReadingHealth === "all" ||
          asset.health.status ===
            currentReadingHealth;

        if (
          !matchesLocation ||
          !matchesStatus ||
          !matchesHealth
        ) {
          return false;
        }

        if (
          normalizedCurrentReadingSearch
            .length === 0
        ) {
          return true;
        }

        const displayName =
          asset.sensor?.name
          ?? asset.externalId;

        return displayName
          .toLowerCase()
          .includes(
            normalizedCurrentReadingSearch
          );
      }
    );

  const alertSeverityPriority = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2
  } as const;

  const dashboardAlerts =
    [
      ...(
        activeAlertsQuery.data
        ?? []
      )
    ]
      .sort(
        (left, right) =>
          alertSeverityPriority[
            left.severity
          ] -
          alertSeverityPriority[
            right.severity
          ] ||
          new Date(
            right.openedAt
          ).getTime() -
          new Date(
            left.openedAt
          ).getTime()
      )
      .slice(0, 5);

  const assetClassification = assetClassificationQuery.data;
  const assetTypes: AssetTypeMetadata[] = assetClassification?.assetTypes ?? [];
  const manufacturers: ManufacturerMetadata[] = assetClassification?.manufacturers ?? [];
  const tags: TagMetadata[] = assetClassification?.tags ?? [];

  const dashboardMetricUsageDetails = (() => {
    const dashboardsById = new Map(
      (simpleDashboardsQuery.data?.dashboards ?? []).map(dashboard => [dashboard.id, dashboard])
    );
    const sectionsById = new Map(
      (simpleDashboardsQuery.data?.sections ?? []).map(section => [section.id, section])
    );
    const usageByMetric = new Map<string, Map<string, string>>();

    for (const card of simpleDashboardsQuery.data?.cards ?? []) {
      const usageKey = `${card.dashboardId}:${card.sectionId ?? "unsectioned"}`;
      const dashboardName = dashboardsById.get(card.dashboardId)?.name ?? "Unknown dashboard";
      const sectionName = card.sectionId
        ? sectionsById.get(card.sectionId)?.name ?? "Unknown section"
        : "Unsectioned";
      const usages = usageByMetric.get(card.assetMetricId) ?? new Map<string, string>();
      usages.set(usageKey, `${dashboardName} — ${sectionName}`);
      usageByMetric.set(card.assetMetricId, usages);
    }

    return new Map(
      Array.from(usageByMetric.entries()).map(([metricId, usages]) => [
        metricId,
        Array.from(usages.values()).sort((left, right) => left.localeCompare(right))
      ])
    );
  })();

  const assetLocations: Location[] =
    [...(locationsQuery.data ?? [])]
      .sort(
        (left, right) =>
          left.name.localeCompare(
            right.name
          )
      );
  const assetLocationsById = new Map(assetLocations.map(location => [location.id, location]));
  const assetLocationIds = locationIdsForScope(
    assetLocations,
    assetLocationFilter,
    locationIncludeDescendants
  );

  const normalizedAssetSearch =
    assetSearch
      .trim()
      .toLowerCase();

  const filteredAssets =
    sortedAssets.filter(
      asset => {

        const matchesSearch =
          normalizedAssetSearch
            .length === 0 ||
          (
            asset.sensor?.name
            ?? asset.externalId
          )
          .toLowerCase()
          .includes(
            normalizedAssetSearch
          ) ||
          asset.externalId
            .toLowerCase()
            .includes(
              normalizedAssetSearch
            ) ||
          (
            asset.location?.name
            ?? ""
          )
          .toLowerCase()
          .includes(
            normalizedAssetSearch
          ) ||
          (asset.manufacturer ?? "")
            .toLowerCase()
            .includes(normalizedAssetSearch) ||
          asset.assetType
            .toLowerCase()
            .includes(normalizedAssetSearch) ||
          asset.tags.some(tag =>
            tag.toLowerCase().includes(normalizedAssetSearch)
          );

        const matchesHealth =
          assetHealthFilter ===
            "all" ||
          asset.health.status ===
            assetHealthFilter;

        const matchesLocation = matchesLocationFilter(
          asset.location?.id,
          assetLocationFilter,
          assetLocationIds
        );

        const matchesEnabled =
          assetEnabledFilter ===
            "all" ||
          (
            assetEnabledFilter ===
              "enabled"
              ? isAssetEnabled(
                  asset
                )
              : !isAssetEnabled(
                  asset
                )
          );

        const matchesType =
          assetTypeFilter === null ||
          asset.assetType === assetTypeFilter;

        const matchesManufacturer =
          assetManufacturerFilter === null ||
          asset.manufacturer === assetManufacturerFilter;

        const matchesTag =
          assetTagFilter === null ||
          asset.tags.includes(assetTagFilter);

        return (
          matchesSearch &&
          matchesHealth &&
          matchesLocation &&
          matchesEnabled &&
          matchesType &&
          matchesManufacturer &&
          matchesTag
        );
      }
    );

  const sortedTableAssets =
    [...filteredAssets].sort((left, right) => {
      const metric = (asset: Asset, key: string): number | string | null =>
        latestMetricValue(
          observationsByAsset.get(asset.id) ?? [],
          key
        );

      const value = (asset: Asset): string | number | boolean | null | undefined => {
        switch (assetTableSortKey) {
          case "externalId":
            return asset.externalId;
          case "location":
            return asset.location?.name;
          case "assetType":
            return asset.assetType;
          case "manufacturer":
            return asset.manufacturer;
          case "temperature":
            return metric(asset, "temperature");
          case "humidity":
            return metric(asset, "humidity");
          case "rssi":
            return metric(asset, "rssi");
          case "battery":
            return metric(asset, "battery");
          case "enabled":
            return isAssetEnabled(asset);
          case "health":
            return asset.health.status;
          default:
            return asset.sensor?.name ?? asset.externalId;
        }
      };

      return compareTableValues(
        value(left),
        value(right),
        assetTableSortDirection
      );
    });

  const toggleAssetTableSort = (key: string): void => {
    if (assetTableSortKey === key) {
      setAssetTableSortDirection(
        assetTableSortDirection === "asc" ? "desc" : "asc"
      );
    } else {
      setAssetTableSortKey(key);
      setAssetTableSortDirection("asc");
    }
  };

  const assetsWithoutLocation =
    assets.filter(
      asset =>
        asset.location === null
    );

  const sensorsWithoutPrimaryGateway =
    sensors.filter(
      sensor =>
        sensor.enabled &&
        sensor.gateway === null
    );

  const gatewaysWithoutLocation =
    gateways.filter(
      gateway =>
        gateway.enabled &&
        gateway.location === null
    );

  const sensorsWithoutPrimaryGatewayIds =
    new Set(
      sensorsWithoutPrimaryGateway.map(
        sensor => sensor.id
      )
    );

  const configurationIncompleteAssetIds =
    new Set(
      assets
        .filter(asset => {
          if (asset.location === null) {
            return true;
          }

          if (!asset.sensor) {
            return false;
          }

          const sensor =
            sensorsByUid.get(
              asset.sensor.uid
            );

          return Boolean(
            sensor &&
            sensorsWithoutPrimaryGatewayIds.has(
              sensor.id
            )
          );
        })
        .map(asset => asset.id)
    );

  const dashboardOfflineAssets =
    offlineAssets.filter(
      asset =>
        !configurationIncompleteAssetIds.has(
          asset.id
        )
    );

  const dashboardWarningAssets =
    warningAssets.filter(
      asset =>
        !configurationIncompleteAssetIds.has(
          asset.id
        )
    );

  const suppressedHealthCount =
    warningAssets.length +
    offlineAssets.length -
    dashboardWarningAssets.length -
    dashboardOfflineAssets.length;

  const openSensorForCorrection =
    (sensorId: string): void => {
      setDashboardEditIntent(
        "sensor",
        sensorId
      );
      navigateTo("sensors");
    };

  const openGatewayForCorrection =
    (gatewayId: string): void => {
      setDashboardEditIntent(
        "gateway",
        gatewayId
      );
      navigateTo("gateways");
    };

  const openAssetForCorrection =
    (asset: Asset): void => {
      if (asset.sensor) {
        const sensor =
          sensorsByUid.get(
            asset.sensor.uid
          );

        if (sensor) {
          openSensorForCorrection(
            sensor.id
          );
          return;
        }
      }

      setAssetSearch(
        asset.sensor?.name
        ?? asset.externalId
      );
      navigateTo("assets");
    };

  const refreshDashboard =
    async (): Promise<void> => {
      setDashboardRefreshing(true);

      try {
        await Promise.all([
          sensorsQuery.refetch(),
          assetsQuery.refetch(),
          gatewaysQuery.refetch(),
          observationsQuery.refetch(),
          activeAlertsQuery.refetch(),
          projectTodosQuery.refetch()
        ]);

        setDashboardRefreshedAt(
          new Date()
        );
      } finally {
        setDashboardRefreshing(false);
      }
    };

  const assignedLocations =
    new Set(
      assets
        .map(
          asset =>
            asset.location?.id
        )
        .filter(
          (
            locationId
          ): locationId is string =>
            Boolean(locationId)
        )
    ).size;

  const assetsById =
    new Map(
      assets.map(asset => [
        asset.id,
        asset
      ])
    );

  type MetricExtreme = {
    value: number;
    sensorName: string;
  } | null;

  const metricExtremes =
    (
      metricKey: string
    ): {
      min: MetricExtreme;
      max: MetricExtreme;
    } => {

      const values =
        observations
          .filter(
            observation =>
              observation.metricKey ===
                metricKey &&
              typeof observation.value ===
                "number"
          )
          .map(
            observation => {
              const asset =
                assetsById.get(
                  observation.assetId
                );

              if (
                !asset ||
                !isAssetEnabled(asset)
              ) {
                return null;
              }

              return {
                value:
                  observation.value as number,
                sensorName:
                  asset.sensor?.name
                  ?? asset.externalId
              };
            }
          )
          .filter(
            (
              value
            ): value is {
              value: number;
              sensorName: string;
            } =>
              value !== null
          );

      if (values.length === 0) {
        return {
          min: null,
          max: null
        };
      }

      return {
        min:
          values.reduce(
            (current, value) =>
              value.value < current.value
                ? value
                : current
          ),
        max:
          values.reduce(
            (current, value) =>
              value.value > current.value
                ? value
                : current
          )
      };
    };

  const temperatureExtremes =
    metricExtremes(
      "temperature"
    );

  const humidityExtremes =
    metricExtremes(
      "humidity"
    );

  const latestActivity =
    observations.length > 0
      ? observations
          .map(
            observation =>
              new Date(
                observation.time
              ).getTime()
          )
          .reduce(
            (
              latest,
              current
            ) =>
              Math.max(
                latest,
                current
              )
          )
      : null;

  return (
    <AppShell
      header={{
        height: 64
      }}
      navbar={{
        width:
          navbarCollapsed
            ? 72
            : 220,
        breakpoint: "sm",
        collapsed: {
          mobile:
            !navbarOpened
        }
      }}
    >

      <AppShell.Header>

        <Container
          fluid
          px="md"
          h="100%"
        >

          <Group
            h="100%"
            justify="space-between"
          >

            <Group gap="sm">

              <img
                src="/sensorsphere-app.svg"
                alt=""
                width="38"
                height="38"
                style={{
                  flexShrink: 0
                }}
              />

              <Burger
                hiddenFrom="sm"
                opened={
                  navbarOpened
                }
                onClick={
                  () =>
                    setNavbarOpened(
                      current =>
                        !current
                    )
                }
                size="sm"
                aria-label="Toggle navigation"
              />

              <div>
                <Title order={2}>
                  {instanceName}
                </Title>

                <Text
                  size="xs"
                  c="dimmed"
                >
                  {
                    templateHistoryActive
                      ? "Template History"
                      : PAGE_LABELS[
                          activePage
                        ]
                  }
                </Text>
              </div>

            </Group>

            <Group gap="sm">
              <ThemeSelector />
            </Group>

          </Group>

        </Container>

      </AppShell.Header>

      <AppShell.Navbar
        p={
          navbarCollapsed
            ? "xs"
            : "md"
        }
        style={{
          overflow:
            "visible",
          display:
            "flex",
          flexDirection:
            "column",
          minHeight:
            0
        }}
      >
        <button
          type="button"
          onClick={
            () =>
              setNavbarCollapsed(
                current =>
                  !current
              )
          }
          aria-label={
            navbarCollapsed
              ? "Expand navigation"
              : "Collapse navigation"
          }
          title={
            navbarCollapsed
              ? "Expand navigation"
              : "Collapse navigation"
          }
          style={{
            position:
              "absolute",
            top:
              12,
            right:
              -15,
            width:
              30,
            height:
              30,
            padding:
              0,
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            border:
              "1px solid var(--mantine-color-gray-4)",
            borderRadius:
              4,
            background:
              "var(--mantine-color-body)",
            color:
              "var(--mantine-color-gray-7)",
            cursor:
              "pointer",
            zIndex:
              20,
            boxShadow:
              "var(--mantine-shadow-xs)"
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {
              navbarCollapsed
                ? (
                  <path d="m9 18 6-6-6-6" />
                )
                : (
                  <path d="m15 18-6-6 6-6" />
                )
            }
          </svg>
        </button>

        <Stack gap={2} className="app-navigation-scroll">

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Overview"
            }
            leftSection={
              <NavigationIcon
                page="dashboard"
              />
            }
            title="Overview"
            aria-label="Overview"
            active={
              activePage ===
              "dashboard"
            }
            onClick={
              () =>
                navigateTo(
                  "dashboard"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Dashboards"
            }
            leftSection={
              <NavigationIcon
                page="dashboards"
              />
            }
            title="Dashboards"
            aria-label="Dashboards"
            active={
              !templateHistoryActive &&
              activePage ===
              "dashboards"
            }
            onClick={
              () =>
                navigateTo(
                  "dashboards"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "History"
            }
            leftSection={
              <NavigationIcon
                page="history"
              />
            }
            title="History"
            aria-label="History"
            active={
              activePage ===
              "history"
            }
            onClick={
              () =>
                navigateTo(
                  "history"
                )
            }
          />


          {historyTemplateLaunch && (
            <NavLink
              label={
                navbarCollapsed
                  ? null
                  : "Template History"
              }
              leftSection={
                <NavigationIcon
                  page="history"
                />
              }
              rightSection={
                navbarCollapsed
                  ? null
                  : (
                    <Badge
                      size="xs"
                      color="violet"
                      variant="light"
                    >
                      Temp
                    </Badge>
                  )
              }
              title={`Template History · ${historyTemplateLaunch.templateName}`}
              aria-label={`Template History · ${historyTemplateLaunch.templateName}`}
              active={templateHistoryActive}
              onClick={() => {
                setActivePage("dashboards");
                setTemplateHistoryActive(true);
                setNavbarOpened(false);
              }}
            />
          )}

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Alerts"
            }
            leftSection={
              <NavigationIcon
                page="alerts"
              />
            }
            title="Alerts"
            aria-label="Alerts"
            active={
              activePage ===
              "alerts"
            }
            onClick={
              () =>
                navigateTo(
                  "alerts"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Assets"
            }
            leftSection={
              <NavigationIcon
                page="assets"
              />
            }
            title="Assets"
            aria-label="Assets"
            active={
              activePage ===
              "assets"
            }
            onClick={
              () =>
                navigateTo(
                  "assets"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Sensors"
            }
            leftSection={
              <NavigationIcon
                page="sensors"
              />
            }
            title="Sensors"
            aria-label="Sensors"
            active={
              activePage ===
              "sensors"
            }
            onClick={
              () =>
                navigateTo(
                  "sensors"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Gateways"
            }
            leftSection={
              <NavigationIcon
                page="gateways"
              />
            }
            title="Gateways"
            aria-label="Gateways"
            active={
              activePage ===
              "gateways"
            }
            onClick={
              () =>
                navigateTo(
                  "gateways"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Inventory"
            }
            leftSection={
              <NavigationIcon
                page="inventory"
              />
            }
            title="Inventory"
            aria-label="Inventory"
            active={
              activePage ===
              "inventory"
            }
            onClick={
              () =>
                navigateTo(
                  "inventory"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Topology"
            }
            leftSection={
              <NavigationIcon
                page="topology"
              />
            }
            title="Topology (available later)"
            aria-label="Topology (available later)"
            active={false}
            disabled
            onClick={() => undefined}
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Metric Routing"
            }
            leftSection={
              <NavigationIcon
                page="metric-routing"
              />
            }
            title="Metric Routing"
            aria-label="Metric Routing"
            active={
              activePage ===
              "metric-routing"
            }
            onClick={
              () =>
                navigateTo(
                  "metric-routing"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Gateway Coverage"
            }
            leftSection={
              <NavigationIcon
                page="gateway-coverage"
              />
            }
            title="Gateway Coverage"
            aria-label="Gateway Coverage"
            active={
              activePage ===
              "gateway-coverage"
            }
            onClick={
              () =>
                navigateTo(
                  "gateway-coverage"
                )
            }
          />



        </Stack>

        <Stack gap="xs" mt="auto" pt="md">
          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Project Todos"
            }
            leftSection={
              <NavigationIcon
                page="todos"
              />
            }
            rightSection={
              !navbarCollapsed &&
              ((projectTodosQuery.data?.summary.open ?? 0) + (projectTodosQuery.data?.summary.inProgress ?? 0)) > 0
                ? (
                  <Badge size="xs" color="pink" variant="light">
                    {(projectTodosQuery.data?.summary.open ?? 0) + (projectTodosQuery.data?.summary.inProgress ?? 0)}
                  </Badge>
                )
                : null
            }
            title="Project Todos"
            aria-label="Project Todos"
            active={
              activePage ===
              "todos"
            }
            onClick={
              () =>
                navigateTo(
                  "todos"
                )
            }
          />

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Versions"
            }
            leftSection={
              <NavigationIcon
                page="versions"
              />
            }
            title="Versions"
            aria-label="Versions"
            active={
              activePage ===
              "versions"
            }
            onClick={
              () =>
                navigateTo(
                  "versions"
                )
            }
          />

          {!navbarCollapsed && (
            <Stack
              gap={2}
              pt="md"
              style={{
                borderTop:
                  "1px solid var(--mantine-color-default-border)"
              }}
            >
              <Text size="xs" fw={600} c="dimmed">
                Build information
              </Text>

              <Group className="build-info-row" justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">Frontend</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {FRONTEND_MODULE_VERSION} · {formatBuildDate(frontendBuildQuery.data)}
                </Text>
              </Group>

              <Group className="build-info-row" justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">API</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {apiModuleVersion ?? "—"} · {formatBuildDate(apiBuildDate)}
                </Text>
              </Group>

              <Group className="build-info-row" justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">Ingestion</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {ingestionModuleVersion ?? "—"} · {formatBuildDate(ingestionBuildDate)}
                </Text>
              </Group>
            </Stack>
          )}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main
        className={
          activePage === "dashboard"
            ? "overview-main"
            : activePage === "gateway-coverage"
              ? "gateway-coverage-main"
            : activePage === "metric-routing"
              ? "metric-routing-main"
              : activePage === "todos"
                ? "project-todos-main"
                : undefined
        }
      >

        <Container
          fluid
          py="xl"
          px="md"
          className={
            activePage === "dashboard"
              ? "overview-page-container"
              : activePage === "gateway-coverage"
                ? "gateway-coverage-page-container"
              : activePage === "metric-routing"
                ? "metric-routing-page-container"
                : activePage === "todos"
                  ? "project-todos-page-container"
                  : undefined
          }
        >

          <Stack
            gap="xl"
            className={
              activePage === "dashboard"
                ? "overview-page-stack"
                : activePage === "gateway-coverage"
                  ? "gateway-coverage-page-stack"
                : activePage === "metric-routing"
                  ? "metric-routing-page-stack"
                  : activePage === "todos"
                    ? "project-todos-page-stack"
                    : undefined
            }
          >

            {
              activePage ===
                "dashboard" && (
            <div className="overview-summary">

              <Group
                justify="space-between"
                mb="md"
              >
                <div>
                  <Group gap="xs">
                    <NavigationIcon page="dashboard" size={24} />
                    <Title order={2}>
                      Overview
                    </Title>
                  </Group>

                  <Text c="dimmed">
                    Current SensorSphere status
                  </Text>
                </div>

                <Group gap="xs">
                  <Badge
                    variant="light"
                    color="green"
                  >
                    {onlineAssets.length} Online
                  </Badge>

                  <Badge
                    variant="light"
                    color="yellow"
                  >
                    {dashboardWarningAssets.length} Warning
                  </Badge>

                  <Badge
                    variant="light"
                    color="red"
                  >
                    {dashboardOfflineAssets.length} Offline
                  </Badge>

                  <Button
                    size="xs"
                    variant="light"
                    loading={dashboardRefreshing}
                    onClick={() => void refreshDashboard()}
                    title={dashboardRefreshedAt ? `Last refreshed ${dashboardRefreshedAt.toLocaleTimeString()}` : undefined}
                  >
                    Refresh (auto 30 s)
                  </Button>
                </Group>
              </Group>

              <SimpleGrid
                cols={{
                  base: 1,
                  xs: 2,
                  md: 3,
                  xl: 6
                }}
              >

                <Card
                  withBorder
                  radius="md"
                  padding="lg"
                  style={{
                    borderLeft: "4px solid var(--mantine-color-blue-6)"
                  }}
                >
                  <Badge size="xs" color="blue" variant="light">
                    Assets
                  </Badge>

                  <Text
                    size="xl"
                    fw={700}
                    c="blue.6"
                  >
                    {assets.length}
                  </Text>

                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    {enabledAssets} enabled
                  </Text>
                </Card>

                <Card
                  withBorder
                  radius="md"
                  padding="lg"
                  style={{
                    borderLeft: "4px solid var(--mantine-color-violet-6)"
                  }}
                >
                  <Badge size="xs" color="violet" variant="light">
                    Locations
                  </Badge>

                  <Text
                    size="xl"
                    fw={700}
                    c="violet.6"
                  >
                    {assignedLocations}
                  </Text>

                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    With assigned assets
                  </Text>
                </Card>

                {[
                  {
                    label: "Temperature Min",
                    extreme:
                      temperatureExtremes.min,
                    unit: "°C",
                    color: "cyan"
                  },
                  {
                    label: "Temperature Max",
                    extreme:
                      temperatureExtremes.max,
                    unit: "°C",
                    color: "orange"
                  },
                  {
                    label: "Humidity Min",
                    extreme:
                      humidityExtremes.min,
                    unit: "%",
                    color: "teal"
                  },
                  {
                    label: "Humidity Max",
                    extreme:
                      humidityExtremes.max,
                    unit: "%",
                    color: "grape"
                  }
                ].map(item => (
                  <Card
                    key={item.label}
                    withBorder
                    radius="md"
                    padding="lg"
                    style={{
                      borderLeft: `4px solid var(--mantine-color-${item.color}-6)`
                    }}
                  >
                    <Badge size="xs" color={item.color} variant="light">
                      {item.label}
                    </Badge>

                    <Text
                      size="xl"
                      fw={700}
                      c={`${item.color}.6`}
                    >
                      {
                        item.extreme
                          ? `${item.extreme.value.toFixed(1)} ${item.unit}`
                          : "—"
                      }
                    </Text>

                    <Text
                      size="xs"
                      c="dimmed"
                      title={
                        item.extreme
                          ?.sensorName
                      }
                    >
                      {
                        item.extreme
                          ?.sensorName
                        ?? "No enabled sensor"
                      }
                    </Text>
                  </Card>
                ))}

              </SimpleGrid>

              <Text
                size="xs"
                c="dimmed"
                mt="sm"
              >
                Last activity:{" "}
                {
                  latestActivity
                    ? new Date(
                        latestActivity
                      ).toLocaleString()
                    : "No observations"
                }
              </Text>

            </div>

              )
            }

            {
              activePage ===
                "dashboard" &&
              (
                dashboardOfflineAssets.length > 0 ||
                dashboardWarningAssets.length > 0 ||
                sensorsWithoutPrimaryGateway.length > 0 ||
                assetsWithoutLocation.length > 0 ||
                gatewaysWithoutLocation.length > 0
              ) && (
                <div>

                  <Title
                    order={2}
                    mb="md"
                  >
                    Attention
                  </Title>

                  <SimpleGrid
                    cols={{
                      base: 1,
                      md: 2
                    }}
                  >

                    {sensorsWithoutPrimaryGateway.length > 0 && (
                      <Card
                        withBorder
                        radius="md"
                        padding="lg"
                        style={attentionAccent("red")}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <Badge color="red" variant="light">
                              CONFIGURATION
                            </Badge>
                            <Text fw={700} c="red.6">
                              {sensorsWithoutPrimaryGateway.length}
                            </Text>
                          </Group>

                          <Text fw={700}>
                            Sensor{sensorsWithoutPrimaryGateway.length > 1 ? "s" : ""} without a Primary Gateway
                          </Text>

                          <Text size="sm" c="dimmed">
                            Active routing ignores productive measurements until a Primary Gateway is assigned.
                          </Text>

                          {sensorsWithoutPrimaryGateway.map(
                            sensor => (
                              <Group
                                key={sensor.id}
                                justify="space-between"
                                gap="sm"
                                wrap="nowrap"
                              >
                                <Text size="sm">
                                  {sensor.name ?? sensor.uid} · {sensor.uid}
                                </Text>
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() =>
                                    openSensorForCorrection(
                                      sensor.id
                                    )
                                  }
                                >
                                  Fix
                                </Button>
                              </Group>
                            )
                          )}
                        </Stack>
                      </Card>
                    )}

                    {assetsWithoutLocation.length > 0 && (
                      <Card
                        withBorder
                        radius="md"
                        padding="lg"
                        style={attentionAccent("yellow")}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <Badge color="yellow" variant="light">
                              LOCATION
                            </Badge>
                            <Text fw={700} c="yellow.7">
                              {assetsWithoutLocation.length}
                            </Text>
                          </Group>

                          <Text fw={700}>
                            Asset{assetsWithoutLocation.length > 1 ? "s" : ""} without a Location
                          </Text>

                          <Text size="sm" c="dimmed">
                            Configure the linked Sensor/Asset location before interpreting operational health.
                          </Text>

                          {assetsWithoutLocation.map(
                            asset => (
                              <Group
                                key={asset.id}
                                justify="space-between"
                                gap="sm"
                                wrap="nowrap"
                              >
                                <Text size="sm">
                                  {asset.sensor?.name
                                    ?? asset.externalId}
                                </Text>
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() =>
                                    openAssetForCorrection(
                                      asset
                                    )
                                  }
                                >
                                  Fix
                                </Button>
                              </Group>
                            )
                          )}
                        </Stack>
                      </Card>
                    )}

                    {gatewaysWithoutLocation.length > 0 && (
                      <Card
                        withBorder
                        radius="md"
                        padding="lg"
                        style={attentionAccent("violet")}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <Badge color="violet" variant="light">
                              GATEWAY LOCATION
                            </Badge>
                            <Text fw={700} c="violet.6">
                              {gatewaysWithoutLocation.length}
                            </Text>
                          </Group>

                          <Text fw={700}>
                            Gateway{gatewaysWithoutLocation.length > 1 ? "s" : ""} without a Location
                          </Text>

                          {gatewaysWithoutLocation.map(
                            gateway => (
                              <Group
                                key={gateway.id}
                                justify="space-between"
                                gap="sm"
                                wrap="nowrap"
                              >
                                <Text size="sm">
                                  {gateway.name} · {gateway.gatewayId}
                                </Text>
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() =>
                                    openGatewayForCorrection(
                                      gateway.id
                                    )
                                  }
                                >
                                  Fix
                                </Button>
                              </Group>
                            )
                          )}
                        </Stack>
                      </Card>
                    )}

                    {dashboardOfflineAssets.length > 0 && (
                      <Card
                        withBorder
                        radius="md"
                        padding="lg"
                        style={attentionAccent("red")}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <Badge color="red" variant="light">
                              OFFLINE
                            </Badge>
                            <Text fw={700} c="red.6">
                              {dashboardOfflineAssets.length}
                            </Text>
                          </Group>

                          <Text fw={700}>
                            Operational asset{dashboardOfflineAssets.length > 1 ? "s" : ""} offline
                          </Text>

                          <Text size="sm" c="dimmed">
                            Only fully configured assets are included here.
                          </Text>

                          {dashboardOfflineAssets.map(
                            asset => (
                              <Group
                                key={asset.id}
                                justify="space-between"
                                gap="sm"
                                wrap="nowrap"
                              >
                                <Text size="sm">
                                  {asset.sensor?.name
                                    ?? asset.externalId}
                                  {" · "}
                                  {formatAge(asset.health.ageSeconds)}
                                </Text>
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() =>
                                    openAssetForCorrection(
                                      asset
                                    )
                                  }
                                >
                                  Open
                                </Button>
                              </Group>
                            )
                          )}
                        </Stack>
                      </Card>
                    )}

                    {dashboardWarningAssets.length > 0 && (
                      <Card
                        withBorder
                        radius="md"
                        padding="lg"
                        style={attentionAccent("orange")}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between">
                            <Badge color="orange" variant="light">
                              WARNING
                            </Badge>
                            <Text fw={700} c="orange.6">
                              {dashboardWarningAssets.length}
                            </Text>
                          </Group>

                          <Text fw={700}>
                            Operational asset{dashboardWarningAssets.length > 1 ? "s" : ""} in warning state
                          </Text>

                          {dashboardWarningAssets.map(
                            asset => (
                              <Group
                                key={asset.id}
                                justify="space-between"
                                gap="sm"
                                wrap="nowrap"
                              >
                                <Text size="sm">
                                  {asset.sensor?.name
                                    ?? asset.externalId}
                                  {" · "}
                                  {formatAge(asset.health.ageSeconds)}
                                </Text>
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  onClick={() =>
                                    openAssetForCorrection(
                                      asset
                                    )
                                  }
                                >
                                  Open
                                </Button>
                              </Group>
                            )
                          )}
                        </Stack>
                      </Card>
                    )}

                  </SimpleGrid>

                  {suppressedHealthCount > 0 && (
                    <Text size="xs" c="dimmed" mt="sm">
                      {suppressedHealthCount} health state{suppressedHealthCount > 1 ? "s" : ""} hidden from Offline/Warning because configuration must be completed first.
                    </Text>
                  )}

                </div>
              )
            }

            {
              activePage ===
                "dashboard" && (
                <div>

                  <Group
                    justify="space-between"
                    mb="md"
                    align="flex-end"
                  >
                    <div>
                      <Title order={2}>
                        Active alerts
                      </Title>

                      <Text c="dimmed">
                        Current alerts requiring attention
                      </Text>
                    </div>

                    <Button
                      variant="subtle"
                      onClick={
                        () =>
                          navigateTo(
                            "alerts"
                          )
                      }
                    >
                      View all
                    </Button>
                  </Group>

                  {
                    activeAlertsQuery
                      .isLoading
                      ? (
                        <Loader size="sm" />
                      )
                      : activeAlertsQuery
                          .isError
                        ? (
                          <Alert
                            color="red"
                            title="Unable to load alerts"
                          >
                            Open the Alerts page for more details.
                          </Alert>
                        )
                        : dashboardAlerts
                            .length === 0
                          ? (
                            <Alert
                              color="green"
                              title="No active alerts"
                            >
                              No alert currently requires attention.
                            </Alert>
                          )
                          : (
                            <Stack gap="xs">
                              {
                                dashboardAlerts.map(
                                  alert => (
                                    <Card
                                      key={
                                        alert.id
                                      }
                                      withBorder
                                      radius="md"
                                      padding="md"
                                      style={attentionAccent(
                                        alert.severity === "CRITICAL"
                                          ? "red"
                                          : alert.severity === "WARNING"
                                            ? "yellow"
                                            : "blue"
                                      )}
                                    >
                                      <Group
                                        justify="space-between"
                                        align="center"
                                      >
                                        <Group
                                          gap="sm"
                                          style={{
                                            minWidth: 0
                                          }}
                                        >
                                          <Badge
                                            color={
                                              alert.severity ===
                                                "CRITICAL"
                                                ? "red"
                                                : alert.severity ===
                                                    "WARNING"
                                                  ? "yellow"
                                                  : "blue"
                                            }
                                            variant="light"
                                          >
                                            {
                                              alert.severity
                                            }
                                          </Badge>

                                          <div>
                                            <Text fw={600}>
                                              {
                                                alert.ruleName
                                              }
                                            </Text>

                                            <Text
                                              size="xs"
                                              c="dimmed"
                                            >
                                              {
                                                alert.assetDisplayName
                                              }
                                              {
                                                alert.metricDisplayName
                                                  ? ` · ${alert.metricDisplayName}`
                                                  : ""
                                              }
                                            </Text>
                                          </div>
                                        </Group>

                                        <Group gap="xs">
                                          <Text
                                            fw={700}
                                            size="sm"
                                          >
                                            {
                                              alert.currentValue !==
                                                null
                                                ? `${alert.currentValue}${alert.unit ? ` ${alert.unit}` : ""}`
                                                : "—"
                                            }
                                          </Text>

                                          {(() => {
                                            const asset =
                                              assets.find(
                                                current =>
                                                  current.id === alert.assetId
                                              );

                                            return asset
                                              ? (
                                                <Button
                                                  size="compact-xs"
                                                  variant="light"
                                                  onClick={() =>
                                                    openAssetForCorrection(
                                                      asset
                                                    )
                                                  }
                                                >
                                                  Open
                                                </Button>
                                              )
                                              : null;
                                          })()}
                                        </Group>
                                      </Group>
                                    </Card>
                                  )
                                )
                              }
                            </Stack>
                          )
                  }

                </div>
              )
            }

            {
              activePage ===
                "dashboard" && (
                <div className="overview-current-readings">

                  <Group
                    className="overview-current-readings-controls"
                    justify="space-between"
                    mb="md"
                  >
                    <Group gap="sm" align="center" wrap="nowrap">
                      <div>
                        <Title order={2}>
                          Current readings
                        </Title>

                        <Text c="dimmed">
                          Latest temperature and humidity by asset
                        </Text>
                      </div>

                      <Badge variant="light">
                        {currentReadingAssets.length} / {assets.length} assets
                      </Badge>
                    </Group>

                    <Group
                      gap="sm"
                      align="flex-end"
                    >
                      <ResetFiltersAction
                        active={
                          currentReadingSearch.trim().length > 0 ||
                          currentReadingLocation !== null ||
                          currentReadingStatus !== "all" ||
                          currentReadingHealth !== "all"
                        }
                        onReset={
                          () => {
                            setCurrentReadingSearch("");
                            setCurrentReadingLocation(null);
                            setCurrentReadingStatus("all");
                            setCurrentReadingHealth("all");
                          }
                        }
                      />
                      <TextInput
                        label="Filter by name"
                        placeholder="Sensor name"
                        value={
                          currentReadingSearch
                        }
                        onChange={
                          event =>
                            setCurrentReadingSearch(
                              event.currentTarget
                                .value
                            )
                        }
                        styles={activeFilterStyles(currentReadingSearch.trim().length > 0)}
                      />

                      <LocationFilterField
                        locations={assetLocations}
                        value={currentReadingLocation}
                        onChange={setCurrentReadingLocation}
                        includeDescendants={locationIncludeDescendants}
                        onIncludeDescendantsChange={setLocationIncludeDescendants}
                        includeUnassigned
                        styles={activeFilterStyles(currentReadingLocation !== null)}
                      />


                      <BadgeSelect
                        badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "orange" : "gray"}
                        label="Status"
                        value={currentReadingStatus}
                        onChange={
                          value =>
                            value &&
                            setCurrentReadingStatus(
                              value as
                                "all"
                                | "enabled"
                                | "disabled"
                            )
                        }
                        data={[
                          { value: "all", label: "All" },
                          { value: "enabled", label: "Enabled" },
                          { value: "disabled", label: "Disabled" }
                        ]}
                        styles={activeFilterStyles(currentReadingStatus !== "all")}
                      />

                      <BadgeSelect
                        badgeColor={value => value === "online" ? "green" : value === "warning" ? "yellow" : value === "offline" ? "red" : "gray"}
                        label="Health"
                        value={currentReadingHealth}
                        onChange={
                          value =>
                            value &&
                            setCurrentReadingHealth(
                              value as
                                "all"
                                | "online"
                                | "warning"
                                | "offline"
                            )
                        }
                        data={[
                          { value: "all", label: "All" },
                          { value: "online", label: "Online" },
                          { value: "warning", label: "Warning" },
                          { value: "offline", label: "Offline" }
                        ]}
                        styles={activeFilterStyles(currentReadingHealth !== "all")}
                      />

                    </Group>
                  </Group>

                  <div className="overview-current-readings-scroll">
                  <SimpleGrid
                    cols={{
                      base: 1,
                      sm: 2,
                      lg: 3
                    }}
                  >
                    {
                      currentReadingAssets.map(
                        asset => {

                          const assetObservations =
                            observationsByAsset.get(
                              asset.id
                            ) ?? [];

                          const temperature =
                            latestMetricValue(
                              assetObservations,
                              "temperature"
                            );

                          const humidity =
                            latestMetricValue(
                              assetObservations,
                              "humidity"
                            );

                          const rssi =
                            latestMetricValue(
                              assetObservations,
                              "rssi"
                            );

                          const metricObservation =
                            (
                              metricKey: string
                            ) => {

                              const metric =
                                asset.metrics.find(
                                  currentMetric =>
                                    currentMetric.key ===
                                    metricKey
                                );

                              return metric
                                ? assetObservations.find(
                                    observation =>
                                      observation.metricId ===
                                      metric.id
                                  )
                                  ?? null
                                : null;
                            };

                          const temperatureObservation =
                            metricObservation(
                              "temperature"
                            );

                          const humidityObservation =
                            metricObservation(
                              "humidity"
                            );

                          const rssiObservation =
                            metricObservation(
                              "rssi"
                            );

                          const qualityIndicator =
                            (
                              observation:
                                typeof temperatureObservation
                            ) => {

                              const status =
                                observation?.quality
                                  ?.status;

                              if (
                                !status ||
                                status === "UNKNOWN"
                              ) {
                                return null;
                              }

                              const color =
                                status === "GOOD"
                                  ? "green"
                                  : status === "WARNING"
                                    ? "orange"
                                    : "red";

                              const label =
                                status === "GOOD"
                                  ? "Good"
                                  : status === "WARNING"
                                    ? "Warning"
                                    : "Critical";

                              return (
                                <Badge
                                  size="xs"
                                  color={color}
                                  variant="light"
                                >
                                  ● {label}
                                </Badge>
                              );
                            };

                          const healthColor =
                            asset.health.status ===
                              "online"
                              ? "green"
                              : asset.health.status ===
                                  "warning"
                                ? "yellow"
                                : "red";

                          const assetAlerts =
                            (
                              activeAlertsQuery.data
                              ?? []
                            )
                              .filter(
                                alert =>
                                  alert.assetId ===
                                  asset.id
                              )
                              .sort(
                                (
                                  left,
                                  right
                                ) =>
                                  alertSeverityPriority[
                                    left.severity
                                  ] -
                                  alertSeverityPriority[
                                    right.severity
                                  ] ||
                                  new Date(
                                    right.openedAt
                                  ).getTime() -
                                  new Date(
                                    left.openedAt
                                  ).getTime()
                              );

                          const assetAlertColor =
                            assetAlerts[0]
                              ?.severity ===
                              "CRITICAL"
                              ? "red"
                              : assetAlerts[0]
                                  ?.severity ===
                                  "WARNING"
                                ? "yellow"
                                : "blue";

                          return (
                            <Card
                              key={asset.id}
                              withBorder
                              radius="md"
                              padding="md"
                              style={
                                assetAlerts.length > 0
                                  ? {
                                      borderWidth:
                                        2,
                                      borderColor:
                                        `var(--mantine-color-${assetAlertColor}-6)`
                                    }
                                  : undefined
                              }
                            >
                              <Stack gap="xs">

                                <Group
                                  justify="space-between"
                                  align="flex-start"
                                >
                                  <div>
                                    <Text fw={700}>
                                      {
                                        asset.sensor?.name
                                        ?? asset.externalId
                                      }
                                    </Text>

                                    <Group
                                      gap={4}
                                      wrap="nowrap"
                                    >
                                      <LocationIcon
                                        name={
                                          getLocationIconName(
                                            asset.location
                                          )
                                        }
                                        size={21}
                                      />

                                      <Text
                                        size="xs"
                                        c="dimmed"
                                      >
                                        {
                                          asset.location?.name
                                          ?? "Unassigned"
                                        }
                                        {" · Last seen: "}
                                        {
                                          formatAge(
                                            asset.health.ageSeconds
                                          )
                                        }
                                      </Text>
                                    </Group>
                                  </div>

                                  <Stack
                                    gap={4}
                                    align="flex-end"
                                  >
                                    <Badge
                                      size="sm"
                                      color={
                                        healthColor
                                      }
                                      variant="light"
                                    >
                                      {
                                        asset.health.status
                                      }
                                    </Badge>

                                    <Badge
                                      size="sm"
                                      color={
                                        isAssetEnabled(
                                          asset
                                        )
                                          ? "green"
                                          : "orange"
                                      }
                                      variant="light"
                                    >
                                      {
                                        isAssetEnabled(
                                          asset
                                        )
                                          ? "Enabled"
                                          : "Disabled"
                                      }
                                    </Badge>

                                    {
                                      assetAlerts.length >
                                        0 && (
                                        <Badge
                                          size="sm"
                                          color={
                                            assetAlertColor
                                          }
                                          variant="filled"
                                        >
                                          {
                                            assetAlerts.length
                                          } alert{
                                            assetAlerts.length >
                                              1
                                              ? "s"
                                              : ""
                                          }
                                        </Badge>
                                      )
                                    }
                                  </Stack>
                                </Group>

                                {
                                  assetAlerts.length >
                                    0 && (
                                    <Stack
                                      gap={4}
                                      p="xs"
                                      style={{
                                        border:
                                          "1px solid var(--mantine-color-gray-3)",
                                        borderRadius:
                                          "var(--mantine-radius-sm)"
                                      }}
                                    >
                                      {
                                        assetAlerts
                                          .slice(
                                            0,
                                            3
                                          )
                                          .map(
                                            alert => (
                                              <Group
                                                key={
                                                  alert.id
                                                }
                                                gap="xs"
                                                wrap="nowrap"
                                                justify="space-between"
                                              >
                                                <Group
                                                  gap="xs"
                                                  wrap="nowrap"
                                                  style={{
                                                    minWidth:
                                                      0
                                                  }}
                                                >
                                                  <Badge
                                                    size="xs"
                                                    color={
                                                      alert.severity ===
                                                        "CRITICAL"
                                                        ? "red"
                                                        : alert.severity ===
                                                            "WARNING"
                                                          ? "yellow"
                                                          : "blue"
                                                    }
                                                    variant="light"
                                                  >
                                                    {
                                                      alert.severity
                                                    }
                                                  </Badge>

                                                  <Text
                                                    size="xs"
                                                    truncate
                                                    title={
                                                      alert.ruleName
                                                    }
                                                  >
                                                    {
                                                      alert.ruleName
                                                    }
                                                  </Text>
                                                </Group>

                                                <Text
                                                  size="xs"
                                                  fw={600}
                                                  style={{
                                                    whiteSpace:
                                                      "nowrap"
                                                  }}
                                                >
                                                  {
                                                    alert.currentValue !==
                                                      null
                                                      ? `${alert.currentValue}${alert.unit ? ` ${alert.unit}` : ""}`
                                                      : "—"
                                                  }
                                                </Text>
                                              </Group>
                                            )
                                          )
                                      }

                                      {
                                        assetAlerts.length >
                                          3 && (
                                          <Text
                                            size="xs"
                                            c="dimmed"
                                          >
                                            +{
                                              assetAlerts.length -
                                              3
                                            } more alert{
                                              assetAlerts.length -
                                                3 >
                                              1
                                                ? "s"
                                                : ""
                                            }
                                          </Text>
                                        )
                                      }
                                    </Stack>
                                  )
                                }

                                <Group gap="xl">

                                  <div>
                                    <Text
                                      size="xs"
                                      c="dimmed"
                                    >
                                      Temperature
                                    </Text>

                                    <Group
                                      gap="xs"
                                      align="center"
                                    >
                                      <Text
                                        fw={600}
                                        size="lg"
                                      >
                                        {
                                          temperature !== null
                                            ? `${temperature} °C`
                                            : "—"
                                        }
                                      </Text>

                                      {
                                        qualityIndicator(
                                          temperatureObservation
                                        )
                                      }
                                    </Group>
                                  </div>

                                  <div>
                                    <Text
                                      size="xs"
                                      c="dimmed"
                                    >
                                      Humidity
                                    </Text>

                                    <Group
                                      gap="xs"
                                      align="center"
                                    >
                                      <Text
                                        fw={600}
                                        size="lg"
                                      >
                                        {
                                          humidity !== null
                                            ? `${humidity} %`
                                            : "—"
                                        }
                                      </Text>

                                      {
                                        qualityIndicator(
                                          humidityObservation
                                        )
                                      }
                                    </Group>
                                  </div>

                                  {
                                    rssi !== null && (
                                      <div>
                                        <Text
                                          size="xs"
                                          c="dimmed"
                                        >
                                          RSSI
                                        </Text>

                                        <Group
                                          gap="xs"
                                          align="center"
                                        >
                                          <Text
                                            fw={600}
                                            size="lg"
                                          >
                                            {`${rssi} dBm`}
                                          </Text>

                                          {
                                            qualityIndicator(
                                              rssiObservation
                                            )
                                          }
                                        </Group>
                                      </div>
                                    )
                                  }

                                </Group>

                              </Stack>
                            </Card>
                          );
                        }
                      )
                    }
                  </SimpleGrid>
                  </div>

                </div>
              )
            }

            {
              activePage ===
                "assets" && (
                <div>

                  <div className="page-sticky-controls">
                  <Group
                    justify="space-between"
                    mb="md"
                    align="flex-end"
                  >
                    <div>
                      <Group gap="xs">
                        <NavigationIcon page="assets" size={24} />
                        <Title order={2}>
                          Assets
                        </Title>
                      </Group>

                      <Text c="dimmed">
                        Latest observations and asset health
                      </Text>
                    </div>

                    <Group
                      gap="xs"
                      justify="flex-end"
                    >
                      <Badge
                        color="green"
                        variant="light"
                      >
                        {onlineAssets.length} Online
                      </Badge>

                      <Badge
                        color="yellow"
                        variant="light"
                      >
                        {warningAssets.length} Warning
                      </Badge>

                      <Badge
                        color="red"
                        variant="light"
                      >
                        {offlineAssets.length} Offline
                      </Badge>

                      <Badge variant="light">
                        {filteredAssets.length} / {assets.length} assets
                      </Badge>

                      <Button
                        size="xs"
                        color="gray"
                        variant="light"
                        onClick={() => setClassificationManagerOpen(true)}
                      >
                        Manage metadata
                      </Button>

                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        onClick={() =>
                          setAssetForm(
                            emptyAssetForm()
                          )
                        }
                      >
                        Add asset
                      </Button>

                      <SegmentedControl
                        value={
                          assetView
                        }
                        onChange={
                          value =>
                            setAssetView(
                              value as
                                "cards"
                                | "compact"
                            )
                        }
                        data={[
                          {
                            label: "Cards",
                            value: "cards"
                          },
                          {
                            label: "Compact",
                            value: "compact"
                          }
                        ]}
                      />
                    </Group>
                  </Group>

                  <Group
                    mb="md"
                    align="flex-end"
                  >
                    <ResetFiltersAction
                      active={
                        assetSearch.trim().length > 0 ||
                        assetHealthFilter !== "all" ||
                        assetEnabledFilter !== "all" ||
                        assetLocationFilter !== null ||
                        assetTypeFilter !== null ||
                        assetManufacturerFilter !== null ||
                        assetTagFilter !== null
                      }
                      onReset={
                        () => {
                          setAssetSearch("");
                          setAssetHealthFilter("all");
                          setAssetEnabledFilter("all");
                          setAssetLocationFilter(null);
                          setAssetTypeFilter(null);
                          setAssetManufacturerFilter(null);
                          setAssetTagFilter(null);
                        }
                      }
                    />
                    <TextInput
                      label="Search"
                      placeholder="Name, ID, location or metadata"
                      value={
                        assetSearch
                      }
                      onChange={
                        event =>
                          setAssetSearch(
                            event.currentTarget
                              .value
                          )
                      }
                      rightSectionPointerEvents="all"
                      rightSection={
                        assetSearch.trim().length > 0
                          ? (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              aria-label="Clear asset search filter"
                              title="Clear asset search filter"
                              onClick={() => setAssetSearch("")}
                            >
                              ×
                            </ActionIcon>
                          )
                          : null
                      }
                      style={{
                        flex: 1
                      }}
                      styles={activeFilterStyles(assetSearch.trim().length > 0)}
                    />

                    <Select
                      label="Type"
                      clearable
                      searchable
                      placeholder="All types"
                      value={assetTypeFilter}
                      onChange={setAssetTypeFilter}
                      data={assetTypes.map(type => ({
                        value: type.key,
                        label: type.name
                      }))}
                      styles={activeFilterStyles(assetTypeFilter !== null)}
                    />

                    <Select
                      label="Manufacturer"
                      clearable
                      searchable
                      placeholder="All manufacturers"
                      value={assetManufacturerFilter}
                      onChange={setAssetManufacturerFilter}
                      data={manufacturers.map(item => item.name)}
                      styles={activeFilterStyles(assetManufacturerFilter !== null)}
                    />

                    <Select
                      label="Tag"
                      clearable
                      searchable
                      placeholder="All tags"
                      value={assetTagFilter}
                      onChange={setAssetTagFilter}
                      data={tags.map(tag => tag.name)}
                      styles={activeFilterStyles(assetTagFilter !== null)}
                    />

                    <BadgeSelect
                      badgeColor={value => value === "online" ? "green" : value === "warning" ? "yellow" : value === "offline" ? "red" : "gray"}
                      label="Health"
                      clearable
                      value={
                        assetHealthFilter
                      }
                      onChange={
                        value =>
                          setAssetHealthFilter(
                            (value ?? "all") as
                              "all"
                              | "online"
                              | "warning"
                              | "offline"
                          )
                      }
                      data={[
                        {
                          value: "all",
                          label: "All"
                        },
                        {
                          value: "offline",
                          label: "Offline"
                        },
                        {
                          value: "warning",
                          label: "Warning"
                        },
                        {
                          value: "online",
                          label: "Online"
                        }
                      ]}
                      styles={activeFilterStyles(assetHealthFilter !== "all")}
                    />

                    <BadgeSelect
                      badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "orange" : "gray"}
                      label="Status"
                      clearable
                      value={
                        assetEnabledFilter
                      }
                      onChange={
                        value =>
                          setAssetEnabledFilter(
                            (value ?? "all") as
                              "all"
                              | "enabled"
                              | "disabled"
                          )
                      }
                      data={[
                        {
                          value: "all",
                          label: "All"
                        },
                        {
                          value: "enabled",
                          label: "Enabled"
                        },
                        {
                          value: "disabled",
                          label: "Disabled"
                        }
                      ]}
                      styles={activeFilterStyles(assetEnabledFilter !== "all")}
                    />

                    <LocationFilterField
                      locations={assetLocations}
                      value={assetLocationFilter}
                      onChange={setAssetLocationFilter}
                      includeDescendants={locationIncludeDescendants}
                      onIncludeDescendantsChange={setLocationIncludeDescendants}
                      styles={activeFilterStyles(assetLocationFilter !== null)}
                    />


                  </Group>

                  </div>

                  {
                    filteredAssets.length ===
                      0
                      ? (
                        <Alert
                          color="blue"
                          title="No matching assets"
                        >
                          Change the search or filters.
                        </Alert>
                      )
                      : assetView ===
                          "cards"
                        ? (
                          <SimpleGrid
                            cols={{
                              base: 1,
                              sm: 2
                            }}
                          >
                            {
                              filteredAssets.map(
                                asset => (
                                  <AssetLatestCard
                                    key={
                                      asset.id
                                    }
                                    asset={
                                      asset
                                    }
                                    observations={
                                      observationsByAsset.get(
                                        asset.id
                                      ) ?? []
                                    }
                                    enabled={
                                      isAssetEnabled(asset)
                                    }
                                    onEdit={
                                      currentAsset =>
                                        setAssetForm(
                                          assetFormFromAsset(
                                            currentAsset
                                          )
                                        )
                                    }
                                    onAddMetricToDashboard={openDashboardMetricTarget}
                                    dashboardUsageDetails={dashboardMetricUsageDetails}
                                  />
                                )
                              )
                            }
                          </SimpleGrid>
                        )
                        : (
                          <Table.ScrollContainer minWidth={1400}>
                            <Table striped highlightOnHover verticalSpacing="xs">
                              <Table.Thead>
                                <Table.Tr>
                                  {[
                                    ["name", "Name"],
                                    ["externalId", "Asset ID"],
                                    ["assetType", "Type"],
                                    ["manufacturer", "Manufacturer"],
                                    ["location", "Location"],
                                    ["temperature", "Temperature"],
                                    ["humidity", "Humidity"],
                                    ["rssi", "RSSI"],
                                    ["battery", "Battery"],
                                    ["enabled", "Enabled"],
                                    ["health", "Health"]
                                  ].map(([key, label]) => (
                                    <SortableTableHeader
                                      key={key}
                                      active={assetTableSortKey === key}
                                      direction={assetTableSortDirection}
                                      onClick={() => toggleAssetTableSort(key)}
                                    >
                                      {label}
                                    </SortableTableHeader>
                                  ))}
                                  <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                              </Table.Thead>

                              <Table.Tbody>
                                {sortedTableAssets.map(asset => {
                                  const assetObservations =
                                    observationsByAsset.get(asset.id) ?? [];
                                  const temperature =
                                    latestMetricValue(assetObservations, "temperature");
                                  const humidity =
                                    latestMetricValue(assetObservations, "humidity");
                                  const rssi =
                                    latestMetricValue(assetObservations, "rssi");
                                  const battery =
                                    latestMetricValue(assetObservations, "battery");
                                  const temperatureMetric = asset.metrics.find(item => item.key === "temperature");
                                  const humidityMetric = asset.metrics.find(item => item.key === "humidity");
                                  const rssiMetric = asset.metrics.find(item => item.key === "rssi");
                                  const batteryMetric = asset.metrics.find(item => item.key === "battery" || item.key === "battery_level");
                                  const healthColor =
                                    asset.health.status === "online"
                                      ? "green"
                                      : asset.health.status === "warning"
                                        ? "yellow"
                                        : "red";

                                  return (
                                    <Table.Tr key={asset.id}>
                                      <Table.Td fw={600}>
                                        {asset.sensor?.name ?? asset.externalId}
                                      </Table.Td>
                                      <Table.Td>{asset.externalId}</Table.Td>
                                      <Table.Td>{assetTypes.find(type => type.key === asset.assetType)?.name ?? asset.assetType}</Table.Td>
                                      <Table.Td>{asset.manufacturer ?? "—"}</Table.Td>
                                      <Table.Td>
                                        {asset.location ? (
                                          <Group gap={5} wrap="nowrap">
                                            <LocationIcon
                                              name={getLocationIconName(asset.location)}
                                              size={16}
                                            />
                                            <Text size="sm">{asset.location.name}</Text>
                                          </Group>
                                        ) : "—"}
                                      </Table.Td>
                                      <Table.Td>
                                        {temperature !== null ? (
                                          <Group gap={4} wrap="nowrap">
                                            <Text size="sm">{temperature} °C</Text>
                                            {temperatureMetric && (
                                              <DashboardMetricAction
                                                usages={dashboardMetricUsageDetails.get(temperatureMetric.id) ?? []}
                                                title="Add Temperature to a dashboard"
                                                onClick={() => openDashboardMetricTarget(asset, temperatureMetric.id)}
                                              />
                                            )}
                                          </Group>
                                        ) : "—"}
                                      </Table.Td>
                                      <Table.Td>
                                        {humidity !== null ? (
                                          <Group gap={4} wrap="nowrap">
                                            <Text size="sm">{humidity} %</Text>
                                            {humidityMetric && (
                                              <DashboardMetricAction
                                                usages={dashboardMetricUsageDetails.get(humidityMetric.id) ?? []}
                                                title="Add Humidity to a dashboard"
                                                onClick={() => openDashboardMetricTarget(asset, humidityMetric.id)}
                                              />
                                            )}
                                          </Group>
                                        ) : "—"}
                                      </Table.Td>
                                      <Table.Td>
                                        {rssi !== null ? (
                                          <Group gap={4} wrap="nowrap">
                                            <Text size="sm">{rssi} dBm</Text>
                                            {rssiMetric && (
                                              <DashboardMetricAction
                                                usages={dashboardMetricUsageDetails.get(rssiMetric.id) ?? []}
                                                title="Add RSSI to a dashboard"
                                                onClick={() => openDashboardMetricTarget(asset, rssiMetric.id)}
                                              />
                                            )}
                                          </Group>
                                        ) : "—"}
                                      </Table.Td>
                                      <Table.Td>
                                        {battery !== null ? (
                                          <Group gap={4} wrap="nowrap">
                                            <Text size="sm">{battery} %</Text>
                                            {batteryMetric && (
                                              <DashboardMetricAction
                                                usages={dashboardMetricUsageDetails.get(batteryMetric.id) ?? []}
                                                title="Add Battery to a dashboard"
                                                onClick={() => openDashboardMetricTarget(asset, batteryMetric.id)}
                                              />
                                            )}
                                          </Group>
                                        ) : "—"}
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge
                                          size="sm"
                                          color={isAssetEnabled(asset) ? "blue" : "orange"}
                                          variant="light"
                                        >
                                          {isAssetEnabled(asset) ? "Enabled" : "Disabled"}
                                        </Badge>
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge
                                          size="sm"
                                          color={healthColor}
                                          variant="light"
                                        >
                                          {asset.health.status}
                                        </Badge>
                                      </Table.Td>
                                      <Table.Td>
                                        <EditActionIcon
                                          onClick={() =>
                                            setAssetForm(
                                              assetFormFromAsset(asset)
                                            )
                                          }
                                        />
                                      </Table.Td>
                                    </Table.Tr>
                                  );
                                })}
                              </Table.Tbody>
                            </Table>
                          </Table.ScrollContainer>
                        )
                  }

                </div>
              )
            }

            <AddMetricToDashboardModal
              opened={dashboardMetricTarget !== null}
              asset={dashboardMetricTarget?.asset ?? null}
              metric={dashboardMetricTarget?.metric ?? null}
              onClose={() => setDashboardMetricTarget(null)}
            />

            <Modal
              opened={classificationManagerOpen}
              onClose={() => {
                if (!saveClassificationMutation.isPending && !deleteClassificationMutation.isPending) {
                  setClassificationManagerOpen(false);
                  setClassificationEditor(emptyClassificationEditor("assetType"));
                }
              }}
              title="Asset metadata"
              size="lg"
            >
              <Stack gap="md">
                <SegmentedControl
                  value={classificationEditor.kind}
                  onChange={value =>
                    setClassificationEditor(
                      emptyClassificationEditor(value as ClassificationKind)
                    )
                  }
                  data={[
                    { label: "Asset types", value: "assetType" },
                    { label: "Manufacturers", value: "manufacturer" },
                    { label: "Tags", value: "tag" }
                  ]}
                />

                {classificationEditor.kind === "assetType" ? (
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                      label="Key"
                      required
                      placeholder="temperature_sensor"
                      value={classificationEditor.key}
                      onChange={event =>
                        setClassificationEditor({
                          ...classificationEditor,
                          key: event.currentTarget.value
                        })
                      }
                    />
                    <TextInput
                      label="Name"
                      required
                      value={classificationEditor.name}
                      onChange={event =>
                        setClassificationEditor({
                          ...classificationEditor,
                          name: event.currentTarget.value
                        })
                      }
                    />
                    <TextInput
                      label="Description"
                      value={classificationEditor.description}
                      onChange={event =>
                        setClassificationEditor({
                          ...classificationEditor,
                          description: event.currentTarget.value
                        })
                      }
                    />
                  </SimpleGrid>
                ) : (
                  <TextInput
                    label={classificationEditor.kind === "manufacturer" ? "Manufacturer" : "Tag"}
                    required
                    value={classificationEditor.name}
                    onChange={event =>
                      setClassificationEditor({
                        ...classificationEditor,
                        name: event.currentTarget.value
                      })
                    }
                  />
                )}

                <Group justify="flex-end">
                  {classificationEditor.originalId && (
                    <Button
                      size="xs"
                      color="gray"
                      variant="light"
                      onClick={() =>
                        setClassificationEditor(
                          emptyClassificationEditor(classificationEditor.kind)
                        )
                      }
                    >
                      Cancel edit
                    </Button>
                  )}
                  <Button
                    size="xs"
                    color={classificationEditor.originalId ? "blue" : "green"}
                    variant="light"
                    loading={saveClassificationMutation.isPending}
                    disabled={
                      !classificationEditor.name.trim() ||
                      (classificationEditor.kind === "assetType" && !classificationEditor.key.trim())
                    }
                    onClick={() => saveClassificationMutation.mutate(classificationEditor)}
                  >
                    {classificationEditor.originalId ? "Save" : "Add"}
                  </Button>
                </Group>

                {saveClassificationMutation.isError && (
                  <Alert color="red" title="Unable to save metadata">
                    {saveClassificationMutation.error instanceof Error
                      ? saveClassificationMutation.error.message
                      : "Unknown error"}
                  </Alert>
                )}

                {deleteClassificationMutation.isError && (
                  <Alert color="red" title="Unable to delete metadata">
                    {deleteClassificationMutation.error instanceof Error
                      ? deleteClassificationMutation.error.message
                      : "Unknown error"}
                  </Alert>
                )}

                <Stack gap="xs">
                  {classificationEditor.kind === "assetType" &&
                    assetTypes.map(item => (
                      <Card key={item.key} withBorder padding="sm">
                        <Group justify="space-between">
                          <div>
                            <Text fw={600}>{item.name}</Text>
                            <Text size="xs" c="dimmed">{item.key}{item.description ? ` · ${item.description}` : ""}</Text>
                          </div>
                          <Group gap="xs">
                            <Button
                              size="compact-xs"
                              color="blue"
                              variant="light"
                              onClick={() =>
                                setClassificationEditor({
                                  kind: "assetType",
                                  originalId: item.key,
                                  key: item.key,
                                  name: item.name,
                                  description: item.description ?? ""
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              onClick={() => {
                                if (window.confirm(`Delete asset type ${item.name}?`)) {
                                  deleteClassificationMutation.mutate({ kind: "assetType", id: item.key });
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    ))}

                  {classificationEditor.kind === "manufacturer" &&
                    manufacturers.map(item => (
                      <Card key={item.name} withBorder padding="sm">
                        <Group justify="space-between">
                          <Text fw={600}>{item.name}</Text>
                          <Group gap="xs">
                            <Button
                              size="compact-xs"
                              color="blue"
                              variant="light"
                              onClick={() =>
                                setClassificationEditor({
                                  kind: "manufacturer",
                                  originalId: item.name,
                                  key: "",
                                  name: item.name,
                                  description: ""
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              onClick={() => {
                                if (window.confirm(`Delete manufacturer ${item.name}?`)) {
                                  deleteClassificationMutation.mutate({ kind: "manufacturer", id: item.name });
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    ))}

                  {classificationEditor.kind === "tag" &&
                    tags.map(item => (
                      <Card key={item.id} withBorder padding="sm">
                        <Group justify="space-between">
                          <Badge variant="light">{item.name}</Badge>
                          <Group gap="xs">
                            <Button
                              size="compact-xs"
                              color="blue"
                              variant="light"
                              onClick={() =>
                                setClassificationEditor({
                                  kind: "tag",
                                  originalId: item.id,
                                  key: "",
                                  name: item.name,
                                  description: ""
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              onClick={() => {
                                if (window.confirm(`Delete tag ${item.name}?`)) {
                                  deleteClassificationMutation.mutate({ kind: "tag", id: item.id });
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    ))}
                </Stack>
              </Stack>
            </Modal>

            <Modal
              opened={assetForm !== null}
              onClose={() => {
                if (!saveAssetMutation.isPending) {
                  setAssetForm(null);
                }
              }}
              title={
                assetForm?.id
                  ? "Edit asset"
                  : "Add asset"
              }
              size="xl"
              centered
              classNames={{ content: "asset-editor-modal-content", body: "asset-editor-modal-body" }}
            >
              {assetForm && (
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                      label="Asset ID"
                      required
                      value={assetForm.externalId}
                      onChange={event =>
                        setAssetForm({
                          ...assetForm,
                          externalId: event.currentTarget.value
                        })
                      }
                    />


                    <Select
                      label="Asset type"
                      required
                      searchable
                      value={assetForm.assetType}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          assetType: value ?? ""
                        })
                      }
                      data={assetTypes.map(type => ({
                        value: type.key,
                        label: type.name
                      }))}
                    />

                    <TextInput
                      label="Protocol"
                      value={assetForm.protocol}
                      onChange={event =>
                        setAssetForm({
                          ...assetForm,
                          protocol: event.currentTarget.value
                        })
                      }
                    />

                    <Select
                      label="Manufacturer"
                      searchable
                      clearable
                      placeholder="Unspecified"
                      value={assetForm.manufacturer || null}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          manufacturer: value ?? ""
                        })
                      }
                      data={manufacturers.map(item => item.name)}
                    />

                    <MultiSelect
                      label="Tags"
                      searchable
                      clearable
                      placeholder="No tags"
                      value={assetForm.tags}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          tags: value
                        })
                      }
                      data={tags.map(tag => tag.name)}
                    />

                    <TextInput
                      label="Model"
                      value={assetForm.model}
                      onChange={event =>
                        setAssetForm({
                          ...assetForm,
                          model: event.currentTarget.value
                        })
                      }
                    />

                    <TextInput
                      label="Firmware version"
                      value={assetForm.firmwareVersion}
                      onChange={event =>
                        setAssetForm({
                          ...assetForm,
                          firmwareVersion: event.currentTarget.value
                        })
                      }
                    />

                    <LocationSelect
                      label="Location"
                      searchable
                      clearable
                      placeholder="Unassigned"
                      value={assetForm.locationId}
                      onChange={locationId => setAssetForm({ ...assetForm, locationId })}
                      locations={assetLocations}
                    />

                    <NumberInput
                      label="Warning after (seconds)"
                      min={1}
                      value={assetForm.warningAfterSeconds}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          warningAfterSeconds:
                            typeof value === "number"
                              ? value
                              : assetForm.warningAfterSeconds
                        })
                      }
                    />

                    <NumberInput
                      label="Offline after (seconds)"
                      min={2}
                      value={assetForm.offlineAfterSeconds}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          offlineAfterSeconds:
                            typeof value === "number"
                              ? value
                              : assetForm.offlineAfterSeconds
                        })
                      }
                    />
                  </SimpleGrid>

                  <Textarea
                    label="Description"
                    autosize
                    minRows={2}
                    value={assetForm.description}
                    onChange={event =>
                      setAssetForm({
                        ...assetForm,
                        description: event.currentTarget.value
                      })
                    }
                  />

                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      Status
                    </Text>
                    <SegmentedControl
                      value={assetForm.enabled ? "enabled" : "disabled"}
                      onChange={value =>
                        setAssetForm({
                          ...assetForm,
                          enabled: value === "enabled"
                        })
                      }
                      data={[
                        { label: "Enabled", value: "enabled" },
                        { label: "Disabled", value: "disabled" }
                      ]}
                    />
                  </div>

                  {saveAssetMutation.isError && (
                    <Alert color="red" title="Unable to save asset">
                      {saveAssetMutation.error instanceof Error
                        ? saveAssetMutation.error.message
                        : "Unknown error"}
                    </Alert>
                  )}

                  <Group justify="space-between">
                    <div>
                      {assetForm.id && (
                        <Button
                          color="red"
                          variant="light"
                          onClick={() => {
                            const currentAsset = assets.find(
                              asset => asset.id === assetForm.id
                            );
                            if (currentAsset) {
                              setAssetPendingDelete(currentAsset);
                            }
                          }}
                        >
                          Delete asset
                        </Button>
                      )}
                    </div>

                    <Group>
                      <Button
                        variant="light"
                        color="gray"
                        disabled={saveAssetMutation.isPending}
                        onClick={() => setAssetForm(null)}
                      >
                        Cancel
                      </Button>

                      <Button
                        loading={saveAssetMutation.isPending}
                        disabled={
                          !assetForm.externalId.trim() ||
                          !assetForm.assetType.trim() ||
                          assetForm.warningAfterSeconds >=
                            assetForm.offlineAfterSeconds
                        }
                        onClick={() =>
                          saveAssetMutation.mutate(assetForm)
                        }
                      >
                        Save
                      </Button>
                    </Group>
                  </Group>
                </Stack>
              )}
            </Modal>

            <Modal
              opened={assetPendingDelete !== null}
              onClose={() => {
                if (!deleteAssetMutation.isPending) {
                  setAssetPendingDelete(null);
                }
              }}
              title="Delete asset"
              size="sm"
            >
              <Stack gap="md">
                <Text>
                  Delete <strong>{assetPendingDelete?.name ?? assetPendingDelete?.externalId}</strong>?
                  This is only allowed when the asset has no metrics attached.
                </Text>

                {deleteAssetMutation.isError && (
                  <Alert color="red" title="Unable to delete asset">
                    {deleteAssetMutation.error instanceof Error
                      ? deleteAssetMutation.error.message
                      : "Unknown error"}
                  </Alert>
                )}

                <Group justify="flex-end">
                  <Button
                    variant="light"
                    color="gray"
                    disabled={deleteAssetMutation.isPending}
                    onClick={() => setAssetPendingDelete(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    loading={deleteAssetMutation.isPending}
                    disabled={!assetPendingDelete}
                    onClick={() => {
                      if (assetPendingDelete) {
                        deleteAssetMutation.mutate(assetPendingDelete.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </Group>
              </Stack>
            </Modal>

{
              activePage ===
                "dashboards" &&
                !templateHistoryActive && (
                <SimpleDashboardPanel
                  onOpenTemplateInHistory={launch => {
                    setHistoryTemplateLaunch(launch);
                    setTemplateHistoryActive(true);
                    setNavbarOpened(false);
                  }}
                />
              )
            }

{
              activePage ===
                "history" &&
                !templateHistoryActive && (
                <HistoryPanel />
              )
            }

            {
              templateHistoryActive &&
                historyTemplateLaunch && (
                <HistoryPanel
                  templateLaunch={historyTemplateLaunch}
                  onCloseTemplateLaunch={() => {
                    setHistoryTemplateLaunch(null);
                    setTemplateHistoryActive(false);
                    navigateTo("dashboards");
                  }}
                  onTemplateViewSaved={() => {
                    setHistoryTemplateLaunch(null);
                    setTemplateHistoryActive(false);
                    navigateTo("history");
                  }}
                />
              )
            }

            {
              activePage ===
                "alerts" && (
                <AlertPanel
                  onOpenAsset={assetId => {
                    const asset =
                      assets.find(
                        current =>
                          current.id === assetId
                      );

                    if (asset) {
                      openAssetForCorrection(
                        asset
                      );
                    }
                  }}
                />
              )
            }

            {
              activePage ===
                "inventory" && (
                <InventoryPanel />
              )
            }

            {
              activePage ===
                "topology" && (
                <TopologyPanel />
              )
            }

            {
              activePage ===
                "sensors" && (
                <SensorCatalog />
              )
            }

            {
              activePage ===
                "gateways" && (
                <GatewayCatalog />
              )
            }

            {
              activePage ===
                "metric-routing" && (
                <MetricRoutingPanel />
              )
            }

            {
              activePage ===
                "gateway-coverage" && (
                <GatewayCoveragePanel />
              )
            }

            {
              activePage ===
                "versions" && (
                <VersionsPanel />
              )
            }

            {
              activePage ===
                "todos" && (
                <ProjectTodosPanel />
              )
            }

          </Stack>

        </Container>

      </AppShell.Main>

    </AppShell>
  );
}

ReactDOM
  .createRoot(
    document.getElementById(
      "root"
    )!
  )
  .render(
    <React.StrictMode>

      <MantineProvider
        defaultColorScheme="auto"
      >

        <QueryClientProvider
          client={queryClient}
        >

          <Dashboard />

        </QueryClientProvider>

      </MantineProvider>

    </React.StrictMode>
  );
