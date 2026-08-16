import React from "react";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";

import {
  getObservationAggregates,
  getObservationHistory
} from "./api";

import {
  SensorChart
} from "./SensorChart";

import type {
  Asset,
  LatestObservation
} from "./types";

import {
  LocationIcon,
  getLocationIconName
} from "./LocationIcon";

interface Props {
  asset: Asset;
  observations: LatestObservation[];
  enabled: boolean;
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

function formatValue(
  observation: LatestObservation
): string {

  if (
    typeof observation.value === "object"
  ) {
    return JSON.stringify(
      observation.value
    );
  }

  const value =
    String(
      observation.value
    );

  return observation.unit
    ? `${value} ${observation.unit}`
    : value;
}

function observationSortOrder(
  observation: LatestObservation
): number {

  const key =
    observation.displayName
      .toLowerCase()
      .replace(
        /[\\s_-]+/g,
        ""
      );

  if (key.includes("temperature")) {
    return 10;
  }

  if (key.includes("humidity")) {
    return 20;
  }

  if (
    key.includes("batterylevel") ||
    key === "battery"
  ) {
    return 30;
  }

  if (key.includes("batteryvoltage")) {
    return 40;
  }

  if (key.includes("rssi")) {
    return 50;
  }

  return 100;
}

function sortObservations(
  observations: LatestObservation[]
): LatestObservation[] {

  return [...observations].sort(
    (a, b) => {

      const orderDifference =
        observationSortOrder(a) -
        observationSortOrder(b);

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return a.displayName.localeCompare(
        b.displayName,
        undefined,
        {
          sensitivity: "base"
        }
      );
    }
  );
}

function qualityColor(
  observation: LatestObservation
): string | null {

  switch (
    observation.quality.status
  ) {
    case "GOOD":
      return "green";

    case "WARNING":
      return "orange";

    case "CRITICAL":
      return "red";

    case "UNKNOWN":
      return null;
  }
}

export function AssetLatestCard({
  asset,
  observations,
  enabled
}: Props) {

  const queryClient =
    useQueryClient();

  const [
    warningAfterSeconds,
    setWarningAfterSeconds
  ] =
    React.useState(
      asset.health.warningAfterSeconds
    );

  const [
    offlineAfterSeconds,
    setOfflineAfterSeconds
  ] =
    React.useState(
      asset.health.offlineAfterSeconds
    );

  React.useEffect(
    () => {
      setWarningAfterSeconds(
        asset.health.warningAfterSeconds
      );

      setOfflineAfterSeconds(
        asset.health.offlineAfterSeconds
      );
    },
    [
      asset.health.warningAfterSeconds,
      asset.health.offlineAfterSeconds
    ]
  );

  const [
    detailsOpened,
    setDetailsOpened
  ] =
    React.useState(false);

  const [
    hours,
    setHours
  ] =
    React.useState(24);

  const temperatureMetric =
    asset.metrics.find(
      metric =>
        metric.key ===
        "temperature"
    );

  const humidityMetric =
    asset.metrics.find(
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
        "asset-detail-history",
        asset.id,
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
        detailsOpened &&
        Boolean(
          temperatureMetric?.id
        ) &&
        !useAggregates
    });

