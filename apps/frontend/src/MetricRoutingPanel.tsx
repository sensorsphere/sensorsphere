import React from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
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
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import { NavigationIcon } from "./NavigationIcon";
import {
  clearMetricRoutingEvents,
  getMetricRoutingEvents,
  getMetricRoutingStatus,
  getMetricRoutingSummary
} from "./api";
import type { MetricRoutingDecision } from "./types";

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
  const [hours, setHours] = React.useState("1");
  const [paused, setPaused] = React.useState(false);
  const [decision, setDecision] = React.useState<string | null>(null);
  const [sensorUid, setSensorUid] = React.useState("");
  const [gatewayId, setGatewayId] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [metric, setMetric] = React.useState("");

  const statusQuery = useQuery({
    queryKey: ["metric-routing-status"],
    queryFn: getMetricRoutingStatus,
    refetchInterval: paused ? false : 5_000
  });

  const summaryQuery = useQuery({
    queryKey: ["metric-routing-summary", hours],
    queryFn: () => getMetricRoutingSummary(Number(hours)),
    refetchInterval: paused ? false : 2_000
  });

  const eventsQuery = useQuery({
    queryKey: [
      "metric-routing-events",
      hours,
      decision,
      sensorUid,
      gatewayId,
      location,
      metric
    ],
    queryFn: () => getMetricRoutingEvents({
      hours: Number(hours),
      decision: decision as MetricRoutingDecision | null,
      sensorUid,
      gatewayId,
      location,
      metric,
      limit: 500
    }),
    refetchInterval: paused ? false : 2_000
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
  const events = eventsQuery.data ?? [];

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
        <Group>
          <Badge
            size="lg"
            color={status?.mode === "active" ? "green" : status?.mode === "dry_run" ? "yellow" : "gray"}
          >
            {status?.mode === "dry_run" ? "DRY RUN" : (status?.mode ?? "UNKNOWN").toUpperCase()}
          </Badge>
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
          <Group align="flex-end" wrap="wrap">
            <SegmentedControl
              value={hours}
              onChange={setHours}
              data={[
                { value: "0.25", label: "15m" },
                { value: "1", label: "1h" },
                { value: "6", label: "6h" },
                { value: "24", label: "24h" },
                { value: "48", label: "48h" }
              ]}
            />
            <Select
              label="Decision"
              placeholder="All"
              clearable
              value={decision}
              onChange={setDecision}
              data={DECISIONS}
            />
            <TextInput label="Sensor" placeholder="UID" value={sensorUid} onChange={e => setSensorUid(e.currentTarget.value)} />
            <TextInput label="Gateway" placeholder="gateway_id" value={gatewayId} onChange={e => setGatewayId(e.currentTarget.value)} />
            <TextInput label="Location" placeholder="Location name" value={location} onChange={e => setLocation(e.currentTarget.value)} />
            <TextInput label="Metric" placeholder="temperature" value={metric} onChange={e => setMetric(e.currentTarget.value)} />
          </Group>

          {eventsQuery.isError ? (
            <Text c="red">Unable to load routing events.</Text>
          ) : (
            <Table.ScrollContainer minWidth={1050}>
              <Table striped highlightOnHover verticalSpacing="xs">
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
                      <Table.Td>{event.assignedGatewayId ?? "—"}</Table.Td>
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
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
