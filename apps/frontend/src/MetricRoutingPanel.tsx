import React from "react";

import { activeFilterStyles } from "./filterStyles";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  SegmentedControl,
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
import { LocationIcon, getLocationIconName } from "./LocationIcon";
import { LocationOptionContent, LocationScopeToggle, locationIdsForScope, sortLocationsHierarchically } from "./LocationFilterControls";
import { GatewayTrafficPanel } from "./GatewayTrafficPanel";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
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
  const [view, setView] = usePersistentState<"routing" | "traffic">(
    "metricRouting.view",
    "routing"
  );
  const [hours, setHours] = usePersistentState("metricRouting.period", "1");
  const [paused, setPaused] = React.useState(false);
  const [hiddenDecisions, setHiddenDecisions] = usePersistentState<MetricRoutingDecision[]>(
    "metricRouting.hiddenDecisions",
    []
  );
  const [sensorFilter, setSensorFilter] = usePersistentState("metricRouting.sensor", "");
  const [gatewayFilter, setGatewayFilter] = usePersistentState("metricRouting.gateway", "");
  const [locationId, setLocationId] = usePersistentState<string | null>("metricRouting.location", null);
  const [includeLocationDescendants, setIncludeLocationDescendants] = usePersistentState<boolean>(
    "filters.locationIncludeDescendants", true, (value): value is boolean => typeof value === "boolean"
  );
  const [metricFilter, setMetricFilter] = usePersistentState("metricRouting.metric", "");
  const [assignedGatewayFilter, setAssignedGatewayFilter] = usePersistentState("metricRouting.assignedGateway", "");
  const [reasonFilter, setReasonFilter] = usePersistentState("metricRouting.reason", "");
  const [decisionFilter, setDecisionFilter] = usePersistentState("metricRouting.decisions", "");
  const decisionFilters = decisionFilter.split(",").map(value => value.trim()).filter(Boolean) as MetricRoutingDecision[];
  const [tableSortKey, setTableSortKey] = usePersistentState<string>("metricRouting.tableSortKey", "time");
  const [tableSortDirection, setTableSortDirection] = usePersistentState<SortDirection>("metricRouting.tableSortDirection", "desc");

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
      "metric-routing-events", hours, sensorFilter, gatewayFilter, locationId, includeLocationDescendants, metricFilter,
      assignedGatewayFilter, reasonFilter, decisionFilter
    ],
    initialPageParam: null as { occurredAt: string; id: number } | null,
    queryFn: ({ pageParam }) => getMetricRoutingEvents({
      hours: Number(hours),
      limit: 500,
      sensorUid: sensorFilter,
      gatewayId: gatewayFilter,
      location: locationId && !includeLocationDescendants ? locationId : undefined,
      metric: metricFilter,
      assignedGatewayId: assignedGatewayFilter,
      reason: reasonFilter,
      decision: decisionFilter,
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

  const locationsById = new Map((locationsQuery.data ?? []).map(location => [location.id, location]));
  const locationScopeIds = locationIdsForScope(locationsQuery.data ?? [], locationId, includeLocationDescendants);

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

  const loadedEvents =
    eventsQuery.data?.pages.flatMap(page => page.events) ?? [];

  const events = loadedEvents.filter(event =>
    !hiddenDecisions.includes(event.decision) &&
    (
      locationId === null ||
      !includeLocationDescendants ||
      Boolean(event.gatewayLocationId && locationScopeIds?.has(event.gatewayLocationId))
    )
  );

  const sortedEvents = [...events].sort((left, right) => {
    const value = (event: (typeof events)[number]) => {
      switch (tableSortKey) {
        case "sensor": return event.sensorName ?? event.sensorUid;
        case "metric": return event.metric;
        case "value": return event.value;
        case "gateway": return event.gatewayId;
        case "assigned": return event.assignedGatewayId;
        case "decision": return event.decision;
        case "reason": return event.reason;
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

  const locationOptions = sortLocationsHierarchically(locationsQuery.data ?? [])
    .map(location => ({
      value: location.id,
      label: location.name
    }));

  const filtersActive =
    hiddenDecisions.length > 0 ||
    sensorFilter.trim().length > 0 ||
    gatewayFilter.trim().length > 0 ||
    locationId !== null ||
    metricFilter.trim().length > 0 ||
    assignedGatewayFilter.trim().length > 0 ||
    reasonFilter.trim().length > 0 ||
    decisionFilters.length > 0;

  const resetFilters = (): void => {
    setHiddenDecisions([]);
    setSensorFilter("");
    setGatewayFilter("");
    setLocationId(null);
    setMetricFilter("");
    setAssignedGatewayFilter("");
    setReasonFilter("");
    setDecisionFilter("");
  };

  const filterValueStyle: React.CSSProperties = {
    cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3
  };

  const setOrAppendFilter = (current: string, value: string, append: boolean, setter: (value: string) => void): void => {
    if (!append) { setter(value); return; }
    const values = current.split(",").map(item => item.trim()).filter(Boolean);
    if (!values.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) values.push(value);
    setter(values.join(", "));
  };

  const setOrAppendDecision = (decision: MetricRoutingDecision, append: boolean): void => {
    const next = append ? [...decisionFilters] : [];
    if (!next.includes(decision)) next.push(decision);
    setDecisionFilter(next.join(","));
  };

  if (view === "traffic") {
    return (
      <Stack gap="lg" className="metric-routing-panel metric-routing-traffic-panel">
        <SegmentedControl
          className="metric-routing-tabs"
          value={view}
          onChange={value => setView(value as "routing" | "traffic")}
          data={[
            { value: "routing", label: "Routing decisions" },
            { value: "traffic", label: "Gateway Traffic" }
          ]}
          style={{ alignSelf: "flex-start" }}
        />
        <GatewayTrafficPanel />
      </Stack>
    );
  }

  return (
    <Stack gap="lg" className="metric-routing-panel">
      <SegmentedControl
        className="metric-routing-tabs"
        value={view}
        onChange={value => setView(value as "routing" | "traffic")}
        data={[
          { value: "routing", label: "Routing decisions" },
          { value: "traffic", label: "Gateway Traffic" }
        ]}
        style={{ alignSelf: "flex-start" }}
      />
      <Group className="metric-routing-header" justify="space-between" align="flex-end">
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
          {status?.mode === "dry_run" && (
            <Badge size="lg" color="yellow">
              DRY RUN
            </Badge>
          )}
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

      {status?.mode === "dry_run" && (
        <Alert className="metric-routing-mode-alert" color="yellow" title="Dry-run mode">
          Decisions are logged only. Gateway-qualified metrics do not modify normal measurements.
        </Alert>
      )}

      <SimpleGrid className="metric-routing-kpis" cols={{ base: 2, md: 5 }}>
        {[
          { label: "Received", value: summary?.received ?? 0, color: "violet" },
          { label: status?.mode === "active" ? "Accepted" : "Would accept", value: summary?.accepted ?? 0, color: "green" },
          { label: status?.mode === "active" ? "Ignored" : "Would ignore", value: summary?.ignored ?? 0, color: "orange" },
          { label: "Duplicates", value: summary?.deduplicated ?? 0, color: "blue" },
          { label: "Errors", value: summary?.errors ?? 0, color: "red" }
        ].map(stat => (
          <Card key={stat.label} withBorder padding="sm" style={{ borderLeft: `4px solid var(--mantine-color-${stat.color}-6)` }}>
            <Badge size="xs" color={stat.color} variant="light">{stat.label}</Badge>
            <Text fw={700} size="xl" c={`${stat.color}.6`}>{stat.value}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder padding="md" className="metric-routing-card">
        <Stack gap="sm" className="metric-routing-card-stack">
          <Group align="flex-end" wrap="nowrap">
            <ResetFiltersAction active={filtersActive} onReset={resetFilters} />
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} style={{ flex: 1 }}>
            <TextInput
              label="Sensor"
              placeholder="Name/UID A, Name/UID B"
              value={sensorFilter}
              onChange={e => setSensorFilter(e.currentTarget.value)}
              styles={activeFilterStyles(sensorFilter.trim().length > 0)}
              rightSection={sensorFilter ? <ActionIcon size="sm" variant="subtle" onClick={() => setSensorFilter("")}>×</ActionIcon> : null}
            />
            <TextInput
              label="Gateway"
              placeholder="gateway-01, gateway-02"
              value={gatewayFilter}
              onChange={e => setGatewayFilter(e.currentTarget.value)}
              styles={activeFilterStyles(gatewayFilter.trim().length > 0)}
              rightSection={gatewayFilter ? <ActionIcon size="sm" variant="subtle" onClick={() => setGatewayFilter("")}>×</ActionIcon> : null}
            />
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <Select
                label="Location"
                placeholder="All locations"
                clearable
                searchable
                value={locationId}
                onChange={setLocationId}
                data={locationOptions}
                leftSection={locationId ? <LocationIcon name={getLocationIconName(locationsById.get(locationId))} size={16} /> : null}
                renderOption={({ option }) => <LocationOptionContent location={locationsById.get(option.value)} label={option.label} locations={locations} />}
                styles={activeFilterStyles(locationId !== null)}
                style={{ flex: 1 }}
              />
              <LocationScopeToggle active={includeLocationDescendants} onChange={setIncludeLocationDescendants} />
            </Group>
            <TextInput
              label="Metric"
              placeholder="temperature, humidity"
              value={metricFilter}
              onChange={e => setMetricFilter(e.currentTarget.value)}
              styles={activeFilterStyles(metricFilter.trim().length > 0)}
              rightSection={metricFilter ? <ActionIcon size="sm" variant="subtle" onClick={() => setMetricFilter("")}>×</ActionIcon> : null}
            />
            </SimpleGrid>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            <TextInput label="Assigned gateway" placeholder="gateway-01, gateway-02" value={assignedGatewayFilter} onChange={e => setAssignedGatewayFilter(e.currentTarget.value)} styles={activeFilterStyles(assignedGatewayFilter.trim().length > 0)} rightSection={assignedGatewayFilter ? <ActionIcon size="sm" variant="subtle" onClick={() => setAssignedGatewayFilter("")}>×</ActionIcon> : null} />
            <TextInput label="Reason" placeholder="assigned_primary, backup_failover" value={reasonFilter} onChange={e => setReasonFilter(e.currentTarget.value)} styles={activeFilterStyles(reasonFilter.trim().length > 0)} rightSection={reasonFilter ? <ActionIcon size="sm" variant="subtle" onClick={() => setReasonFilter("")}>×</ActionIcon> : null} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>Decision</Text>
              <Group gap={4} wrap="nowrap">
                <Menu withinPortal closeOnItemClick={false}>
                  <Menu.Target><Button variant="light" justify="flex-start" style={{ flex: 1 }} styles={{ root: decisionFilters.length ? { border: "2px solid var(--mantine-color-blue-6)" } : undefined }}>{decisionFilters.length ? <Group gap={4}>{decisionFilters.map(value => <Badge key={value} color={decisionColor(value)} variant="light">{value}</Badge>)}</Group> : <Text size="sm" c="dimmed" fw={400}>All decisions</Text>}</Button></Menu.Target>
                  color="gray"
                  <Menu.Dropdown>{DECISIONS.map(value => <Menu.Item key={value} leftSection={decisionFilters.includes(value) ? "✓" : undefined} onClick={() => setDecisionFilter(decisionFilters.includes(value) ? decisionFilters.filter(item => item !== value).join(",") : [...decisionFilters, value].join(","))}><Badge color={decisionColor(value)} variant="light">{value}</Badge></Menu.Item>)}</Menu.Dropdown>
                </Menu>
                {decisionFilters.length > 0 && <ActionIcon variant="subtle" onClick={() => setDecisionFilter("")}>×</ActionIcon>}
              </Group>
            </Stack>
          </SimpleGrid>

          <Group align="flex-end" wrap="wrap">
            <Stack gap={4} w={360}>
              <Text size="sm" fw={500}>Hide decisions</Text>
              <Menu closeOnItemClick={false} withinPortal>
                <Menu.Target>
                  <Button
                    variant="light"
                    color="gray"
                    justify="flex-start"
                    styles={{
                      root: {
                        minHeight: 36,
                        height: "auto",
                        paddingTop: 5,
                        paddingBottom: 5,
                        ...(hiddenDecisions.length > 0
                          ? { border: "2px solid var(--mantine-color-blue-6)" }
                          : {})
                      },
                      label: {
                        width: "100%",
                        overflow: "visible"
                      }
                    }}
                  >
                    {hiddenDecisions.length === 0 ? (
                      <Text size="sm" c="dimmed" fw={400}>None hidden</Text>
                    ) : (
                      <Group gap={4} wrap="wrap">
                        {hiddenDecisions.map(decision => (
                          <Badge
                            key={decision}
                            size="sm"
                            color={decisionColor(decision)}
                            variant="light"
                          >
                            {decision}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {DECISIONS.map(decision => {
                    const selected = hiddenDecisions.includes(decision);
                    return (
                      <Menu.Item
                        key={decision}
                        onClick={() =>
                          setHiddenDecisions(
                            selected
                              ? hiddenDecisions.filter(value => value !== decision)
                              : [...hiddenDecisions, decision]
                          )
                        }
                        leftSection={selected ? "✓" : undefined}
                      >
                        <Badge
                          size="sm"
                          color={decisionColor(decision)}
                          variant="light"
                        >
                          {decision}
                        </Badge>
                      </Menu.Item>
                    );
                  })}
                  {hiddenDecisions.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Item onClick={() => setHiddenDecisions([])}>Clear selection</Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Stack>
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
            <Text size="xs" c="dimmed">
              Loaded {loadedEvents.length} / {summary?.received ?? 0} events for selected period
              {eventsQuery.hasNextPage ? " · scroll down to load older events" : ""}
              {" · Ctrl/Cmd+click a table value to add an OR filter"}
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
                    {[["time", "Time"], ["sensor", "Sensor"], ["metric", "Metric"], ["value", "Value"], ["gateway", "Gateway"], ["assigned", "Assigned gateway"], ["decision", "Decision"], ["reason", "Reason"]].map(([key, label]) => (
                      <SortableTableHeader key={key} active={tableSortKey === key} direction={tableSortDirection} onClick={() => toggleTableSort(key)}>
                        {label}
                      </SortableTableHeader>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedEvents.map(event => (
                    <Table.Tr key={event.id} title={event.sourceTopic}>
                      <Table.Td>{timeLabel(event.occurredAt)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} style={filterValueStyle} onClick={click => setOrAppendFilter(sensorFilter, event.sensorUid, click.ctrlKey || click.metaKey, setSensorFilter)}>{event.sensorName ?? event.sensorUid}</Text>
                        {event.sensorName && <Text size="xs" c="dimmed">{event.sensorUid}</Text>}
                      </Table.Td>
                      <Table.Td><Text size="sm" style={filterValueStyle} onClick={click => setOrAppendFilter(metricFilter, event.metric, click.ctrlKey || click.metaKey, setMetricFilter)}>{event.metric}</Text></Table.Td>
                      <Table.Td>{event.value}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} style={filterValueStyle} onClick={click => setOrAppendFilter(gatewayFilter, event.gatewayId, click.ctrlKey || click.metaKey, setGatewayFilter)}>{event.gatewayId}</Text>
                        <Text size="xs" c={event.gatewayLocationName ? "blue" : "gray"} style={event.gatewayLocationName ? filterValueStyle : undefined} onClick={() => event.gatewayLocationId && setLocationId(event.gatewayLocationId)}>
                          {event.gatewayLocationName ?? "[No location]"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} style={event.assignedGatewayId ? filterValueStyle : undefined} onClick={click => event.assignedGatewayId && setOrAppendFilter(assignedGatewayFilter, event.assignedGatewayId, click.ctrlKey || click.metaKey, setAssignedGatewayFilter)}>Primary: {event.assignedGatewayId ?? "—"}</Text>
                        <Text size="xs" c="dimmed" style={event.backupGatewayId ? filterValueStyle : undefined} onClick={click => event.backupGatewayId && setOrAppendFilter(assignedGatewayFilter, event.backupGatewayId, click.ctrlKey || click.metaKey, setAssignedGatewayFilter)}>Backup: {event.backupGatewayId ?? "—"}</Text>
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
