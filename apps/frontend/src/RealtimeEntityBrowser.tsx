import React from "react";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addSimpleDashboardEntityCard, getRealtimeEntities, getSimpleDashboards } from "./api";
import type { RealtimeEntityRecord } from "./types";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { FilterClearAction } from "./FilterClearAction";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResolvedIconGlyph, resolveEntityIcon, resolveProviderIcon } from "./ResolvedDeviceIcon";


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

function defaultWidgetType(entity: RealtimeEntityRecord): "switch" | "status" | "value" {
  if (entity.controllable && (entity.entityType === "switch" || entity.entityType === "light")) return "switch";
  if (entity.entityType === "binary_sensor") return "status";
  return "value";
}

function entitySelectionKey(entity: RealtimeEntityRecord): string {
  return `${entity.deviceId}:${entity.entityValue}`;
}

export function RealtimeEntityBrowser() {
  const queryClient = useQueryClient();
  const entitiesQuery = useQuery({
    queryKey: ["device-control", "realtime-entities"],
    queryFn: getRealtimeEntities,
    refetchInterval: 1000
  });
  const dashboardsQuery = useQuery({
    queryKey: ["simple-dashboards"],
    queryFn: getSimpleDashboards
  });
  const [addEntity, setAddEntity] = React.useState<RealtimeEntityRecord | null>(null);
  const [selectedEntityKeys, setSelectedEntityKeys] = React.useState<string[]>([]);
  const [bulkAddOpen, setBulkAddOpen] = React.useState(false);
  const [dashboardId, setDashboardId] = usePersistentState<string | null>("realtime-entities.add.dashboard", null);
  const [sectionId, setSectionId] = usePersistentState<string | null>("realtime-entities.add.section", null);
  const [widgetType, setWidgetType] = React.useState<"switch" | "status" | "value">("value");
  const addEntityMutation = useMutation({
    mutationFn: async () => {
      if (!addEntity || !dashboardId) throw new Error("Dashboard and entity are required");
      return addSimpleDashboardEntityCard(dashboardId, addEntity.deviceId, addEntity.entityValue, widgetType, sectionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      setAddEntity(null);
    }
  });
  const bulkAddMutation = useMutation({
    mutationFn: async () => {
      if (!dashboardId) throw new Error("Dashboard is required");
      const selected = entities.filter(entity => selectedEntityKeys.includes(entitySelectionKey(entity)));
      if (!selected.length) throw new Error("Select at least one entity");
      for (const entity of selected) {
        await addSimpleDashboardEntityCard(
          dashboardId,
          entity.deviceId,
          entity.entityValue,
          defaultWidgetType(entity),
          sectionId
        );
      }
      return selected.length;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      setBulkAddOpen(false);
      setSelectedEntityKeys([]);
    }
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
    <Stack gap="sm" className="device-registry-devices-stack">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={600}>Realtime Entity Browser</Text>
          <Text size="xs" c="dimmed">Provider-neutral live entity inventory for Device Control and future dashboard widgets.</Text>
        </div>
        <Group gap="xs">
          <Badge variant="light" color="gray">{filtered.length}/{entities.length} shown</Badge>
          <Badge variant="light" color="green">{liveDevices}/{totalDevices} devices live</Badge>
          <Badge variant="light" color="blue">{actionableCount}/{entities.length} actionable</Badge>
          <Button size="compact-sm" variant="light" color="green" disabled={selectedEntityKeys.length === 0} onClick={() => {
            const dashboards = (dashboardsQuery.data?.dashboards ?? []).filter(item => !item.templateId);
            const selectedDashboard = dashboards.some(item => item.id === dashboardId) ? dashboardId : (dashboards[0]?.id ?? null);
            const selectedSection = (dashboardsQuery.data?.sections ?? []).some(item => item.id === sectionId && item.dashboardId === selectedDashboard) ? sectionId : null;
            setDashboardId(selectedDashboard);
            setSectionId(selectedSection);
            bulkAddMutation.reset();
            setBulkAddOpen(true);
          }}>Add selected ({selectedEntityKeys.length})</Button>
          {selectedEntityKeys.length > 0 && <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setSelectedEntityKeys([])}>Clear selection</Button>}
        </Group>
      </Group>

      {entitiesQuery.isError && <Text c="red" size="sm">Unable to load realtime entities.</Text>}

      <Card withBorder padding={0} className="device-registry-table-card">
        <div className="device-registry-table-scroll">
          <Table striped highlightOnHover withTableBorder horizontalSpacing="sm" verticalSpacing="xs" style={{ minWidth: 1200 }}>
            <Table.Thead>
              <Table.Tr style={{ position: "sticky", top: 0, zIndex: 4, background: "var(--mantine-color-body)" }}>
                <Table.Th style={{ width: 34, minWidth: 34, maxWidth: 34, paddingInline: 6 }}>
                  <Checkbox
                    size="xs"
                    aria-label="Select all filtered entities"
                    checked={filtered.length > 0 && filtered.every(entity => selectedEntityKeys.includes(entitySelectionKey(entity)))}
                    indeterminate={filtered.some(entity => selectedEntityKeys.includes(entitySelectionKey(entity))) && !filtered.every(entity => selectedEntityKeys.includes(entitySelectionKey(entity)))}
                    onChange={event => setSelectedEntityKeys(current => {
                      const visible = new Set(filtered.map(entitySelectionKey));
                      return event.currentTarget.checked
                        ? [...new Set([...current, ...visible])]
                        : current.filter(key => !visible.has(key));
                    })}
                  />
                </Table.Th>
                <Table.Th aria-label="Icon" style={{ width: 28, minWidth: 28, maxWidth: 28, paddingInline: 4 }} />
                <SortableTableHeader active={sortKey === "device"} direction={sortDirection} onClick={() => toggleSort("device")}>Device</SortableTableHeader>
                <SortableTableHeader active={sortKey === "entity"} direction={sortDirection} onClick={() => toggleSort("entity")}>Entity</SortableTableHeader>
                <SortableTableHeader active={sortKey === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>Type</SortableTableHeader>
                <SortableTableHeader active={sortKey === "state"} direction={sortDirection} onClick={() => toggleSort("state")}>State</SortableTableHeader>
                <SortableTableHeader active={sortKey === "unit"} direction={sortDirection} onClick={() => toggleSort("unit")}>Unit</SortableTableHeader>
                <SortableTableHeader active={sortKey === "provider"} direction={sortDirection} onClick={() => toggleSort("provider")}>Provider</SortableTableHeader>
                <SortableTableHeader active={sortKey === "controllable"} direction={sortDirection} onClick={() => toggleSort("controllable")}>Actions</SortableTableHeader>
                <SortableTableHeader active={sortKey === "updated"} direction={sortDirection} onClick={() => toggleSort("updated")}>Last update</SortableTableHeader>
                <Table.Th>Dashboard</Table.Th>
              </Table.Tr>
              <Table.Tr style={{ position: "sticky", top: 39, zIndex: 3, background: "var(--mantine-color-body)" }}>
                <Table.Th />
                <Table.Th />
                <Table.Th><TextInput size="xs" placeholder="Filter device" value={deviceFilter} onChange={event => setDeviceFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(deviceFilter.trim()))} rightSection={<FilterClearAction active={Boolean(deviceFilter.trim())} onClear={() => setDeviceFilter("")} />} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter entity" value={entityFilter} onChange={event => setEntityFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(entityFilter.trim()))} rightSection={<FilterClearAction active={Boolean(entityFilter.trim())} onClear={() => setEntityFilter("")} />} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All types" clearable value={typeFilter} onChange={setTypeFilter} data={typeOptions} styles={activeFilterStyles(Boolean(typeFilter))} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter state" value={stateFilter} onChange={event => setStateFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(stateFilter.trim()))} rightSection={<FilterClearAction active={Boolean(stateFilter.trim())} onClear={() => setStateFilter("")} />} /></Table.Th>
                <Table.Th><TextInput size="xs" placeholder="Filter unit" value={unitFilter} onChange={event => setUnitFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(unitFilter.trim()))} rightSection={<FilterClearAction active={Boolean(unitFilter.trim())} onClear={() => setUnitFilter("")} />} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All providers" clearable value={providerFilter} onChange={setProviderFilter} data={providerOptions} styles={activeFilterStyles(Boolean(providerFilter))} leftSection={providerFilter ? <ResolvedIconGlyph resolved={resolveProviderIcon(providerFilter)} size={16} /> : undefined} renderOption={({ option }) => <Group gap={6} wrap="nowrap"><ResolvedIconGlyph resolved={resolveProviderIcon(option.value)} size={16} /><Text size="sm">{option.label}</Text></Group>} /></Table.Th>
                <Table.Th><Select size="xs" placeholder="All actions" clearable value={controllableFilter} onChange={setControllableFilter} data={[{ value: "actionable", label: "Actionable" }, { value: "readonly", label: "Read-only" }]} styles={activeFilterStyles(Boolean(controllableFilter))} /></Table.Th>
                <Table.Th />
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map(entity => (
                <Table.Tr key={`${entity.deviceId}:${entity.entityValue}`}>
                  <Table.Td style={{ width: 34, minWidth: 34, maxWidth: 34, paddingInline: 6 }}><Checkbox size="xs" aria-label={`Select ${entity.entityName}`} checked={selectedEntityKeys.includes(entitySelectionKey(entity))} onChange={event => setSelectedEntityKeys(current => event.currentTarget.checked ? [...new Set([...current, entitySelectionKey(entity)])] : current.filter(key => key !== entitySelectionKey(entity)))} /></Table.Td>
                  <Table.Td style={{ width: 28, minWidth: 28, maxWidth: 28, paddingInline: 4 }}><ResolvedIconGlyph resolved={resolveEntityIcon(entity)} size={20} /></Table.Td>
                  <Table.Td style={{ cursor: "pointer" }} title="Filter by device" onClick={() => setDeviceFilter(entity.deviceName)}>
                    <Text size="sm" fw={600}>{entity.deviceName}</Text>
                    <Text size="xs" c="dimmed">{entity.host ?? entity.agentName ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600} style={{ cursor: "pointer" }} title="Filter by entity name" onClick={() => setEntityFilter(entity.entityName)}>{entity.entityName}</Text>
                    <Text size="xs" c="dimmed" style={{ cursor: "pointer" }} title="Filter by entity ID" onClick={() => setEntityFilter(entity.entityValue)}>{entity.entityValue}</Text>
                  </Table.Td>
                  <Table.Td><Badge variant="outline" size="sm" style={{ cursor: "pointer" }} title="Filter by type" onClick={() => setTypeFilter(entity.entityType)}>{entity.entityType.replaceAll("_", " ").toUpperCase()}</Badge></Table.Td>
                  <Table.Td><Badge variant="light" color={stateColor(entity)} style={{ cursor: "pointer" }} title="Filter by state" onClick={() => setStateFilter(stateLabel(entity))}>{stateLabel(entity)}</Badge></Table.Td>
                  <Table.Td><Text size="sm" style={{ cursor: entity.unit ? "pointer" : undefined }} title={entity.unit ? "Filter by unit" : undefined} onClick={() => entity.unit && setUnitFilter(entity.unit)}>{entity.unit ?? "—"}</Text></Table.Td>
                  <Table.Td><Badge variant="outline" color={entity.connected ? "green" : "gray"} style={{ cursor: "pointer" }} title="Filter by provider" onClick={() => setProviderFilter(entity.provider)}>{entity.provider}</Badge></Table.Td>
                  <Table.Td><Text size="sm" c={entity.controllable ? undefined : "dimmed"} style={{ cursor: "pointer" }} title="Filter by actionability" onClick={() => setControllableFilter(entity.controllable ? "actionable" : "readonly")}>{entity.controllable ? "Actionable" : "Read-only"}</Text></Table.Td>
                  <Table.Td title={entity.observedAt}><Text size="sm">{compactDate(entity.observedAt)}</Text></Table.Td>
                  <Table.Td>
                    <ActionIcon
                      size="sm"
                      variant="light"
                      color="green"
                      title="Add entity to dashboard"
                      aria-label="Add entity to dashboard"
                      onClick={() => {
                        const dashboards = (dashboardsQuery.data?.dashboards ?? []).filter(item => !item.templateId);
                        const selectedDashboard = dashboards.some(item => item.id === dashboardId) ? dashboardId : (dashboards[0]?.id ?? null);
                        const selectedSection = (dashboardsQuery.data?.sections ?? []).some(item => item.id === sectionId && item.dashboardId === selectedDashboard) ? sectionId : null;
                        setAddEntity(entity);
                        setDashboardId(selectedDashboard);
                        setSectionId(selectedSection);
                        setWidgetType(defaultWidgetType(entity));
                      }}
                    >+</ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
              {!entitiesQuery.isLoading && filtered.length === 0 && (
                <Table.Tr><Table.Td colSpan={11}><Text c="dimmed" ta="center" py="xl">{entities.length === 0 ? "No realtime entities have been reported yet." : "No realtime entities match the active filters."}</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      </Card>

      <Modal opened={bulkAddOpen} onClose={() => !bulkAddMutation.isPending && setBulkAddOpen(false)} title={`Add ${selectedEntityKeys.length} entities to dashboard`} centered>
        <Stack>
          <Text size="sm" c="dimmed">Each selected entity will be added with its recommended widget type (switch, binary status or value).</Text>
          <Select
            label="Dashboard"
            value={dashboardId}
            onChange={value => { setDashboardId(value); setSectionId(null); }}
            data={(dashboardsQuery.data?.dashboards ?? []).filter(item => !item.templateId).map(item => ({ value: item.id, label: item.name }))}
            allowDeselect={false}
            placeholder="Select dashboard"
          />
          <Select
            label="Section"
            value={sectionId}
            onChange={setSectionId}
            clearable
            placeholder="Dashboard default"
            data={(dashboardsQuery.data?.sections ?? []).filter(item => item.dashboardId === dashboardId).map(item => ({ value: item.id, label: item.name }))}
          />
          {bulkAddMutation.isError && <Text size="sm" c="red">{bulkAddMutation.error instanceof Error ? bulkAddMutation.error.message : "Unable to add selected entities"}</Text>}
          <Group justify="flex-end">
            <Button data-autofocus variant="light" color="gray" disabled={bulkAddMutation.isPending} onClick={() => setBulkAddOpen(false)}>Cancel</Button>
            <Button color="green" disabled={!dashboardId || selectedEntityKeys.length === 0} loading={bulkAddMutation.isPending} onClick={() => bulkAddMutation.mutate()}>Add selected</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={addEntity !== null} onClose={() => setAddEntity(null)} title="Add realtime entity to dashboard" centered>
        <Stack>
          <div>
            <Text fw={600}>{addEntity?.entityName}</Text>
            <Text size="xs" c="dimmed">{addEntity?.deviceName} · {addEntity?.entityValue}</Text>
          </div>
          <Select
            label="Dashboard"
            value={dashboardId}
            onChange={value => { setDashboardId(value); setSectionId(null); }}
            data={(dashboardsQuery.data?.dashboards ?? []).filter(item => !item.templateId).map(item => ({ value: item.id, label: item.name }))}
            allowDeselect={false}
            placeholder="Select dashboard"
          />
          <Select
            label="Section"
            value={sectionId}
            onChange={setSectionId}
            clearable
            placeholder="Dashboard default"
            data={(dashboardsQuery.data?.sections ?? []).filter(item => item.dashboardId === dashboardId).map(item => ({ value: item.id, label: item.name }))}
          />
          <Select
            label="Widget"
            value={widgetType}
            onChange={value => value && setWidgetType(value as "switch" | "status" | "value")}
            allowDeselect={false}
            data={[
              { value: "switch", label: "Switch control" },
              { value: "status", label: "Binary status" },
              { value: "value", label: "Value" }
            ]}
          />
          {addEntityMutation.isError && <Text size="sm" c="red">{addEntityMutation.error instanceof Error ? addEntityMutation.error.message : "Unable to add entity"}</Text>}
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setAddEntity(null)}>Cancel</Button>
            <Button color="green" disabled={!dashboardId} loading={addEntityMutation.isPending} onClick={() => addEntityMutation.mutate()}>Add widget</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
