import React from "react";
import ReactDOM from "react-dom/client";

import {
  Alert,
  AppShell,
  Badge,
  Card,
  Container,
  Group,
  Loader,
  MantineProvider,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title
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
  getObservationAggregates,
  getObservationHistory,
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
  SensorChart
} from "./SensorChart";

import "./styles.css";

const queryClient =
  new QueryClient();

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

function Dashboard() {

  const [
    selectedSensor,
    setSelectedSensor
  ] =
    React.useState<string>("");

  const [
    hours,
    setHours
  ] =
    React.useState(24);

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

  React.useEffect(() => {

    if (
      !selectedSensor &&
      sensorsQuery.data?.length
    ) {

      setSelectedSensor(
        sensorsQuery.data[0].uid
      );
    }

  }, [
    sensorsQuery.data,
    selectedSensor
  ]);

  const selectedAsset =
    assetsQuery.data?.find(
      asset =>
        asset.sensor?.uid ===
        selectedSensor
    );

  const temperatureMetric =
    selectedAsset?.metrics.find(
      metric =>
        metric.key ===
        "temperature"
    );

  const humidityMetric =
    selectedAsset?.metrics.find(
      metric =>
        metric.key ===
        "humidity"
    );

  const useAggregates =
    hours > 24;

  const aggregateBucket =
    hours <= 168
      ? "15 minutes" as const
      : "1 hour" as const;

  const temperatureHistoryQuery =
    useQuery({
      queryKey: [
        "observation-history",
        temperatureMetric?.id,
        hours
      ],

      queryFn:
        () =>
          getObservationHistory(
            temperatureMetric!.id,
            hours
          ),

      enabled:
        Boolean(
          temperatureMetric?.id
        ) &&
        !useAggregates,

      refetchInterval:
        60_000
    });

  const humidityHistoryQuery =
    useQuery({
      queryKey: [
        "observation-history",
        humidityMetric?.id,
        hours
      ],

      queryFn:
        () =>
          getObservationHistory(
            humidityMetric!.id,
            hours
          ),

      enabled:
        Boolean(
          humidityMetric?.id
        ) &&
        !useAggregates,

      refetchInterval:
        60_000
    });

  const temperatureAggregateQuery =
    useQuery({
      queryKey: [
        "observation-aggregate",
        temperatureMetric?.id,
        hours,
        aggregateBucket
      ],

      queryFn:
        () =>
          getObservationAggregates(
            temperatureMetric!.id,
            hours,
            aggregateBucket
          ),

      enabled:
        Boolean(
          temperatureMetric?.id
        ) &&
        useAggregates,

      refetchInterval:
        60_000
    });

  const humidityAggregateQuery =
    useQuery({
      queryKey: [
        "observation-aggregate",
        humidityMetric?.id,
        hours,
        aggregateBucket
      ],

      queryFn:
        () =>
          getObservationAggregates(
            humidityMetric!.id,
            hours,
            aggregateBucket
          ),

      enabled:
        Boolean(
          humidityMetric?.id
        ) &&
        useAggregates,

      refetchInterval:
        60_000
    });

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

            <Title order={2}>
              SensorSphere
            </Title>

            <Text c="dimmed">
              Environmental monitoring
            </Text>

          </Group>

        </Container>

      </AppShell.Header>

      <AppShell.Main>

        <Container
          size="xl"
          py="xl"
        >

          <Stack gap="xl">

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

            {
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

            <div>

              <Title
                order={2}
                mb="md"
              >
                Latest asset observations
              </Title>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 2
                }}
              >

                {sortedAssets.map(
                  asset => (

                    <AssetLatestCard
                      key={asset.id}
                      asset={asset}
                      observations={
                        observationsByAsset.get(
                          asset.id
                        ) ?? []
                      }
                    />

                  )
                )}

              </SimpleGrid>

            </div>

            <div>

              <Group
                justify="space-between"
                mb="md"
              >

                <Title order={2}>
                  History
                </Title>

                <SegmentedControl
                  value={
                    String(hours)
                  }

                  onChange={
                    value =>
                      setHours(
                        Number(value)
                      )
                  }

                  data={[
                    {
                      label: "1 h",
                      value: "1"
                    },
                    {
                      label: "2 h",
                      value: "2"
                    },
                    {
                      label: "3 h",
                      value: "3"
                    },
                    {
                      label: "6 h",
                      value: "6"
                    },
                    {
                      label: "12 h",
                      value: "12"
                    },
                    {
                      label: "24 h",
                      value: "24"
                    },
                    {
                      label: "7 days",
                      value: "168"
                    },
                    {
                      label: "30 days",
                      value: "720"
                    }
                  ]}
                />

              </Group>

              {sensors.length > 0 && (

                <SegmentedControl
                  mb="md"

                  value={
                    selectedSensor
                  }

                  onChange={
                    setSelectedSensor
                  }

                  data={
                    sensors.map(
                      sensor => ({
                        label:
                          sensor.name
                          ?? sensor.uid,

                        value:
                          sensor.uid
                      })
                    )
                  }
                />

              )}

              {
                (
                  !useAggregates &&
                  (
                    temperatureHistoryQuery.isLoading ||
                    humidityHistoryQuery.isLoading
                  )
                ) ||
                (
                  useAggregates &&
                  (
                    temperatureAggregateQuery.isLoading ||
                    humidityAggregateQuery.isLoading
                  )
                )
                  ? <Loader />

                  : (
                    <SensorChart
                      hours={hours}
                      temperature={
                        temperatureHistoryQuery.data
                        ?? []
                      }
                      humidity={
                        humidityHistoryQuery.data
                        ?? []
                      }
                      temperatureAggregates={
                        temperatureAggregateQuery.data
                        ?? []
                      }
                      humidityAggregates={
                        humidityAggregateQuery.data
                        ?? []
                      }
                    />
                  )
              }

            </div>

            <InventoryPanel />

            <SensorCatalog />

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

      <MantineProvider>

        <QueryClientProvider
          client={queryClient}
        >

          <Dashboard />

        </QueryClientProvider>

      </MantineProvider>

    </React.StrictMode>
  );
