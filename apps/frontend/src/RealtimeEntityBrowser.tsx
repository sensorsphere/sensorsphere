import React from "react";

import {
  Badge,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core";

import { useQuery } from "@tanstack/react-query";

import { getRealtimeEntities } from "./api";
import type { RealtimeEntityRecord } from "./types";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";


type EntitySortKey = "device" | "entity" | "type" | "state" | "unit" | "provider" | "controllable" | "updated";

function stateLabel(entity: RealtimeEntityRecord): string {
  if (entity.currentValue === true) return "ON";
  if (entity.currentValue === false) return "OFF";
  if (entity.currentValue == null) return "UNKNOWN";
  const value = String(entity.currentValue);
  return entity.unit ? `${value} ${entity.unit}` : value || "—";
}

function stateColor(entity: RealtimeEntityRecord): string {
  if (entity.currentValue === true) return "green";
  if (entity.currentValue === false) return "gray";
  return entity.currentValue == null ? "yellow" : "blue";
}

function compactDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function RealtimeEntityBrowser() {
  const entitiesQuery = useQuery({
    queryKey: ["device-control", "realtime-entities"],
    queryFn: getRealtimeEntities,
    refetchInterval: 1000
  });

  const [sortKey, setSortKey] = usePersistentState<EntitySortKey>("realtime-entities.sort.key", "device");
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>("realtime-entities.sort.direction", "asc");
  const [deviceFilter, setDeviceFilter] = usePersistentState("realtime-entities.filter.device", "");
  const [entityFilter, setEntityFilter] = usePersistentState("realtime-entities.filter.entity", "");
  const [typeFilter, setTypeFilter] = usePersistentState<string | null>("realtime-entities.filter.type", null);
  const [stateFilter, setStateFilter] = usePersistentState("realtime-entities.filter.state", "");
  const [unitFilter, setUnitFilter] = usePersistentState("realtime-entities.filter.unit", "");
  const [providerFilter, setProviderFilter] = usePersistentState<string | null>("realtime-entities.filter.provider", null);
  const [controllableFilter, setControllableFilter] = usePersistentState<string | null>("realtime-entities.filter.controllable", null);

  const entities = entitiesQuery.data ?? [];
  const includes = (value: string, filter: string) => !filter.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
  const typeOptions = Array.from(new Set(entities.map(entity => entity.entityType).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map(value => ({ value, label: value.replaceAll("_", " ").toUpperCase() }));
  const providerOptions = Array.from(new Set(entities.map(entity => entity.provider).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map(value => ({ value, label: value }));

  const filtered = entities.filter(entity =>
    includes(entity.deviceName, deviceFilter)
    && includes(`${entity.entityName} ${entity.entityValue}`, entityFilter)
    && (!typeFilter || entity.entityType === typeFilter)
    && includes(stateLabel(entity), stateFilter)
    && includes(entity.unit ?? "", unitFilter)
    && (!providerFilter || entity.provider === providerFilter)
    && (!controllableFilter || (controllableFilter === "actionable" ? entity.controllable : !entity.controllable))
  ).sort((left, right) => {
    const value = (entity: RealtimeEntityRecord): string | number | boolean | null => sortKey === "device" ? entity.deviceName
      : sortKey === "entity" ? `${entity.entityName} ${entity.entityValue}`
      : sortKey === "type" ? entity.entityType
      : sortKey === "state" ? stateLabel(entity)
      : sortKey === "unit" ? entity.unit
      : sortKey === "provider" ? entity.provider
      : sortKey === "controllable" ? entity.controllable
      : new Date(entity.observedAt).getTime();
    return compareTableValues(value(left), value(right), sortDirection);
  });

  const toggleSort = (key: EntitySortKey) => {
    if (sortKey === key) setSortDirection(current => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const liveDevices = new Set(entities.filter(entity => entity.connected).map(entity => entity.deviceId)).size;
  const totalDevices = new Set(entities.map(entity => entity.deviceId)).size;
  const actionableCount = entities.filter(entity => entity.controllable).length;

  return (
    <Stack gap="sm" style={{ minHeight: 0 }}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>Realtime Entity Browser</Text>
          <Text size="xs" c="dimmed">Provider-neutral live entity inventory for Device Control and future dashboard widgets.</Text>
        </div>
        <Group gap="xs">
          <Badge variant="light" color="green">{liveDevices}/{totalDevices} devices live</Badge>
          <Badge variant="light" color="blue">{actionableCount}/{entities.length} actionable</Badge>
        </Group>
      </Group>

      {entitiesQuery.isError && <Text c="red" size="sm">Unable to load realtime entities.</Text>}

      <Card withBorder padding={0} style={{ height: "calc(100vh - 245px)", minHeight: 360, overflow: "hidden" }}>
        <div style={{ height: "100%", overflow: "auto" }}>
          <Table striped highlightOnHover withTableBorder horizontalSpacing="sm" verticalSpacing="xs" style={{ minWidth: 1200 }}>
            <Table.Thead>
              <Table.Tr style={{ position: "sticky", top: 0, zIndex: 4, background: "var(--mantine-color-body)" }}>
                <SortableTableHeader active={sortKey === "device"} direction={sortDirection} onClick={() => toggleSort("device")}>Device</SortableTableHeader>
                <SortableTableHeader active={sortKey === "entity"} direction={sortDirection} onClick={() => toggleSort("entity")}>Entity</SortableTableHeader>
                <SortableTableHeader active={sortKey === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>Type</SortableTableHeader>
                <SortableTableHeader active={sortKey === "state"} direction={sortDirection} onClick={() => toggleSort("state")}>State</SortableTableHeader>
                <SortableTableHeader active={sortKey === "unit"} direction={sortDirection} onClick={() => toggleSort("unit")}>Unit</SortableTableHeader>
                <SortableTableHeader active={sortKey === "provider"} direction={sortDirection} onClick={() => toggleSort("provider")}>Provider</SortableTableHeader>
                <SortableTableHeader active={sortKey === "controllable"} direction={sortDirection} onClick={() => toggleSort("controllable")}>Actions</SortableTableHeader>
                <SortableTableHeader active={sortKey === "updated"} direction={sortDirection} onClick={() => toggleSort("updated")}>Last update</SortableTableHeader>
              </Table.Tr>
              <Table.Tr style={{ position: "sticky", top: 39, zIndex: 3, background: "var(--mantine-color-body)" }}>
                <Table.Th><TextInput size="xs" placeholder="Filter device" value={deviceFilter} onChange={event => setDeviceFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(deviceFilter.trim()))} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter entity" value={entityFilter} onChange={event => setEntityFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(entityFilter.trim()))} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All types" clearable value={typeFilter} onChange={setTypeFilter} data={typeOptions} styles={activeFilterStyles(Boolean(typeFilter))} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter state" value={stateFilter} onChange={event => setStateFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(stateFilter.trim()))} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter unit" value={unitFilter} onChange={event => setUnitFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(unitFilter.trim()))} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All providers" clearable value={providerFilter} onChange={setProviderFilter} data={providerOptions} styles={activeFilterStyles(Boolean(providerFilter))} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All actions" clearable value={controllableFilter} onChange={setControllableFilter} data={[{ value: "actionable", label: "Actionable" }, { value: "readonly", label: "Read-only" }]} styles={activeFilterStyles(Boolean(controllableFilter))} /></Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map(entity => (
                <Table.Tr key={`${entity.deviceId}:${entity.entityValue}`}>
                  <Table.Td>
                    <Text size="sm" fw={600}>{entity.deviceName}</Text>
                    <Text size="xs" c="dimmed">{entity.host ?? entity.agentName ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{entity.entityName}</Text>
                    <Text size="xs" c="dimmed">{entity.entityValue}</Text>
                  </Table.Td>
                  <Table.Td><Badge variant="outline" size="sm">{entity.entityType.replaceAll("_", " ").toUpperCase()}</Badge></Table.Td>
                  <Table.Td><Badge variant="light" color={stateColor(entity)}>{stateLabel(entity)}</Badge></Table.Td>
                  <Table.Td>{entity.unit ?? "—"}</Table.Td>
                  <Table.Td><Badge variant="outline" color={entity.connected ? "green" : "gray"}>{entity.provider}</Badge></Table.Td>
                  <Table.Td><Text size="sm" c={entity.controllable ? undefined : "dimmed"}>{entity.controllable ? "Actionable" : "Read-only"}</Text></Table.Td>
                  <Table.Td title={entity.observedAt}><Text size="sm">{compactDate(entity.observedAt)}</Text></Table.Td>
                </Table.Tr>
              ))}
              {!entitiesQuery.isLoading && filtered.length === 0 && (
                <Table.Tr><Table.Td colSpan={8}><Text c="dimmed" ta="center" py="xl">{entities.length === 0 ? "No realtime entities have been reported yet." : "No realtime entities match the active filters."}</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      </Card>
    </Stack>
  );
}
