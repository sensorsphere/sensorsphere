import React from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { getDatabaseStorageReport } from "./api";
import { NavigationIcon } from "./NavigationIcon";
import type {
  DatabaseStoragePolicy,
  DatabaseStorageRecommendation,
  DatabaseStorageRelation
} from "./types";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const digits = index <= 1 ? 0 : amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[index]}`;
}

function formatRows(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function indexRatio(relation: DatabaseStorageRelation): string {
  if (relation.dataBytes <= 0) return "—";
  return `${Math.round((relation.indexBytes / relation.dataBytes) * 100)}%`;
}

function retentionLabel(policy: DatabaseStoragePolicy): string {
  const config = policy.config ?? {};
  const dropAfter = config.drop_after;
  if (typeof dropAfter === "string") return dropAfter;
  if (policy.kind === "continuous_aggregate_refresh") {
    const startOffset = config.start_offset;
    const endOffset = config.end_offset;
    if (typeof startOffset === "string" || typeof endOffset === "string") {
      return `${String(startOffset ?? "—")} → ${String(endOffset ?? "—")}`;
    }
  }
  return "Configured";
}

function recommendationColor(level: DatabaseStorageRecommendation["level"]): string {
  if (level === "WARNING") return "red";
  if (level === "REVIEW") return "orange";
  return "blue";
}

function relationTypeColor(kind: DatabaseStorageRelation["kind"]): string {
  if (kind === "hypertable") return "violet";
  if (kind === "materialized") return "cyan";
  return "gray";
}

export function DatabaseStoragePanel() {
  const reportQuery = useQuery({
    queryKey: ["database-storage-report"],
    queryFn: getDatabaseStorageReport,
    staleTime: 30_000
  });

  const report = reportQuery.data;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="start">
        <div>
          <Group gap="xs">
            <NavigationIcon page="database-storage" size={24} />
            <Title order={2}>Database Storage & Retention</Title>
            <Badge color="green" variant="light">READ ONLY</Badge>
          </Group>
          <Text c="dimmed">
            Inspect database size, Timescale chunks, indexes and effective retention without changing data.
          </Text>
        </div>
        <Stack gap={4} align="flex-end">
          <Button
            variant="light"
            loading={reportQuery.isFetching}
            onClick={() => void reportQuery.refetch()}
          >
            Refresh
          </Button>
          {report && (
            <Text size="xs" c="dimmed">
              Generated {new Date(report.generatedAt).toLocaleString()}
            </Text>
          )}
        </Stack>
      </Group>

      {reportQuery.isError && (
        <Alert color="red" title="Database storage report unavailable">
          {reportQuery.error instanceof Error
            ? reportQuery.error.message
            : "Unable to load database storage report."}
        </Alert>
      )}

      {!report && reportQuery.isLoading && (
        <Text c="dimmed">Loading database storage report…</Text>
      )}

      {report && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            {[
              ["Database", report.summary.databaseBytes, "blue"],
              ["Allocated relations", report.summary.allocatedRelationBytes, "cyan"],
              ["Table data", report.summary.dataBytes, "green"],
              ["Indexes", report.summary.indexBytes, "orange"]
            ].map(([label, value, color]) => (
              <Card
                key={String(label)}
                withBorder
                padding="sm"
                style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
              >
                <Text size="xs" c="dimmed">{String(label)}</Text>
                <Text fw={700} size="xl">{formatBytes(Number(value))}</Text>
              </Card>
            ))}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Relations</Text>
              <Text fw={700} size="lg">{report.summary.relationCount}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Hypertables</Text>
              <Text fw={700} size="lg">{report.summary.hypertableCount}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Timescale chunks</Text>
              <Text fw={700} size="lg">{report.summary.chunkCount}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Text size="xs" c="dimmed">Other / TOAST</Text>
              <Text fw={700} size="lg">{formatBytes(report.summary.toastBytes)}</Text>
            </Card>
          </SimpleGrid>

          {report.recommendations.length > 0 && (
            <Card withBorder>
              <Stack gap="xs">
                <Text fw={600}>Recommendations</Text>
                {report.recommendations.map((item, index) => (
                  <Alert
                    key={`${item.code}:${item.relation ?? "global"}:${index}`}
                    color={recommendationColor(item.level)}
                    title={`${item.level}${item.relation ? ` · ${item.relation}` : ""}`}
                    variant="light"
                  >
                    {item.message}
                  </Alert>
                ))}
              </Stack>
            </Card>
          )}

          <Tabs defaultValue="consumers">
            <Tabs.List>
              <Tabs.Tab value="consumers">Top consumers</Tabs.Tab>
              <Tabs.Tab value="timescale">Timescale / chunks</Tabs.Tab>
              <Tabs.Tab value="indexes">Indexes</Tabs.Tab>
              <Tabs.Tab value="retention">Retention</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="consumers" pt="md">
              <Card withBorder p={0}>
                <ScrollArea>
                  <Table
                    striped
                    highlightOnHover
                    verticalSpacing="xs"
                    style={{ minWidth: 1250 }}
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Relation</Table.Th>
                        <Table.Th>Category</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th ta="right">Total</Table.Th>
                        <Table.Th ta="right">Data</Table.Th>
                        <Table.Th ta="right">Indexes</Table.Th>
                        <Table.Th ta="right">Index/Data</Table.Th>
                        <Table.Th ta="right">Live rows</Table.Th>
                        <Table.Th ta="right">Dead rows</Table.Th>
                        <Table.Th>Retention</Table.Th>
                        <Table.Th>Compression</Table.Th>
                        <Table.Th>Oldest / newest</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {report.relations.map(relation => (
                        <Table.Tr key={`${relation.schema}.${relation.name}`}>
                          <Table.Td>
                            <Text size="sm" fw={600}>{relation.name}</Text>
                            <Text size="xs" c="dimmed">{relation.schema}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="sm" variant="light">{relation.category}</Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              size="sm"
                              variant="light"
                              color={relationTypeColor(relation.kind)}
                            >
                              {relation.kind}
                            </Badge>
                          </Table.Td>
                          <Table.Td ta="right">{formatBytes(relation.totalBytes)}</Table.Td>
                          <Table.Td ta="right">{formatBytes(relation.dataBytes)}</Table.Td>
                          <Table.Td ta="right">{formatBytes(relation.indexBytes)}</Table.Td>
                          <Table.Td ta="right">{indexRatio(relation)}</Table.Td>
                          <Table.Td ta="right">{formatRows(relation.liveRows)}</Table.Td>
                          <Table.Td ta="right">{formatRows(relation.deadRows)}</Table.Td>
                          <Table.Td>{relation.retention ?? "Not detected"}</Table.Td>
                          <Table.Td>
                            {relation.compressionEnabled === null
                              ? "N/A"
                              : relation.compressionEnabled
                                ? <Badge color="green">Enabled</Badge>
                                : <Badge color="orange" variant="light">Disabled</Badge>}
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs">{formatTimestamp(relation.oldestAt)}</Text>
                            <Text size="xs" c="dimmed">{formatTimestamp(relation.newestAt)}</Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="timescale" pt="md">
              <Stack gap="md">
                <Card withBorder>
                  <Text fw={600} mb="xs">Continuous aggregates</Text>
                  {report.continuousAggregates.length === 0 ? (
                    <Text size="sm" c="dimmed">No continuous aggregates detected.</Text>
                  ) : (
                    report.continuousAggregates.map(item => (
                      <Group key={`${item.viewSchema}.${item.viewName}`} justify="space-between">
                        <div>
                          <Text size="sm" fw={600}>{item.viewSchema}.{item.viewName}</Text>
                          <Text size="xs" c="dimmed">
                            Materialization: {item.materializationSchema}.{item.materializationName}
                          </Text>
                        </div>
                        <Badge variant="light">
                          {item.materializedOnly ? "materialized only" : "realtime"}
                        </Badge>
                      </Group>
                    ))
                  )}
                </Card>

                <Card withBorder p={0}>
                  <ScrollArea>
                    <Table striped highlightOnHover verticalSpacing="xs" style={{ minWidth: 1050 }}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Hypertable</Table.Th>
                          <Table.Th>Chunk</Table.Th>
                          <Table.Th>Range</Table.Th>
                          <Table.Th ta="right">Total</Table.Th>
                          <Table.Th ta="right">Data</Table.Th>
                          <Table.Th ta="right">Indexes</Table.Th>
                          <Table.Th>Compressed</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {report.chunks.map(chunk => (
                          <Table.Tr key={`${chunk.chunkSchema}.${chunk.chunkName}`}>
                            <Table.Td>{chunk.hypertableName}</Table.Td>
                            <Table.Td>
                              <Text size="xs">{chunk.chunkName}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs">{formatTimestamp(chunk.rangeStart)}</Text>
                              <Text size="xs" c="dimmed">{formatTimestamp(chunk.rangeEnd)}</Text>
                            </Table.Td>
                            <Table.Td ta="right">{formatBytes(chunk.totalBytes)}</Table.Td>
                            <Table.Td ta="right">{formatBytes(chunk.dataBytes)}</Table.Td>
                            <Table.Td ta="right">{formatBytes(chunk.indexBytes)}</Table.Td>
                            <Table.Td>
                              <Badge color={chunk.compressed ? "green" : "gray"} variant="light">
                                {chunk.compressed ? "Yes" : "No"}
                              </Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Card>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="indexes" pt="md">
              <Alert color="blue" mb="md" title="Usage counters are observational">
                Low or zero scan counts are review signals only. DB-1 never marks an index safe to remove automatically.
              </Alert>
              <Card withBorder p={0}>
                <ScrollArea>
                  <Table striped highlightOnHover verticalSpacing="xs" style={{ minWidth: 1100 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Logical relation</Table.Th>
                        <Table.Th>Physical relation</Table.Th>
                        <Table.Th>Index</Table.Th>
                        <Table.Th ta="right">Size</Table.Th>
                        <Table.Th ta="right">Scans</Table.Th>
                        <Table.Th>Unique</Table.Th>
                        <Table.Th>Definition</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {report.indexes.map(index => (
                        <Table.Tr key={`${index.schema}.${index.relation}.${index.indexName}`}>
                          <Table.Td>{index.logicalRelation}</Table.Td>
                          <Table.Td><Text size="xs">{index.schema}.{index.relation}</Text></Table.Td>
                          <Table.Td><Text size="xs" fw={600}>{index.indexName}</Text></Table.Td>
                          <Table.Td ta="right">{formatBytes(index.indexBytes)}</Table.Td>
                          <Table.Td ta="right">{new Intl.NumberFormat().format(index.scans)}</Table.Td>
                          <Table.Td>{index.unique ? "Yes" : "No"}</Table.Td>
                          <Table.Td>
                            <Text size="xs" lineClamp={2}>{index.definition ?? "—"}</Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="retention" pt="md">
              <Stack gap="md">
                <Alert color="green" title="Diagnostic only">
                  These policies are reported from the current database/runtime. This page cannot change or apply retention.
                </Alert>
                <Card withBorder p={0}>
                  <Table striped highlightOnHover verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Kind</Table.Th>
                        <Table.Th>Relation</Table.Th>
                        <Table.Th>Policy/window</Table.Th>
                        <Table.Th>Schedule</Table.Th>
                        <Table.Th>Job</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {report.policies.map(policy => (
                        <Table.Tr key={policy.jobId}>
                          <Table.Td>
                            <Badge variant="light">{policy.kind}</Badge>
                          </Table.Td>
                          <Table.Td>
                            {policy.relationName
                              ? `${policy.relationSchema ?? "public"}.${policy.relationName}`
                              : "Internal / aggregate"}
                          </Table.Td>
                          <Table.Td>{retentionLabel(policy)}</Table.Td>
                          <Table.Td>{policy.scheduleInterval}</Table.Td>
                          <Table.Td>{policy.jobId}</Table.Td>
                        </Table.Tr>
                      ))}
                      <Table.Tr>
                        <Table.Td><Badge variant="light">application retention</Badge></Table.Td>
                        <Table.Td>public.gateway_traffic_events</Table.Td>
                        <Table.Td>48 hours</Table.Td>
                        <Table.Td>hourly</Table.Td>
                        <Table.Td>ingestion service</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td><Badge variant="light">application retention</Badge></Table.Td>
                        <Table.Td>public.metric_routing_events</Table.Td>
                        <Table.Td>48 hours</Table.Td>
                        <Table.Td>hourly</Table.Td>
                        <Table.Td>ingestion service</Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Card>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Stack>
  );
}