  const humidityHistoryQuery =
    useQuery({
      queryKey: [
        "asset-detail-history",
        asset.id,
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
        detailsOpened &&
        Boolean(
          humidityMetric?.id
        ) &&
        !useAggregates
    });

  const temperatureAggregateQuery =
    useQuery({
      queryKey: [
        "asset-detail-aggregate",
        asset.id,
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
        detailsOpened &&
        Boolean(
          temperatureMetric?.id
        ) &&
        useAggregates
    });

  const humidityAggregateQuery =
    useQuery({
      queryKey: [
        "asset-detail-aggregate",
        asset.id,
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
        detailsOpened &&
        Boolean(
          humidityMetric?.id
        ) &&
        useAggregates
    });

  const healthMutation =
    useMutation({
      mutationFn:
        async () => {

          const response =
            await fetch(
              `/api/v1/assets/${asset.id}`,
              {
                method: "PATCH",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    warningAfterSeconds,
                    offlineAfterSeconds
                  })
              }
            );

          if (!response.ok) {
            const body =
              await response
                .json()
                .catch(
                  () => null
                );

            throw new Error(
              body?.error
              ?? `HTTP ${response.status}`
            );
          }

          return response.json();
        },

      onSuccess:
        async () => {

          await queryClient
            .invalidateQueries({
              queryKey:
                ["assets"]
            });
        }
    });

  const sortedObservations =
    React.useMemo(
      () =>
        sortObservations(
          observations
        ),
      [observations]
    );

  const latestTime =
    observations.length > 0
      ? observations
          .map(
            observation =>
              new Date(
                observation.time
              ).getTime()
          )
          .reduce(
            (latest, current) =>
              Math.max(
                latest,
                current
              )
          )
      : null;

  return (
    <>
    <Card
      withBorder
      radius="md"
      padding="lg"
      style={{
        borderColor:
          asset.health.status ===
          "offline"
            ? "var(--mantine-color-red-5)"
            : asset.health.status ===
              "warning"
              ? "var(--mantine-color-yellow-5)"
              : undefined
      }}
    >

      <Stack gap="md">

        <Group
          justify="space-between"
          align="flex-start"
        >

          <div>
            <Title order={3}>
              {
                asset.sensor?.name
                ?? asset.name
                ?? asset.externalId
              }
            </Title>

            <Text
              size="xs"
              c="dimmed"
            >
              Asset ID: {asset.externalId}
            </Text>

            {asset.sensor && (
              <Text
                size="xs"
                c="dimmed"
              >
                Sensor UID: {asset.sensor.uid}
              </Text>
            )}
          </div>

          <Group gap="xs">

            <Badge
              variant="light"
              color={
                asset.health.status ===
                "online"
                  ? "green"
                  : asset.health.status ===
                    "warning"
                    ? "yellow"
                    : "red"
              }
            >
              {
                asset.health.status ===
                "online"
                  ? "Online"
                  : asset.health.status ===
                    "warning"
                    ? "Warning"
                    : "Offline"
              }
            </Badge>

            <Badge
              variant="light"
              color={
                enabled
                  ? "blue"
                  : "orange"
              }
            >
              {
                enabled
                  ? "Enabled"
                  : "Disabled"
              }
            </Badge>

          </Group>

        </Group>

        <Group
          gap="md"
          justify="space-between"
          wrap="wrap"
        >
          <Group gap="xs">
            <Text
              size="sm"
              c="dimmed"
            >
              Location:
            </Text>

            <Group gap={6}>
              <LocationIcon
                name={
                  getLocationIconName(
                    asset.location
                  )
                }
                size={21}
              />

              <Text size="sm">
                {
                  asset.location?.name
                  ?? "Unassigned"
                }
              </Text>
            </Group>
          </Group>

          <Text
            size="xs"
            c="dimmed"
          >
            Last seen:{" "}
            {
              formatAge(
                asset.health.ageSeconds
              )
            }
            {
              asset.health.lastSeenAt
                ? ` · ${new Date(
                    asset.health.lastSeenAt
                  ).toLocaleString()}`
                : ""
            }
          </Text>
        </Group>

        {observations.length === 0
          ? (
            <Text c="dimmed">
              No observations available.
            </Text>
          )
          : (
            <SimpleGrid
              cols={{
                base: 2,
                sm: 3
              }}
            >
              {sortedObservations.map(
                observation => (
                  <div
                    key={
                      observation.metricId
                    }
                  >
                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      {
                        observation.displayName
                      }
                    </Text>

                    <Group
                      gap="xs"
                      align="center"
                    >
                      <Text
                        size="lg"
                        fw={600}
                      >
                        {
                          formatValue(
                            observation
                          )
                        }
                      </Text>

                      {
                        qualityColor(
                          observation
                        ) && (
                          <Badge
                            size="sm"
                            variant="light"
                            color={
                              qualityColor(
                                observation
                              )!
                            }
                          >
                            {
                              observation
                                .quality
                                .status ===
                              "GOOD"
                                ? "Good"
                                : observation
                                    .quality
                                    .status ===
                                  "WARNING"
                                  ? "Warning"
                                  : "Critical"
                            }
                          </Badge>
                        )
                      }
                    </Group>
                  </div>
                )
              )}
            </SimpleGrid>
          )}

        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            onClick={
              () =>
                setDetailsOpened(
                  true
                )
            }
          >
            View details
          </Button>
        </Group>

        <Text
          size="xs"
          c="dimmed"
        >
          Last update:{" "}
          {
            latestTime
              ? new Date(
                  latestTime
                ).toLocaleString()
              : "—"
          }
        </Text>

      </Stack>

    </Card>

    <Modal
      opened={detailsOpened}
      onClose={
        () =>
          setDetailsOpened(
            false
          )
      }
      title={
        asset.sensor?.name
        ?? asset.name
        ?? asset.externalId
      }
      size="lg"
    >
      <Stack gap="md">

        <SimpleGrid
          cols={{
            base: 1,
            sm: 2
          }}
        >

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Asset ID
            </Text>

            <Text size="sm">
              {asset.externalId}
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Sensor UID
            </Text>

            <Text size="sm">
              {
                asset.sensor?.uid
                ?? "—"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Asset type
            </Text>

            <Text size="sm">
              {asset.assetType}
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Protocol
            </Text>

            <Text size="sm">
              {
                asset.protocol
                ?? "—"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Location
            </Text>

            <Text size="sm">
              {
                asset.location?.name
                ?? "Unassigned"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Status
            </Text>

            <Text size="sm">
              {
                enabled
                ? "Enabled"
                : "Disabled"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Health
            </Text>

            <Text size="sm">
              {
                asset.health.status ===
                "online"
                  ? "Online"
                  : asset.health.status ===
                    "warning"
                    ? "Warning"
                    : "Offline"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Last seen
            </Text>

            <Text size="sm">
              {
                formatAge(
                  asset.health.ageSeconds
                )
              }
            </Text>
          </div>

          <NumberInput
            label="Warning after"
            description="Seconds without data before warning"
            min={1}
            step={60}
            value={
              warningAfterSeconds
            }
            onChange={
              value =>
                setWarningAfterSeconds(
                  Number(value)
                )
            }
            suffix=" s"
          />

          <NumberInput
            label="Offline after"
            description="Seconds without data before offline"
            min={2}
            step={60}
            value={
              offlineAfterSeconds
            }
            onChange={
              value =>
                setOfflineAfterSeconds(
                  Number(value)
                )
            }
            suffix=" s"
          />

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Manufacturer
            </Text>

            <Text size="sm">
              {
                asset.manufacturer
                ?? "—"
              }
            </Text>
          </div>

          <div>
            <Text
              size="xs"
              c="dimmed"
            >
              Model
            </Text>

            <Text size="sm">
              {
                asset.model
                ?? "—"
              }
            </Text>
          </div>

        </SimpleGrid>

        {
          healthMutation.isError && (
            <Text c="red">
              {
                healthMutation.error
                  instanceof Error
                    ? healthMutation.error.message
                    : "Unable to update health thresholds."
              }
            </Text>
          )
        }

        <Group justify="flex-end">
          <Button
            variant="light"
            loading={
              healthMutation.isPending
            }
            disabled={
              warningAfterSeconds < 1 ||
              offlineAfterSeconds < 2 ||
              warningAfterSeconds >=
              offlineAfterSeconds
            }
            onClick={
              () =>
                healthMutation.mutate()
            }
          >
            Save health thresholds
          </Button>
        </Group>

        <Divider />

        <div>
          <Title
            order={4}
            mb="sm"
          >
            Latest observations
          </Title>

          {observations.length === 0
            ? (
              <Text c="dimmed">
                No observations available.
              </Text>
            )
            : (
              <SimpleGrid
                cols={{
                  base: 2,
                  sm: 3
                }}
              >
                {sortedObservations.map(
                  observation => (
                    <Card
                      key={
                        observation.metricId
                      }
                      withBorder
                      padding="sm"
                    >
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        {
                          observation.displayName
                        }
                      </Text>

                      <Group
                        gap="xs"
                        align="center"
                      >
                        <Text
                          fw={600}
                        >
                          {
                            formatValue(
                              observation
                            )
                          }
                        </Text>

                        {
                          qualityColor(
                            observation
                          ) && (
                            <Badge
                              size="sm"
                              variant="light"
                              color={
                                qualityColor(
                                  observation
                                )!
                              }
                            >
                              {
                                observation
                                  .quality
                                  .status ===
                                "GOOD"
                                  ? "Good"
                                  : observation
                                      .quality
                                      .status ===
                                    "WARNING"
                                    ? "Warning"
                                    : "Critical"
                              }
                            </Badge>
                          )
                        }
                      </Group>

                      <Text
                        size="xs"
                        c="dimmed"
                        mt="xs"
                      >
                        {
                          new Date(
                            observation.time
                          ).toLocaleString()
                        }
                      </Text>
                    </Card>
                  )
                )}
              </SimpleGrid>
            )}
        </div>

        <Divider />

        <div>

          <Group
            justify="space-between"
            mb="sm"
          >
            <Title order={4}>
              History
            </Title>

            <SegmentedControl
              size="xs"
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

          {
            !temperatureMetric &&
            !humidityMetric
              ? (
                <Text c="dimmed">
                  No temperature or humidity metrics are available.
                </Text>
              )
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

        <Divider />

        <div>
          <Text
            size="xs"
            c="dimmed"
          >
            Description
          </Text>

          <Text size="sm">
            {
              asset.description
              ?? "No description."
            }
          </Text>
        </div>

      </Stack>
    </Modal>
    </>
  );
}
