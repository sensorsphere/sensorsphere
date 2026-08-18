import React from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  getGatewayCoverage,
  resetGatewayCoverage
} from "./api";

import type {
  GatewayCoverageRow
} from "./types";

function qualityLabel(
  rssi: number
): string {
  if (rssi >= -65) return "Excellent";
  if (rssi >= -75) return "Good";
  if (rssi >= -85) return "Fair";
  return "Weak";
}

function qualityColor(
  rssi: number
): string {
  if (rssi >= -65) return "green";
  if (rssi >= -75) return "teal";
  if (rssi >= -85) return "yellow";
  return "red";
}

function relativeSince(
  value: string | null | undefined
): string {
  if (!value) return "—";

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "—";
  }

  const seconds =
    Math.max(
      0,
      Math.floor(
        (Date.now() - timestamp) / 1000
      )
    );

  if (seconds < 10) return "Depuis quelques secondes";
  if (seconds < 60) return `Depuis ${seconds} s`;

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) return `Depuis ${minutes} min`;

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) return `Depuis ${hours} h`;

  const days =
    Math.floor(hours / 24);

  return `Depuis ${days} j`;
}

function exactDate(
  value: string | null | undefined
): string {
  return value
    ? new Date(value).toLocaleString()
    : "—";
}

function recommendation(
  rows: GatewayCoverageRow[]
): string {
  const winner =
    rows.find(row => row.rank === 1);

  if (!winner) return "—";

  if (winner.leadDb === null) {
    return `${winner.gatewayId} (only gateway)`;
  }

  if (winner.leadDb < 3) {
    return `${winner.gatewayId} (ambiguous, +${winner.leadDb.toFixed(1)} dB)`;
  }

  if (winner.leadDb < 8) {
    return `${winner.gatewayId} (preferred, +${winner.leadDb.toFixed(1)} dB)`;
  }

  return `${winner.gatewayId} (strong, +${winner.leadDb.toFixed(1)} dB)`;
}

