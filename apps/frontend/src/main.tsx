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
  Menu,
  NavLink,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme
} from "@mantine/core";

import "@mantine/core/styles.css";

import {
  QueryClient,
  QueryClientProvider,
  useQuery
} from "@tanstack/react-query";

import {
  getAssets,
  getLatestObservations,
  getRuntimeConfig,
  getFrontendBuildDate,
  getProjectTodos,
  getSensors
} from "./api";

import {
  AssetLatestCard
} from "./AssetLatestCard";

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
  AlertPanel
} from "./AlertPanel";

import {
  HistoryPanel
} from "./HistoryPanel";

import {
  getActiveAlerts
} from "./alerts-api";

import type {
  Asset
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

import {
  GatewayCoveragePanel
} from "./GatewayCoveragePanel";

import {
  MetricRoutingPanel
} from "./MetricRoutingPanel";

import {
  ProjectTodosPanel
} from "./ProjectTodosPanel";

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

function ThemeSelector() {
  const {
    colorScheme,
    setColorScheme
  } = useMantineColorScheme();

  const icon =
    colorScheme === "dark"
      ? "☾"
      : colorScheme === "light"
        ? "☀"
        : "◐";

  return (
    <Menu position="bottom-end" shadow="md" width={150}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label="Select theme"
          title={`Theme: ${colorScheme}`}
        >
          <span style={{ fontSize: 19, lineHeight: 1 }}>
            {icon}
          </span>
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Appearance</Menu.Label>
        <Menu.Item onClick={() => setColorScheme("light")}>
          ☀ Light
        </Menu.Item>
        <Menu.Item onClick={() => setColorScheme("dark")}>
          ☾ Dark
        </Menu.Item>
        <Menu.Item onClick={() => setColorScheme("auto")}>
          ◐ System
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const PAGE_LABELS:
Record<PageKey, string> = {
  dashboard:
    "Dashboard",

  assets:
    "Assets",

  history:
    "History",

  alerts:
    "Alerts",

  inventory:
    "Inventory",

  sensors:
    "Sensors",

  gateways:
    "Gateways",

  "metric-routing":
    "Metric Routing",

  "gateway-coverage":
    "Gateway Coverage",

  todos:
    "Project Todos"
};

function isPageKey(
  value: unknown
): value is PageKey {

  return (
    value === "dashboard" ||
    value === "assets" ||
    value === "history" ||
    value === "alerts" ||
    value === "inventory" ||
    value === "sensors" ||
    value === "gateways" ||
    value === "metric-routing" ||
    value === "gateway-coverage" ||
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

function Dashboard() {

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

      const assets =
        assetsQuery.data
        ?? [];

      if (
        assets.length === 0
      ) {
        return;
      }

      const exists =
        assets.some(
          asset =>
            asset.location?.id ===
            assetLocationFilter
        );

      if (!exists) {
        setAssetLocationFilter(
          null
        );
      }

    },
    [
      assetLocationFilter,
      assetsQuery.data,
      setAssetLocationFilter
    ]
  );

  if (
    assetsQuery.isLoading ||
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

  const currentReadingLocationOptions =
    Array.from(
      new Map(
        assets
          .filter(asset => asset.location)
          .map(asset => [
            asset.location!.id,
            asset.location!.name
          ])
      )
    )
      .map(([value, label]) => ({
        value,
        label
      }))
      .sort((left, right) =>
        left.label.localeCompare(
          right.label,
          undefined,
          { sensitivity: "base" }
        )
      );

  const currentReadingAssets =
    sortedAssets.filter(
      asset => {
        const matchesLocation =
          currentReadingLocation === null ||
          (
            currentReadingLocation === "__unassigned__"
              ? asset.location === null
              : asset.location?.id ===
                currentReadingLocation
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
          ?? asset.name
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

  const assetLocations =
    Array.from(
      new Map(
        assets
          .filter(
            asset =>
              asset.location !==
              null
          )
          .map(
            asset => [
              asset.location!.id,
              asset.location!
            ]
          )
      )
      .values()
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(
          right.name
        )
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
            ?? asset.name
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
          );

        const matchesHealth =
          assetHealthFilter ===
            "all" ||
          asset.health.status ===
            assetHealthFilter;

        const matchesLocation =
          assetLocationFilter ===
            null ||
          asset.location?.id ===
            assetLocationFilter;

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

        return (
          matchesSearch &&
          matchesHealth &&
          matchesLocation &&
          matchesEnabled
        );
      }
    );

  const unassignedAssets =
    assets.filter(
      asset =>
        asset.location === null
    );

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
                  ?? asset.name
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
          size="xl"
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
                    PAGE_LABELS[
                      activePage
                    ]
                  }
                </Text>
              </div>

            </Group>

            <Group gap="sm">
              <Text
                c="dimmed"
                visibleFrom="sm"
              >
                Environmental monitoring
              </Text>

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
            "column"
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

        <Stack gap="xs">

          <NavLink
            label={
              navbarCollapsed
                ? null
                : "Dashboard"
            }
            leftSection={
              <NavigationIcon
                page="dashboard"
              />
            }
            title="Dashboard"
            aria-label="Dashboard"
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

              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">Frontend</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {formatBuildDate(frontendBuildQuery.data)}
                </Text>
              </Group>

              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">API</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {formatBuildDate(apiBuildDate)}
                </Text>
              </Group>

              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">Ingestion</Text>
                <Text size="xs" c="dimmed" ta="right">
                  {formatBuildDate(ingestionBuildDate)}
                </Text>
              </Group>
            </Stack>
          )}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>

        <Container
          fluid
          py="xl"
          px="md"
        >

          <Stack gap="xl">

            {
              activePage ===
                "dashboard" && (
            <div>

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
                    {warningAssets.length} Warning
                  </Badge>

                  <Badge
                    variant="light"
                    color="red"
                  >
                    {offlineAssets.length} Offline
                  </Badge>
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
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Assets
                  </Text>

                  <Text
                    size="xl"
                    fw={700}
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
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Locations
                  </Text>

                  <Text
                    size="xl"
                    fw={700}
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
                    unit: "°C"
                  },
                  {
                    label: "Temperature Max",
                    extreme:
                      temperatureExtremes.max,
                    unit: "°C"
                  },
                  {
                    label: "Humidity Min",
                    extreme:
                      humidityExtremes.min,
                    unit: "%"
                  },
                  {
                    label: "Humidity Max",
                    extreme:
                      humidityExtremes.max,
                    unit: "%"
                  }
                ].map(item => (
                  <Card
                    key={item.label}
                    withBorder
                    radius="md"
                    padding="lg"
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      {item.label}
                    </Text>

                    <Text
                      size="xl"
                      fw={700}
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
                offlineAssets.length > 0 ||
                warningAssets.length > 0 ||
                unassignedAssets.length > 0
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

                    {offlineAssets.length > 0 && (
                      <Alert
                        color="red"
                        title={
                          `${offlineAssets.length} asset${
                            offlineAssets.length > 1
                              ? "s"
                              : ""
                          } offline`
                        }
                      >
                        <Stack gap="xs">
                          {offlineAssets.map(
                            asset => (
                              <Text
                                key={asset.id}
                                size="sm"
                              >
                                {
                                  asset.sensor?.name
                                  ?? asset.name
                                  ?? asset.externalId
                                }
                                {" · "}
                                {
                                  formatAge(
                                    asset.health.ageSeconds
                                  )
                                }
                              </Text>
                            )
                          )}
                        </Stack>
                      </Alert>
                    )}

                    {warningAssets.length > 0 && (
                      <Alert
                        color="yellow"
                        title={
                          `${warningAssets.length} asset${
                            warningAssets.length > 1
                              ? "s"
                              : ""
                          } in warning state`
                        }
                      >
                        <Stack gap="xs">
                          {warningAssets.map(
                            asset => (
                              <Text
                                key={asset.id}
                                size="sm"
                              >
                                {
                                  asset.sensor?.name
                                  ?? asset.name
                                  ?? asset.externalId
                                }
                                {" · "}
                                {
                                  formatAge(
                                    asset.health.ageSeconds
                                  )
                                }
                              </Text>
                            )
                          )}
                        </Stack>
                      </Alert>
                    )}

                    {unassignedAssets.length > 0 && (
                      <Alert
                        color="yellow"
                        title={
                          `${unassignedAssets.length} unassigned asset${
                            unassignedAssets.length > 1
                              ? "s"
                              : ""
                          }`
                        }
                      >
                        <Stack gap="xs">
                          {unassignedAssets.map(
                            asset => (
                              <Text
                                key={asset.id}
                                size="sm"
                              >
                                {
                                  asset.sensor?.name
                                  ?? asset.name
                                  ?? asset.externalId
                                }
                              </Text>
                            )
                          )}
                        </Stack>
                      </Alert>
                    )}

                  </SimpleGrid>

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
                                      padding="sm"
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

                                        <Text
                                          fw={600}
                                          size="sm"
                                        >
                                          {
                                            alert.currentValue !==
                                              null
                                              ? `${alert.currentValue}${alert.unit ? ` ${alert.unit}` : ""}`
                                              : "—"
                                          }
                                        </Text>
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
                <div>

                  <Group
                    justify="space-between"
                    mb="md"
                  >
                    <div>
                      <Title order={2}>
                        Current readings
                      </Title>

                      <Text c="dimmed">
                        Latest temperature and humidity by asset
                      </Text>
                    </div>

                    <Group
                      gap="sm"
                      align="flex-end"
                    >
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

                      <Select
                        label="Location"
                        clearable
                        searchable
                        placeholder="All locations"
                        value={currentReadingLocation}
                        onChange={setCurrentReadingLocation}
                        data={[
                          {
                            value: "__unassigned__",
                            label: "Unassigned"
                          },
                          ...currentReadingLocationOptions
                        ]}
                        styles={activeFilterStyles(currentReadingLocation !== null)}
                      />


                      <BadgeSelect
                        badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "gray" : "gray"}
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
                      <Badge variant="light">
                        {
                          currentReadingAssets.length
                        } / {assets.length} assets
                      </Badge>
                    </Group>
                  </Group>

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
                                        ?? asset.name
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
              )
            }

            {
              activePage ===
                "assets" && (
                <div>

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
                    <TextInput
                      label="Search"
                      placeholder="Name, ID or location"
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
                      style={{
                        flex: 1
                      }}
                      styles={activeFilterStyles(assetSearch.trim().length > 0)}
                    />

                    <BadgeSelect
                      badgeColor={value => value === "online" ? "green" : value === "warning" ? "yellow" : value === "offline" ? "red" : "gray"}
                      label="Health"
                      value={
                        assetHealthFilter
                      }
                      onChange={
                        value =>
                          value &&
                          setAssetHealthFilter(
                            value as
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
                      badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "gray" : "gray"}
                      label="Status"
                      value={
                        assetEnabledFilter
                      }
                      onChange={
                        value =>
                          value &&
                          setAssetEnabledFilter(
                            value as
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

                    <Select
                      label="Location"
                      clearable
                      searchable
                      placeholder="All locations"
                      value={
                        assetLocationFilter
                      }
                      onChange={
                        setAssetLocationFilter
                      }
                      data={
                        assetLocations.map(
                          location => ({
                            value:
                              location.id,

                            label:
                              location.name
                          })
                        )
                      }
                      styles={activeFilterStyles(assetLocationFilter !== null)}
                    />


                    <ResetFiltersAction
                      active={
                        assetSearch.trim().length > 0 ||
                        assetHealthFilter !== "all" ||
                        assetEnabledFilter !== "all" ||
                        assetLocationFilter !== null
                      }
                      onReset={
                        () => {
                          setAssetSearch("");
                          setAssetHealthFilter("all");
                          setAssetEnabledFilter("all");
                          setAssetLocationFilter(null);
                        }
                      }
                    />                  </Group>

                  <Text
                    size="xs"
                    c="dimmed"
                    mb="sm"
                  >
                    {
                      filteredAssets.length
                    } of {
                      assets.length
                    } assets
                  </Text>

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
                                  />
                                )
                              )
                            }
                          </SimpleGrid>
                        )
                        : (
                          <Stack gap="xs">
                            {
                              filteredAssets.map(
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

                                  const battery =
                                    latestMetricValue(
                                      assetObservations,
                                      "battery"
                                    );

                                  const healthColor =
                                    asset.health.status ===
                                      "online"
                                      ? "green"
                                      : asset.health.status ===
                                          "warning"
                                        ? "yellow"
                                        : "red";

                                  return (
                                    <Card
                                      key={
                                        asset.id
                                      }
                                      withBorder
                                      radius="md"
                                      padding="sm"
                                    >
                                      <Group
                                        justify="space-between"
                                        align="center"
                                      >

                                        <div
                                          style={{
                                            minWidth: 220
                                          }}
                                        >
                                          <Text fw={700}>
                                            {
                                              asset.sensor?.name
                                              ?? asset.name
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
                                              size={15}
                                            />

                                            <Text
                                              size="xs"
                                              c="dimmed"
                                            >
                                              {
                                                asset.location?.name
                                                ?? "Unassigned"
                                              }
                                              {" · "}
                                              {
                                                asset.externalId
                                              }
                                            </Text>
                                          </Group>
                                        </div>

                                        <Group gap="xl">

                                          <div>
                                            <Text
                                              size="xs"
                                              c="dimmed"
                                            >
                                              Temperature
                                            </Text>

                                            <Text fw={600}>
                                              {
                                                temperature !==
                                                  null
                                                  ? `${temperature} °C`
                                                  : "—"
                                              }
                                            </Text>
                                          </div>

                                          <div>
                                            <Text
                                              size="xs"
                                              c="dimmed"
                                            >
                                              Humidity
                                            </Text>

                                            <Text fw={600}>
                                              {
                                                humidity !==
                                                  null
                                                  ? `${humidity} %`
                                                  : "—"
                                              }
                                            </Text>
                                          </div>

                                          <div>
                                            <Text
                                              size="xs"
                                              c="dimmed"
                                            >
                                              Battery
                                            </Text>

                                            <Text fw={600}>
                                              {
                                                battery !==
                                                  null
                                                  ? `${battery} %`
                                                  : "—"
                                              }
                                            </Text>
                                          </div>

                                          <Badge
                                            color={
                                              isAssetEnabled(asset)
                                                ? "green"
                                                : "orange"
                                            }
                                            variant="light"
                                          >
                                            {
                                              isAssetEnabled(asset)
                                                ? "Enabled"
                                                : "Disabled"
                                            }
                                          </Badge>

                                          <Badge
                                            color={
                                              healthColor
                                            }
                                            variant="light"
                                          >
                                            {
                                              asset.health.status
                                            }
                                          </Badge>

                                        </Group>

                                      </Group>
                                    </Card>
                                  );
                                }
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
                "history" && (
                <HistoryPanel />
              )
            }

            {
              activePage ===
                "alerts" && (
                <AlertPanel />
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
