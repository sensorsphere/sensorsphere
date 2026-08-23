import React from "react";

import { activeFilterStyles } from "./filterStyles";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import { NavigationIcon } from "./NavigationIcon";
import { ResetFiltersAction } from "./ResetFiltersAction";
import {
  clearMetricRoutingEvents,
  getLocations,
  getMetricRoutingEvents,
  getMetricRoutingStatus,
  getMetricRoutingSummary
} from "./api";
import { usePersistentState } from "./preferences/usePersistentState";
import type { MetricRoutingDecision } from "./types";

const REFRESH_INTERVAL_MS = 2_000;

const DECISIONS: MetricRoutingDecision[] = [
  "ACCEPT",
  "IGNORE",
  "DEDUPLICATE",
  "ERROR"
];

function decisionColor(decision: MetricRoutingDecision): string {
  if (decision === "ACCEPT") return "green";
  if (decision === "IGNORE") return "orange";
  if (decision === "DEDUPLICATE") return "blue";
  return "red";
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export function MetricRoutingPanel() {
  const queryClient = useQueryClient();
  const [hours, setHours] = usePersistentState("metricRouting.period", "1");
  const [paused, setPaused] = React.useState(false);
  const [hiddenDecisions, setHiddenDecisions] = usePersistentState<MetricRoutingDecision[]>(
    "metricRouting.hiddenDecisions",
    []
  );
  const [sensorFilter, setSensorFilter] = usePersistentState("metricRouting.sensor", "");
  const [gatewayFilter, setGatewayFilter] = usePersistentState("metricRouting.gateway", "");
  const [locationId, setLocationId] = usePersistentState<string | null>("metricRouting.location", null);
  const [metricFilter, setMetricFilter] = usePersistentState("metricRouting.metric", "");

  const statusQuery = useQuery({
    queryKey: ["metric-routing-status"],
    queryFn: getMetricRoutingStatus,
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS
  });

  const summaryQuery = useQuery({
    queryKey: ["metric-routing-summary", hours],
    queryFn: () => getMetricRoutingSummary(Number(hours)),
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS
  });

  const eventsQuery = useInfiniteQuery({
    queryKey: [
      "metric-routing-events",
      hours
    ],
    initialPageParam: null as { occurredAt: string; id: number } | null,
    queryFn: ({ pageParam }) => getMetricRoutingEvents({
      hours: Number(hours),
      limit: 500,
      beforeOccurredAt: pageParam?.occurredAt,
      beforeId: pageParam?.id
    }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS
  });

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: getLocations
  });

  const clearMutation = useMutation({
    mutationFn: clearMetricRoutingEvents,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["metric-routing-events"] }),
        queryClient.invalidateQueries({ queryKey: ["metric-routing-summary"] })
      ]);
    }
  });

  const status = statusQuery.data;
  const summary = summaryQuery.data;

  const normalizedSensorFilter =
    sensorFilter.trim().toLocaleLowerCase();
  const normalizedGatewayFilter =
    gatewayFilter.trim().toLocaleLowerCase();
  const normalizedMetricFilter =
    metricFilter.trim().toLocaleLowerCase();

  const loadedEvents =
    eventsQuery.data?.pages.flatMap(page => page.events) ?? [];

  const events = loadedEvents.filter(event => {
    if (hiddenDecisions.includes(event.decision)) return false;

    if (normalizedSensorFilter) {
      const uid = event.sensorUid.toLocaleLowerCase();
      const name = (event.sensorName ?? "").toLocaleLowerCase();
      if (!uid.includes(normalizedSensorFilter) && !name.includes(normalizedSensorFilter)) {
        return false;
      }
    }

    if (normalizedGatewayFilter &&
        !event.gatewayId.toLocaleLowerCase().includes(normalizedGatewayFilter)) {
      return false;
    }

    if (locationId && event.gatewayLocationId !== locationId) return false;

    if (normalizedMetricFilter &&
        !event.metric.toLocaleLowerCase().includes(normalizedMetricFilter)) {
      return false;
    }

    return true;
  });

  const locationOptions = (locationsQuery.data ?? [])
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(location => ({
      value: location.id,
      label: location.name
    }));

  const filtersActive =
    hiddenDecisions.length > 0 ||
    sensorFilter.trim().length > 0 ||
    gatewayFilter.trim().length > 0 ||
    locationId !== null ||
    metricFilter.trim().length > 0;

  const resetFilters = (): void => {
    setHiddenDecisions([]);
    setSensorFilter("");
    setGatewayFilter("");
    setLocationId(null);
    setMetricFilter("");
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Group gap="xs">
            <NavigationIcon page="metric-routing" size={24} />
            <Title order={2}>Metric Routing</Title>
          </Group>
          <Text c="dimmed">
            Observe how gateway-qualified MQTT metrics would be routed before activation.
          </Text>
        </div>
        <Group align="flex-end" wrap="wrap">
          <Select
            label="Period"
            value={hours}
            onChange={value => value && setHours(value)}
            allowDeselect={false}
            w={96}
            data={[
              { value: String(2 / 60), label: "2m" },
              { value: String(3 / 60), label: "3m" },
              { value: String(5 / 60), label: "5m" },
              { value: String(10 / 60), label: "10m" },
              { value: "0.25", label: "15m" },
              { value: "1", label: "1h" },
              { value: "6", label: "6h" },
              { value: "24", label: "24h" },
              { value: "48", label: "48h" }
            ]}
          />
          <Badge
            size="lg"
            color={status?.mode === "active" ? "green" : status?.mode === "dry_run" ? "yellow" : "gray"}
          >
            {status?.mode === "dry_run" ? "DRY RUN" : (status?.mode ?? "UNKNOWN").toUpperCase()}
          </Badge>
          <Text size="sm" c="dimmed" pb={6}>
            Refresh: {REFRESH_INTERVAL_MS / 1000} s
          </Text>
          <Button variant="light" onClick={() => setPaused(value => !value)}>
            {paused ? "Resume live" : "Pause live"}
          </Button>
          <Button
            color="red"
            variant="light"
            loading={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Clear logs
          </Button>
        </Group>
      </Group>

      {status?.mode === "active" && (
        <Alert color="green" title="Active routing">
          Accepted gateway-qualified metrics are currently fed into the normal measurement pipeline.
        </Alert>
      )}
      {status?.mode === "dry_run" && (
        <Alert color="yellow" title="Dry-run mode">
          Decisions are logged only. Gateway-qualified metrics do not modify normal measurements.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, md: 5 }}>
        {[
          ["Received", summary?.received ?? 0],
          ["Would accept", summary?.accepted ?? 0],
          ["Would ignore", summary?.ignored ?? 0],
          ["Duplicates", summary?.deduplicated ?? 0],
          ["Errors", summary?.errors ?? 0]
        ].map(([label, value]) => (
          <Card key={String(label)} withBorder padding="sm">
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={700} size="xl">{value}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <TextInput
              label="Sensor"
              placeholder="Name or UID"
              value={sensorFilter}
              onChange={e => setSensorFilter(e.currentTarget.value)}
              styles={activeFilterStyles(sensorFilter.trim().length > 0)}
            />
            <TextInput
              label="Gateway"
              placeholder="gateway_id"
              value={gatewayFilter}
              onChange={e => setGatewayFilter(e.currentTarget.value)}
              styles={activeFilterStyles(gatewayFilter.trim().length > 0)}
            />
            <Select
              label="Location"
              placeholder="All locations"
              clearable
              searchable
              value={locationId}
              onChange={setLocationId}
              data={locationOptions}
              styles={activeFilterStyles(locationId !== null)}
            />
            <TextInput
              label="Metric"
              placeholder="temperature"
              value={metricFilter}
              onChange={e => setMetricFilter(e.currentTarget.value)}
              styles={activeFilterStyles(metricFilter.trim().length > 0)}
            />
          </SimpleGrid>

          <Group align="flex-end" wrap="wrap">
            <MultiSelect
              label="Hide decisions"
              placeholder="None hidden"
              clearable
              w={360}
              value={hiddenDecisions}
              onChange={values =>
                setHiddenDecisions(values as MetricRoutingDecision[])
              }
              data={DECISIONS.map(decision => ({
                value: decision,
                label: decision
              }))}
              renderOption={({ option }) => (
                <Badge
                  color={decisionColor(option.value as MetricRoutingDecision)}
                  variant="light"
                >
                  {option.label}
                </Badge>
              )}
              styles={activeFilterStyles(hiddenDecisions.length > 0)}
            />
            <Button
              size="compact-sm"
              variant={
                hiddenDecisions.includes("ACCEPT") &&
                hiddenDecisions.includes("IGNORE")
                  ? "filled"
                  : "light"
              }
              onClick={() =>
                setHiddenDecisions(["ACCEPT", "IGNORE"])
              }
            >
              Anomalies only
            </Button>
            <ResetFiltersAction
              active={filtersActive}
              onReset={resetFilters}
            />
            <Text size="xs" c="dimmed">
              Loaded {loadedEvents.length} / {summary?.received ?? 0} events for selected period
              {eventsQuery.hasNextPage ? " · scroll down to load older events" : ""}
            </Text>
          </Group>

          {eventsQuery.isError ? (
            <Text c="red">Unable to load routing events.</Text>
          ) : (
            <div
              className="metric-routing-table-scroll"
              onScroll={event => {
                const target = event.currentTarget;
                const remaining =
                  target.scrollHeight - target.scrollTop - target.clientHeight;

                if (
                  remaining < 240 &&
                  eventsQuery.hasNextPage &&
                  !eventsQuery.isFetchingNextPage
                ) {
                  void eventsQuery.fetchNextPage();
                }
              }}
            >
              <Table
                className="metric-routing-table"
                striped
                highlightOnHover
                verticalSpacing={3}
                style={{ minWidth: 1050 }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Time</Table.Th>
                    <Table.Th>Sensor</Table.Th>
                    <Table.Th>Metric</Table.Th>
                    <Table.Th>Value</Table.Th>
                    <Table.Th>Gateway</Table.Th>
                    <Table.Th>Assigned gateway</Table.Th>
                    <Table.Th>Decision</Table.Th>
                    <Table.Th>Reason</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {events.map(event => (
                    <Table.Tr key={event.id} title={event.sourceTopic}>
                      <Table.Td>{timeLabel(event.occurredAt)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>{event.sensorName ?? event.sensorUid}</Text>
                        {event.sensorName && <Text size="xs" c="dimmed">{event.sensorUid}</Text>}
                      </Table.Td>
                      <Table.Td>{event.metric}</Table.Td>
                      <Table.Td>{event.value}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>{event.gatewayId}</Text>
                        <Text size="xs" c={event.gatewayLocationName ? "dimmed" : "gray"}>
                          {event.gatewayLocationName ?? "[No location]"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>Primary: {event.assignedGatewayId ?? "—"}</Text>
                        <Text size="xs" c="dimmed">Backup: {event.backupGatewayId ?? "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={decisionColor(event.decision)} variant="light">
                          {event.decision}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{event.reason}</Text>
                        {event.dedupAgeMs !== null && (
                          <Text size="xs" c="dimmed">{event.dedupAgeMs} ms after first candidate</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {eventsQuery.isFetchingNextPage && (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Text size="xs" c="dimmed" ta="center">Loading older events…</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </div>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