export function GatewayCoveragePanel() {
  const queryClient =
    useQueryClient();

  const [hours, setHours] =
    React.useState("24");

  const [resetOpened, setResetOpened] =
    React.useState(false);

  const [sensorSort, setSensorSort] =
    React.useState<"asc" | "desc">("asc");

  const query =
    useQuery({
      queryKey: [
        "gateway-coverage",
        hours
      ],
      queryFn: () =>
        getGatewayCoverage(
          Number(hours)
        ),
      refetchInterval: 30_000
    });

  const rows =
    query.data?.rows ?? [];

  const gatewaySummaries =
    query.data?.gateways ?? [];

  const gateways =
    gatewaySummaries.map(
      gateway => gateway.gatewayId
    );

  const gatewayById =
    new Map(
      gatewaySummaries.map(
        gateway => [
          gateway.gatewayId,
          gateway
        ]
      )
    );

  const sensors =
    Array.from(
      new Set(
        rows.map(row => row.sensorUid)
      )
    ).sort(
      (left, right) =>
        sensorSort === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left)
    );

  const sensorCountByGateway =
    new Map(
      gateways.map(
        gateway => [
          gateway,
          new Set(
            rows
              .filter(
                row =>
                  row.gatewayId === gateway
              )
              .map(row => row.sensorUid)
          ).size
        ]
      )
    );

  const bySensorGateway =
    new Map(
      rows.map(row => [
        `${row.sensorUid}\u0000${row.gatewayId}`,
        row
      ])
    );

  const rowsBySensor =
    new Map<string, GatewayCoverageRow[]>();

  for (const row of rows) {
    const current =
      rowsBySensor.get(row.sensorUid) ?? [];
    current.push(row);
    rowsBySensor.set(row.sensorUid, current);
  }
  const resetMutation =
    useMutation({
      mutationFn:
        resetGatewayCoverage,

      onSuccess:
        async () => {
          setResetOpened(false);

          await queryClient
            .invalidateQueries({
              queryKey: [
                "gateway-coverage"
              ]
            });
        }
    });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Gateway Coverage</Title>
          <Text c="dimmed">
            Compare BLE RSSI received by each candidate ESP gateway.
          </Text>
        </div>

        <Group gap="sm">
          <SegmentedControl
            value={hours}
            onChange={setHours}
            data={[
              { label: "5m", value: String(5 / 60) },
              { label: "10m", value: String(10 / 60) },
              { label: "15m", value: String(15 / 60) },
              { label: "30m", value: "0.5" },
              { label: "1h", value: "1" },
              { label: "6h", value: "6" },
              { label: "24h", value: "24" },
              { label: "7d", value: "168" }
            ]}
          />

          <Button
            variant="light"
            loading={query.isFetching}
            onClick={
              () => void query.refetch()
            }
          >
            Refresh
          </Button>

          <Button
            color="red"
            variant="light"
            onClick={
              () => setResetOpened(true)
            }
          >
            Reset
          </Button>
        </Group>
      </Group>

      {query.isLoading && <Loader />}

      {query.isError && (
        <Alert color="red" title="Coverage data unavailable">
          {query.error instanceof Error
            ? query.error.message
            : "Unable to load gateway coverage data."}
        </Alert>
      )}

      {!query.isLoading && !query.isError && rows.length === 0 && (
        <Alert title="No coverage samples yet">
          Waiting for MQTT topics such as
          {" "}
          sensors/ble_gateway/ble-gateway-01/sensor/rssi_c8_ac_73/state.
        </Alert>
      )}

      {rows.length > 0 && (
        <Card withBorder padding="md">
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      px={0}
                      onClick={
                        () =>
                          setSensorSort(
                            current =>
                              current === "asc"
                                ? "desc"
                                : "asc"
                          )
                      }
                    >
                      Sensor ({sensors.length}) {
                        sensorSort === "asc"
                          ? "↑"
                          : "↓"
                      }
                    </Button>
                  </Table.Th>
                  {gateways.map(gateway => {
                    const summary =
                      gatewayById.get(gateway);

                    return (
                      <Table.Th key={gateway}>
                        <Stack gap={2}>
                          <Text fw={600}>
                            {gateway}
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            fw={400}
                          >
                            {
                              sensorCountByGateway
                                .get(gateway) ?? 0
                            } sensors
                          </Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            fw={400}
                            title={
                              exactDate(
                                summary?.lastSeenAt
                              )
                            }
                          >
                            {
                              relativeSince(
                                summary?.lastSeenAt
                              )
                            }
                          </Text>
                        </Stack>
                      </Table.Th>
                    );
                  })}
                  <Table.Th>Suggested gateway</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {sensors.map(sensorUid => {
                  const sensorRows =
                    rowsBySensor.get(sensorUid) ?? [];

                  return (
                    <Table.Tr key={sensorUid}>
                      <Table.Td>
                        <Text fw={600}>{sensorUid}</Text>
                      </Table.Td>

                      {gateways.map(gateway => {
                        const row =
                          bySensorGateway.get(
                            `${sensorUid}\u0000${gateway}`
                          );

                        if (!row) {
                          return <Table.Td key={gateway}>—</Table.Td>;
                        }

                        return (
                          <Table.Td key={gateway}>
                            <Stack gap={2}>
                              <Group gap="xs">
                                <Text fw={row.rank === 1 ? 700 : 500}>
                                  {row.avgRssi.toFixed(1)} dBm
                                </Text>
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color={qualityColor(row.avgRssi)}
                                >
                                  {qualityLabel(row.avgRssi)}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                min {row.minRssi.toFixed(0)} · max {row.maxRssi.toFixed(0)} · σ {row.stddevRssi.toFixed(1)}
                              </Text>
                              <Text
                                size="xs"
                                c="dimmed"
                                title={
                                  exactDate(
                                    row.lastSeenAt
                                  )
                                }
                              >
                                {row.sampleCount} samples
                                {" · "}
                                {
                                  relativeSince(
                                    row.lastSeenAt
                                  )
                                }
                              </Text>
                            </Stack>
                          </Table.Td>
                        );
                      })}

                      <Table.Td>
                        <Text fw={600}>
                          {recommendation(sensorRows)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <Modal
        opened={resetOpened}
        onClose={
          () => setResetOpened(false)
        }
        title="Reset gateway coverage"
        centered
      >
        <Stack gap="md">
          <Text>
            Delete all recorded gateway coverage RSSI samples?
            This cannot be undone.
          </Text>

          {resetMutation.isError && (
            <Alert
              color="red"
              title="Unable to reset coverage data"
            >
              {
                resetMutation.error
                  instanceof Error
                    ? resetMutation.error.message
                    : "Reset failed."
              }
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                () => setResetOpened(false)
              }
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={resetMutation.isPending}
              onClick={
                () => resetMutation.mutate()
              }
            >
              Reset all data
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
