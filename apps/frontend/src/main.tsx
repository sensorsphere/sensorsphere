import React from "react";
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
  getSensors
} from "./api";

import {
  AssetLatestCard
} from "./AssetLatestCard";

import {
  SensorCatalog
} from "./SensorCatalog";

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

import {
  usePersistentState
} from "./preferences/usePersistentState";

import "./styles.css";

const queryClient =
  new QueryClient();

const favicon =
  document.querySelector<HTMLLinkElement>(
    'link[rel="icon"]'
  ) ?? document.createElement("link");

favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = "/sensorsphere-app.svg?v=26";
document.head.appendChild(favicon);

type PageKey =
  | "dashboard"
  | "assets"
  | "history"
  | "alerts"
  | "inventory"
  | "sensors";


function NavigationIcon({
  page
}: {
  page: PageKey;
}) {

  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const
  };

  switch (page) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );

    case "assets":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="M8 7V4h8v3" />
          <path d="M9 12h6" />
        </svg>
      );

    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "alerts":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );

    case "inventory":
      return (
        <svg {...common}>
          <path d="M4 5h16v4H4z" />
          <path d="M5 9v11h14V9" />
          <path d="M9 13h6" />
        </svg>
      );

    case "sensors":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2" />
          <path d="M7.8 7.8a6 6 0 0 0 0 8.4" />
          <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
          <path d="M4.9 4.9a10 10 0 0 0 0 14.2" />
          <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
        </svg>
      );
  }
}

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
    "Sensors"
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
    value === "sensors"
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

  const enabledAssets =
    assets.filter(
      asset =>
        asset.enabled
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

  const healthPriority = {
    offline: 0,
    warning: 1,
    online: 2
  } as const;

  const sortedAssets =
    [...assets]
      .sort(
        (left, right) => {

          const healthDifference =
            healthPriority[
              left.health.status
            ] -
            healthPriority[
              right.health.status
            ];

          if (
            healthDifference !== 0
          ) {
            return healthDifference;
          }

          const leftName =
            left.sensor?.name
            ?? left.name
            ?? left.externalId;

          const rightName =
            right.sensor?.name
            ?? right.name
            ?? right.externalId;

          return leftName.localeCompare(
            rightName
          );
        }
      );

  const normalizedCurrentReadingSearch =
    currentReadingSearch
      .trim()
      .toLowerCase();

  const currentReadingAssets =
    sortedAssets.filter(
      asset => {

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

        return (
          matchesSearch &&
          matchesHealth &&
          matchesLocation
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

  const numericTemperatureValues =
    observations
      .filter(
        observation =>
          observation.metricKey ===
          "temperature" &&
          typeof observation.value ===
          "number"
      )
      .map(
        observation =>
          observation.value as number
      );

  const numericHumidityValues =
    observations
      .filter(
        observation =>
          observation.metricKey ===
          "humidity" &&
          typeof observation.value ===
          "number"
      )
      .map(
        observation =>
          observation.value as number
      );

  const average =
    (
      values: number[]
    ): number | null =>
      values.length > 0
        ? values.reduce(
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) /
          values.length
        : null;

  const averageTemperature =
    average(
      numericTemperatureValues
    );

  const averageHumidity =
    average(
      numericHumidityValues
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
                  SensorSphere
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
            "visible"
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

        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>

        <Container
          size="xl"
          py="xl"
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
                  <Title order={2}>
                    Overview
                  </Title>

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
                  md: 4
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

                <Card
                  withBorder
                  radius="md"
                  padding="lg"
                >
                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Average temperature
                  </Text>

                  <Text
                    size="xl"
                    fw={700}
                  >
                    {
                      averageTemperature !==
                      null
                        ? `${averageTemperature.toFixed(1)} °C`
                        : "—"
                    }
                  </Text>

                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Latest values
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
                    Average humidity
                  </Text>

                  <Text
                    size="xl"
                    fw={700}
                  >
                    {
                      averageHumidity !==
                      null
                        ? `${averageHumidity.toFixed(1)} %`
                        : "—"
                    }
                  </Text>

                  <Text
                    size="xs"
                    c="dimmed"
                  >
                    Latest values
                  </Text>
                </Card>

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
                      <Title order={2}>
                        Assets
                      </Title>

                      <Text c="dimmed">
                        Latest observations and asset health
                      </Text>
                    </div>

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
                    />

                    <Select
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
                    />
                  </Group>

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
