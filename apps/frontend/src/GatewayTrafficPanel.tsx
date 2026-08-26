import React from "react";

import { activeFilterStyles } from "./filterStyles";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  SegmentedControl,
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
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import {
  clearGatewayTrafficEvents,
  getGatewayTrafficEvents,
  getGatewayTrafficSummary
} from "./api";
import { usePersistentState } from "./preferences/usePersistentState";
import type { GatewayTrafficMessageType } from "./types";

const REFRESH_INTERVAL_MS = 2_000;
const TRAFFIC_TYPES: GatewayTrafficMessageType[] = ["METADATA", "SENSOR", "UNKNOWN"];

function trafficTypeColor(type: GatewayTrafficMessageType): string {
  if (type === "METADATA") return "violet";
  if (type === "SENSOR") return "blue";
  return "gray";
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export function GatewayTrafficPanel() {
  const queryClient = useQueryClient();
  const [hours, setHours] = usePersistentState("gatewayTraffic.period", "1");
  const [paused, setPaused] = React.useState(false);
  const [messageTypeFilter, setMessageTypeFilter] = usePersistentState("gatewayTraffic.messageTypes", "");
  const messageTypes = messageTypeFilter.split(",").map(value => value.trim()).filter(Boolean) as GatewayTrafficMessageType[];
  const [gatewayFilter, setGatewayFilter] = usePersistentState("gatewayTraffic.gateway", "");
  const [sensorFilter, setSensorFilter] = usePersistentState("gatewayTraffic.sensor", "");
  const [metricFilter, setMetricFilter] = usePersistentState("gatewayTraffic.metric", "");
  const [topicFilter, setTopicFilter] = usePersistentState("gatewayTraffic.topic", "");
  const [payloadFilter, setPayloadFilter] = usePersistentState("gatewayTraffic.payload", "");
  const [tableSortKey, setTableSortKey] = usePersistentState<string>("gatewayTraffic.tableSortKey", "time");
  const [tableSortDirection, setTableSortDirection] = usePersistentState<SortDirection>("gatewayTraffic.tableSortDirection", "desc");

  const summaryQuery = useQuery({
    queryKey: ["gateway-traffic-summary", hours],
    queryFn: () => getGatewayTrafficSummary(Number(hours)),
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS
  });

  const eventsQuery = useInfiniteQuery({
    queryKey: [
      "gateway-traffic-events",
      hours,
      messageTypeFilter,
      gatewayFilter,
      sensorFilter,
      metricFilter,
      topicFilter,
      payloadFilter
    ],
    initialPageParam: null as { occurredAt: string; id: number } | null,
    queryFn: ({ pageParam }) => getGatewayTrafficEvents({
      hours: Number(hours),
      limit: 500,
      messageType: messageTypeFilter,
      gatewayId: gatewayFilter,
      sensorUid: sensorFilter,
      metric: metricFilter,
      topic: topicFilter,
      payload: payloadFilter,
      beforeOccurredAt: pageParam?.occurredAt,
      beforeId: pageParam?.id
    }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS
  });

  const clearMutation = useMutation({
    mutationFn: clearGatewayTrafficEvents,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gateway-traffic-events"] }),
        queryClient.invalidateQueries({ queryKey: ["gateway-traffic-summary"] })
      ]);
    }
  });

  const events = eventsQuery.data?.pages.flatMap(page => page.events) ?? [];
  const sortedEvents = [...events].sort((left, right) => {
    const value = (event: (typeof events)[number]) => {
      switch (tableSortKey) {
        case "gateway": return event.gatewayId;
        case "type": return event.messageType;
        case "sensor": return event.sensorUid;
        case "metric": return event.metric;
        case "payload": return event.payload;
        case "topic": return event.sourceTopic;
        default: return new Date(event.occurredAt).getTime();
      }
    };
    return compareTableValues(value(left), value(right), tableSortDirection);
  });

  const toggleTableSort = (key: string): void => {
    if (tableSortKey === key) {
      setTableSortDirection(tableSortDirection === "asc" ? "desc" : "asc");
    } else {
      setTableSortKey(key);
      setTableSortDirection(key === "time" ? "desc" : "asc");
    }
  };

  const summary = summaryQuery.data;
  const filtersActive =
    messageTypes.length > 0 ||
    gatewayFilter.trim().length > 0 ||
    sensorFilter.trim().length > 0 ||
    metricFilter.trim().length > 0 ||
    topicFilter.trim().length > 0 ||
    payloadFilter.trim().length > 0;

  const resetFilters = (): void => {
    setMessageTypeFilter("");
    setGatewayFilter("");
    setSensorFilter("");
    setMetricFilter("");
    setTopicFilter("");
    setPayloadFilter("");
  };

  const filterValueStyle: React.CSSProperties = {
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3
  };

  const setOrAppendFilter = (current: string, value: string, append: boolean, setter: (value: string) => void): void => {
    if (!append) { setter(value); return; }
    const values = current.split(",").map(item => item.trim()).filter(Boolean);
    if (!values.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) values.push(value);
    setter(values.join(", "));
  };

  const setOrAppendType = (type: GatewayTrafficMessageType, append: boolean): void => {
    const next = append ? [...messageTypes] : [];
    if (!next.includes(type)) next.push(type);
    setMessageTypeFilter(next.join(","));
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Group gap="xs">
            <NavigationIcon page="gateways" size={24} />
            <Title order={2}>Gateway Traffic</Title>
          </Group>
          <Text c="dimmed">
            Raw gateway MQTT messages captured at ingestion entry, before routing and coverage processing.
          </Text>
        </div>
        <Group align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Text size="xs" fw={500}>Period</Text>
            <SegmentedControl
              size="xs"
              value={hours}
              onChange={setHours}
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
          </Stack>
          <Text size="sm" c="dimmed" pb={6}>Refresh: {REFRESH_INTERVAL_MS / 1000} s</Text>
          <Button variant="light" onClick={() => setPaused(value => !value)}>
            {paused ? "Resume live" : "Pause live"}
          </Button>
          <Button
            color="red"
            variant="light"
            loading={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Clear traffic
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 5 }}>
        {[
          { label: "Received", value: summary?.received ?? 0, color: "violet" },
          { label: "Metadata", value: summary?.metadata ?? 0, color: "grape" },
          { label: "Sensor", value: summary?.sensor ?? 0, color: "blue" },
          { label: "Unknown", value: summary?.unknown ?? 0, color: "orange" },
          { label: "Gateways", value: summary?.gateways ?? 0, color: "teal" }
        ].map(stat => (
          <Card key={stat.label} withBorder padding="sm" style={{ borderLeft: `4px solid var(--mantine-color-${stat.color}-6)` }}>
            <Badge size="xs" color={stat.color} variant="light">{stat.label}</Badge>
            <Text fw={700} size="xl" c={`${stat.color}.6`}>{stat.value}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }}>
            <TextInput
              label="Gateway"
              placeholder="gateway-01, gateway-02"
              value={gatewayFilter}
              onChange={event => setGatewayFilter(event.currentTarget.value)}
              styles={activeFilterStyles(gatewayFilter.trim().length > 0)}
              rightSection={gatewayFilter ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Reset Gateway filter" onClick={() => setGatewayFilter("")}>×</ActionIcon>
              ) : null}
            />
            <TextInput
              label="Sensor"
              placeholder="uid-1, uid-2"
              value={sensorFilter}
              onChange={event => setSensorFilter(event.currentTarget.value)}
              styles={activeFilterStyles(sensorFilter.trim().length > 0)}
              rightSection={sensorFilter ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Reset Sensor filter" onClick={() => setSensorFilter("")}>×</ActionIcon>
              ) : null}
            />
            <TextInput
              label="Metric"
              placeholder="rssi, temperature"
              value={metricFilter}
              onChange={event => setMetricFilter(event.currentTarget.value)}
              styles={activeFilterStyles(metricFilter.trim().length > 0)}
              rightSection={metricFilter ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Reset Metric filter" onClick={() => setMetricFilter("")}>×</ActionIcon>
              ) : null}
            />
            <TextInput
              label="Topic"
              placeholder="topic A, topic B"
              value={topicFilter}
              onChange={event => setTopicFilter(event.currentTarget.value)}
              styles={activeFilterStyles(topicFilter.trim().length > 0)}
              rightSection={topicFilter ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Reset Topic filter" onClick={() => setTopicFilter("")}>×</ActionIcon>
              ) : null}
            />
            <TextInput
              label="Payload"
              placeholder="value A, value B"
              value={payloadFilter}
              onChange={event => setPayloadFilter(event.currentTarget.value)}
              styles={activeFilterStyles(payloadFilter.trim().length > 0)}
              rightSection={payloadFilter ? (
                <ActionIcon size="sm" variant="subtle" aria-label="Reset Payload filter" onClick={() => setPayloadFilter("")}>×</ActionIcon>
              ) : null}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Type</Text>
              <Group gap={4} wrap="nowrap">
                <Menu withinPortal closeOnItemClick={false}>
                  <Menu.Target>
                    <Button variant="default" justify="flex-start" style={{ flex: 1 }} styles={{ root: messageTypes.length ? { border: "2px solid var(--mantine-color-blue-6)" } : undefined }}>
                      {messageTypes.length ? <Group gap={4}>{messageTypes.map(type => <Badge key={type} color={trafficTypeColor(type)} variant="light">{type}</Badge>)}</Group> : <Text size="sm" c="dimmed" fw={400}>All types</Text>}
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {TRAFFIC_TYPES.map(type => <Menu.Item key={type} leftSection={messageTypes.includes(type) ? "✓" : undefined} onClick={() => setMessageTypeFilter(messageTypes.includes(type) ? messageTypes.filter(value => value !== type).join(",") : [...messageTypes, type].join(","))}><Badge color={trafficTypeColor(type)} variant="light">{type}</Badge></Menu.Item>)}
                  </Menu.Dropdown>
                </Menu>
                {messageTypes.length > 0 && <ActionIcon variant="subtle" aria-label="Reset Type filter" onClick={() => setMessageTypeFilter("")}>×</ActionIcon>}
              </Group>
            </Stack>
          </SimpleGrid>

          <Group justify="space-between" wrap="wrap">
            <Group>
              <ResetFiltersAction active={filtersActive} onReset={resetFilters} />
              <Text size="xs" c="dimmed">
                Loaded {events.length} events
                {eventsQuery.hasNextPage ? " · scroll down to load older events" : ""}
                {" · Ctrl/Cmd+click a table value to add an OR filter"}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Captured before Gateway Coverage and Metric Routing processing
            </Text>
          </Group>

          {eventsQuery.isError ? (
            <Text c="red">Unable to load gateway traffic.</Text>
          ) : (
            <div
              className="metric-routing-table-scroll"
              onScroll={event => {
                const target = event.currentTarget;
                const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
                if (
                  remaining < 240 &&
                  eventsQuery.hasNextPage &&
                  !eventsQuery.isFetchingNextPage
                ) {
                  void eventsQuery.fetchNextPage();
                }
              }}
            >
              <Table striped highlightOnHover verticalSpacing={3} style={{ minWidth: 1180 }}>
                <Table.Thead>
                  <Table.Tr>
                    {[["time", "Time"], ["gateway", "Gateway"], ["type", "Type"], ["sensor", "Sensor"], ["metric", "Metric"], ["payload", "Payload"], ["topic", "Topic"]].map(([key, label]) => (
                      <SortableTableHeader key={key} active={tableSortKey === key} direction={tableSortDirection} onClick={() => toggleTableSort(key)}>
                        {label}
                      </SortableTableHeader>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedEvents.map(event => (
                    <Table.Tr key={event.id}>
                      <Table.Td>{timeLabel(event.occurredAt)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} style={event.gatewayId ? filterValueStyle : undefined} onClick={click => event.gatewayId && setOrAppendFilter(gatewayFilter, event.gatewayId, click.ctrlKey || click.metaKey, setGatewayFilter)}>{event.gatewayId ?? "—"}</Text>
                        {event.gatewayLocationName && (
                          <Text size="xs" c="blue">{event.gatewayLocationName}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={trafficTypeColor(event.messageType)}
                          variant="light"
                          style={filterValueStyle}
                          onClick={click => setOrAppendType(event.messageType, click.ctrlKey || click.metaKey)}
                        >
                          {event.messageType}
                        </Badge>
                      </Table.Td>
                      <Table.Td><Text size="sm" style={event.sensorUid ? filterValueStyle : undefined} onClick={click => event.sensorUid && setOrAppendFilter(sensorFilter, event.sensorUid, click.ctrlKey || click.metaKey, setSensorFilter)}>{event.sensorUid ?? "—"}</Text></Table.Td>
                      <Table.Td><Text size="sm" style={event.metric ? filterValueStyle : undefined} onClick={click => event.metric && setOrAppendFilter(metricFilter, event.metric, click.ctrlKey || click.metaKey, setMetricFilter)}>{event.metric ?? "—"}</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace" lineClamp={2} style={filterValueStyle} onClick={click => setOrAppendFilter(payloadFilter, event.payload, click.ctrlKey || click.metaKey, setPayloadFilter)}>{event.payload}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace" style={filterValueStyle} onClick={click => setOrAppendFilter(topicFilter, event.sourceTopic, click.ctrlKey || click.metaKey, setTopicFilter)}>{event.sourceTopic}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {eventsQuery.isFetchingNextPage && (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
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
