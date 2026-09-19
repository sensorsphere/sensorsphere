import React from "react";
import { ActionIcon, Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDeviceAgents, getDeviceDiscoveries, getDiscardedDeviceDiscoveries, setDeviceDiscoveryDiscarded, startDeviceDiscovery } from "./api";
import type { DeviceAgent, DeviceRegistryDevice } from "./types";
import type { DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { EditActionIcon } from "./TableActionIcons";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";

const DISCOVERY_PROVIDERS = ["YEELIGHT", "ESPHOME", "PROXMOX"] as const;
type DiscoveryProvider = typeof DISCOVERY_PROVIDERS[number];
type DiscoveryActionFilter = "ALL" | "CAN_ADD" | "UPDATE" | "REGISTERED" | "DISCARDED";
type DiscoveryRowStatus = "CAN_ADD" | "UPDATE" | "REGISTERED" | "DISCARDED";
type DiscoverySortKey = "status" | "provider" | "agent" | "name" | "ip" | "identity" | "model";

interface DeviceDiscoveryPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

interface RawDiscoveryRow {
  discovery: { commandId: string; agentId: string; provider: string; createdAt: string };
  device: Record<string, unknown>;
  index: number;
  agent: DeviceAgent | null;
  logicalKey: string;
}

interface DisplayDiscoveryRow extends RawDiscoveryRow {
  sourceRows: RawDiscoveryRow[];
  registered: DeviceRegistryDevice | null;
  updateReasons: string[];
  status: DiscoveryRowStatus;
  discarded: boolean;
}

function normalizeMac(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^0-9A-F]/g, "") : "";
}

function normalizeYeelightId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function textValue(device: Record<string, unknown>, key: string): string {
  const value = device[key];
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  return String(value);
}

function discoveryIdentityKey(provider: string, discovered: Record<string, unknown>): string {
  const normalizedProvider = provider.toUpperCase();
  if (normalizedProvider === "YEELIGHT") {
    const id = normalizeYeelightId(discovered.id);
    if (id) return `YEELIGHT_ID:${id}`;
  }
  if (normalizedProvider === "PROXMOX") {
    const providerId = normalizeText(discovered.providerId);
    if (providerId) return `PROXMOX_ID:${providerId}`;
  }
  const mac = normalizeMac(discovered.mac);
  if (mac) return `MAC:${mac}`;
  const hostname = normalizeText(discovered.hostname);
  if (hostname) return `HOSTNAME:${hostname}`;
  const ip = normalizeText(discovered.ip);
  if (ip) return `IP:${ip}`;
  const name = normalizeText(discovered.name);
  return `NAME:${name || "unknown"}`;
}

function registeredDeviceFor(provider: string, discovered: Record<string, unknown>, devices: DeviceRegistryDevice[]): DeviceRegistryDevice | null {
  const normalizedProvider = provider.toUpperCase();
  const mac = normalizeMac(discovered.mac);
  const yeelightId = normalizeYeelightId(discovered.id);
  const hostname = normalizeText(discovered.hostname);
  const proxmoxId = normalizeText(discovered.providerId);

  return devices.find(existing => {
    const macMatch = Boolean(mac) && existing.identities.some(identity =>
      identity.identityType.toUpperCase() === "MAC" && normalizeMac(identity.value) === mac
    );
    if (normalizedProvider === "PROXMOX") {
      return Boolean(proxmoxId && existing.identities.some(identity =>
        identity.identityType.toUpperCase() === "PROXMOX_ID"
        && identity.value.trim().toLowerCase() === proxmoxId
      ));
    }
    if (normalizedProvider === "ESPHOME") {
      const hostnameMatch = Boolean(hostname) && existing.identities.some(identity =>
        ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
        && identity.value.trim().toLowerCase() === hostname
      );
      return Boolean(macMatch || hostnameMatch);
    }
    const idMatch = Boolean(yeelightId) && existing.identities.some(identity =>
      identity.identityType.toUpperCase() === "YEELIGHT_ID"
      && normalizeYeelightId(identity.value) === yeelightId
    );
    return Boolean(idMatch || macMatch);
  }) ?? null;
}

function registryUpdateReasons(
  provider: string,
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  discoveryAgent: DeviceAgent | null,
  agentById: Map<string, DeviceAgent>
): string[] {
  const reasons: string[] = [];
  const providerName = provider.toUpperCase();
  const ip = typeof discovered.ip === "string" ? discovered.ip.trim() : "";
  const mac = normalizeMac(discovered.mac);
  const hostname = normalizeText(discovered.hostname);
  const model = typeof discovered.model === "string" ? discovered.model.trim() : "";
  const firmwareVersion = typeof discovered.firmwareVersion === "string" ? discovered.firmwareVersion.trim() : "";
  const hasIdentity = (type: string, predicate: (value: string) => boolean) =>
    registered.identities.some(identity => identity.identityType.toUpperCase() === type && predicate(identity.value));

  if (providerName === "YEELIGHT") {
    const yeelightId = normalizeYeelightId(discovered.id);
    if (yeelightId && !hasIdentity("YEELIGHT_ID", value => normalizeYeelightId(value) === yeelightId)) reasons.push(`Yeelight ID: add ${textValue(discovered, "id")}`);
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "yeelight") reasons.push(`Manufacturer: ${registered.manufacturer ?? "—"} → Yeelight`);
  } else if (providerName === "ESPHOME") {
    if (hostname && !registered.identities.some(identity =>
      ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
      && identity.value.trim().toLowerCase() === hostname
    )) reasons.push(`Hostname: add ${textValue(discovered, "hostname")}`);
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "esphome") reasons.push(`Manufacturer: ${registered.manufacturer ?? "—"} → ESPHome`);
  } else if (providerName === "PROXMOX") {
    const providerId = normalizeText(discovered.providerId);
    if (providerId && !hasIdentity("PROXMOX_ID", value => value.trim().toLowerCase() === providerId)) reasons.push(`Proxmox ID: add ${textValue(discovered, "providerId")}`);
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "proxmox") reasons.push(`Manufacturer: ${registered.manufacturer ?? "—"} → Proxmox`);
    const kind = normalizeText(discovered.kind).toUpperCase();
    const expectedClass = kind === "PVE_NODE" ? "COMPUTE" : "VIRTUAL";
    const expectedType = kind === "PVE_NODE" ? "hypervisor" : kind === "PVE_LXC" ? "lxc_container" : kind === "PVE_VM" ? "virtual_machine" : "";
    if (expectedType && registered.deviceClass !== expectedClass) reasons.push(`Class: ${registered.deviceClass} → ${expectedClass}`);
    if (expectedType && registered.deviceType !== expectedType) reasons.push(`Type: ${registered.deviceType} → ${expectedType}`);
  }

  if (mac && !hasIdentity("MAC", value => normalizeMac(value) === mac)) reasons.push(`MAC: add ${textValue(discovered, "mac")}`);
  if (ip && !hasIdentity("IP", value => value.trim() === ip)) reasons.push(`IP: add ${ip}`);
  if (model && (registered.model ?? "").trim() !== model) reasons.push(`Model: ${registered.model ?? "—"} → ${model}`);
  if (firmwareVersion && (registered.firmwareVersion ?? "").trim() !== firmwareVersion) reasons.push(`Firmware: ${registered.firmwareVersion ?? "—"} → ${firmwareVersion}`);
  if (registered.controlProvider?.toUpperCase() !== providerName) reasons.push(`Provider: ${registered.controlProvider ?? "—"} → ${providerName}`);
  if (!registered.technologies.some(item => item.code.toUpperCase() === providerName)) reasons.push(`Technology: add ${providerName}`);

  // Seeing the same device from another agent is not itself an update while the assigned agent is healthy.
  const assignedAgent = registered.controlAgent?.id ? agentById.get(registered.controlAgent.id) : null;
  const assignedAgentOnline = Boolean(assignedAgent?.online && assignedAgent.enabled);
  if (discoveryAgent && registered.controlAgent?.id !== discoveryAgent.id && !assignedAgentOnline) {
    reasons.push(`Agent: ${registered.controlAgent?.name ?? "none"} → ${discoveryAgent.name}`);
  }
  return reasons;
}


async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through for HTTP/insecure contexts or browsers denying Clipboard API access.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function providerColor(provider: string): string {
  const normalized = provider.toUpperCase();
  if (normalized === "YEELIGHT") return "yellow";
  if (normalized === "PROXMOX") return "indigo";
  return "green";
}

function providerLabel(provider: string): string {
  const normalized = provider.toUpperCase();
  if (normalized === "ESPHOME") return "ESPHome";
  if (normalized === "PROXMOX") return "Proxmox";
  return "Yeelight";
}

function statusLabel(status: DiscoveryRowStatus): string {
  if (status === "CAN_ADD") return "Can be added";
  if (status === "UPDATE") return "To be updated";
  if (status === "DISCARDED") return "Discarded";
  return "Registered";
}

function statusColor(status: DiscoveryRowStatus): string {
  if (status === "CAN_ADD") return "blue";
  if (status === "UPDATE") return "orange";
  if (status === "DISCARDED") return "gray";
  return "green";
}

const STATUS_ORDER: Record<DiscoveryRowStatus, number> = { CAN_ADD: 0, UPDATE: 1, REGISTERED: 2, DISCARDED: 3 };

export function DeviceDiscoveryPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: DeviceDiscoveryPanelProps) {
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = usePersistentState<string | null>("device-registry.discovery.filter.provider", null);
  const [agentFilter, setAgentFilter] = usePersistentState<string | null>("device-registry.discovery.filter.agent", null);
  const [textFilter, setTextFilter] = usePersistentState("device-registry.discovery.filter.text", "");
  const [actionFilter, setActionFilter] = usePersistentState<DiscoveryActionFilter>("device-registry.discovery.filter.action", "CAN_ADD");
  const [showDuplicateAgents, setShowDuplicateAgents] = usePersistentState("device-registry.discovery.show-duplicate-agents", false);
  const [showDiscarded, setShowDiscarded] = usePersistentState("device-registry.discovery.show-discarded", false);
  const [sortKey, setSortKey] = usePersistentState<DiscoverySortKey>("device-registry.discovery.sort.key.v2", "name");
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>("device-registry.discovery.sort.direction.v2", "asc");
  const [updateKey, setUpdateKey] = React.useState<string | null>(null);
  const [scanProvider, setScanProvider] = React.useState<DiscoveryProvider | "ALL" | null>(null);
  const [agentChoice, setAgentChoice] = React.useState<{ row: DisplayDiscoveryRow; rowKey: string } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);

  const agentsQuery = useQuery({ queryKey: ["device-agents"], queryFn: getDeviceAgents, refetchInterval: 5000 });
  const discoveriesQuery = useQuery({
    queryKey: ["device-discoveries"],
    queryFn: getDeviceDiscoveries,
    refetchInterval: query => (query.state.data?.some(item => item.status === "SENT") ? 1000 : 5000)
  });
  const discardedQuery = useQuery({ queryKey: ["device-discovery-discarded"], queryFn: getDiscardedDeviceDiscoveries });

  const scanMutation = useMutation({
    mutationFn: async (provider: DiscoveryProvider | "ALL") => {
      setScanProvider(provider);
      const agents = agentsQuery.data ?? [];
      const providers = provider === "ALL" ? [...DISCOVERY_PROVIDERS] : [provider];
      const requests: Promise<unknown>[] = [];
      for (const agent of agents) {
        if (!agent.online || !agent.enabled) continue;
        for (const currentProvider of providers) {
          const capability = agent.capabilities.find(item => item.provider.toUpperCase() === currentProvider && item.discovery);
          if (capability) requests.push(startDeviceDiscovery(agent.id, currentProvider));
        }
      }
      if (!requests.length) throw new Error(`No online Device Agent can discover ${provider === "ALL" ? "Yeelight, ESPHome or Proxmox devices" : provider}`);
      const settled = await Promise.allSettled(requests);
      const failed = settled.filter(item => item.status === "rejected");
      if (failed.length === settled.length) throw new Error("Unable to start discovery on the available Device Agents");
      return settled;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["device-discoveries"] }),
    onSettled: () => setScanProvider(null)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ request, registered, key }: { request: DiscoveredDeviceImportRequest; registered: DeviceRegistryDevice; key: string }) => {
      setUpdateKey(key);
      await onUpdateDiscoveredDevice(request, registered);
    },
    onSettled: () => setUpdateKey(null)
  });

  const discardMutation = useMutation({
    mutationFn: setDeviceDiscoveryDiscarded,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["device-discovery-discarded"] })
  });

  const agents = agentsQuery.data ?? [];
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const discoveries = discoveriesQuery.data ?? [];
  const discardedKeys = new Set((discardedQuery.data ?? []).map(item => `${item.provider.toUpperCase()}|${item.identityKey}`));

  // Keep only the newest result for a logical device from each agent. A later scan must replace older rows.
  const latestPerAgent = new Map<string, RawDiscoveryRow>();
  for (const discovery of discoveries) {
    if (discovery.status !== "SUCCESS" || !DISCOVERY_PROVIDERS.includes(discovery.provider.toUpperCase() as DiscoveryProvider)) continue;
    discovery.devices.forEach((device, index) => {
      const provider = discovery.provider.toUpperCase();
      const logicalKey = discoveryIdentityKey(provider, device);
      const key = `${provider}|${logicalKey}|${discovery.agentId}`;
      if (!latestPerAgent.has(key)) latestPerAgent.set(key, { discovery, device, index, agent: agentById.get(discovery.agentId) ?? null, logicalKey });
    });
  }

  const groups = new Map<string, RawDiscoveryRow[]>();
  for (const row of latestPerAgent.values()) {
    const key = `${row.discovery.provider.toUpperCase()}|${row.logicalKey}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const displayRows: DisplayDiscoveryRow[] = [];
  for (const sourceRows of groups.values()) {
    sourceRows.sort((a, b) => (a.agent?.name ?? a.discovery.agentId).localeCompare(b.agent?.name ?? b.discovery.agentId));
    const first = sourceRows[0];
    const provider = first.discovery.provider.toUpperCase();
    const registered = sourceRows.map(row => registeredDeviceFor(provider, row.device, devices)).find(Boolean) ?? null;
    const assignedAgentId = registered?.controlAgent?.id ?? null;
    const assignedAgent = assignedAgentId ? agentById.get(assignedAgentId) : null;
    const assignedOnline = Boolean(assignedAgent?.online && assignedAgent.enabled);
    const preferred = (assignedOnline ? sourceRows.find(row => row.discovery.agentId === assignedAgentId) : null)
      ?? sourceRows.find(row => row.agent?.online && row.agent.enabled)
      ?? first;
    const selectedRows = showDuplicateAgents ? sourceRows : [preferred];
    for (const selected of selectedRows) {
      const discarded = discardedKeys.has(`${provider}|${selected.logicalKey}`);
      const updateReasons = registered ? registryUpdateReasons(provider, selected.device, registered, selected.agent, agentById) : [];
      const status: DiscoveryRowStatus = discarded ? "DISCARDED" : !registered ? "CAN_ADD" : updateReasons.length ? "UPDATE" : "REGISTERED";
      displayRows.push({ ...selected, sourceRows, registered, updateReasons, status, discarded });
    }
  }

  const filteredRows = displayRows
    .filter(row => {
      if (row.discarded) return actionFilter === "DISCARDED" || showDiscarded;
      if (actionFilter === "DISCARDED") return false;
      return actionFilter === "ALL" || row.status === actionFilter;
    })
    .filter(row => !providerFilter || row.discovery.provider.toUpperCase() === providerFilter)
    .filter(row => !agentFilter || row.sourceRows.some(source => source.discovery.agentId === agentFilter))
    .filter(row => {
      const needle = textFilter.trim().toLowerCase();
      if (!needle) return true;
      return ["name", "hostname", "ip", "mac", "model", "id", "providerId", "node", "vmid", "kind", "endpointId", "os", "osType"].some(key => textValue(row.device, key).toLowerCase().includes(needle))
        || ["ipAddresses", "macAddresses"].some(key => Array.isArray(row.device[key]) && (row.device[key] as unknown[]).some(value => String(value).toLowerCase().includes(needle)));
    });

  const sortedRows = [...filteredRows].sort((left, right) => {
    let result = 0;
    if (sortKey === "status") result = compareTableValues(STATUS_ORDER[left.status], STATUS_ORDER[right.status], sortDirection);
    else if (sortKey === "provider") result = compareTableValues(left.discovery.provider, right.discovery.provider, sortDirection);
    else if (sortKey === "agent") result = compareTableValues(left.agent?.name ?? left.discovery.agentId, right.agent?.name ?? right.discovery.agentId, sortDirection);
    else if (sortKey === "name") result = compareTableValues(textValue(left.device, "name"), textValue(right.device, "name"), sortDirection);
    else if (sortKey === "ip") result = compareTableValues(textValue(left.device, "ip"), textValue(right.device, "ip"), sortDirection);
    else if (sortKey === "identity") result = compareTableValues(left.logicalKey, right.logicalKey, sortDirection);
    else if (sortKey === "model") result = compareTableValues(textValue(left.device, "model"), textValue(right.device, "model"), sortDirection);
    if (result !== 0) return result;
    return textValue(left.device, "name").localeCompare(textValue(right.device, "name"), undefined, { sensitivity: "base", numeric: true });
  });

  const allLogicalRows = [...groups.values()].map(sourceRows => sourceRows[0]);
  const logicalStatuses = allLogicalRows.map(row => {
    const provider = row.discovery.provider.toUpperCase();
    const discarded = discardedKeys.has(`${provider}|${row.logicalKey}`);
    const registered = registeredDeviceFor(provider, row.device, devices);
    if (discarded) return "DISCARDED" as const;
    if (!registered) return "CAN_ADD" as const;
    const assigned = registered.controlAgent?.id ? sourceRowsForKey(groups, provider, row.logicalKey).find(item => item.discovery.agentId === registered.controlAgent?.id) : undefined;
    const candidate = assigned ?? row;
    return registryUpdateReasons(provider, candidate.device, registered, candidate.agent, agentById).length ? "UPDATE" as const : "REGISTERED" as const;
  });
  const canAddCount = logicalStatuses.filter(item => item === "CAN_ADD").length;
  const updateCount = logicalStatuses.filter(item => item === "UPDATE").length;
  const registeredCount = logicalStatuses.filter(item => item === "REGISTERED").length;
  const discardedCount = logicalStatuses.filter(item => item === "DISCARDED").length;
  const runningCount = discoveries.filter(item => item.status === "SENT").length;
  // A failed scan is only relevant until a newer successful scan for the same provider/agent supersedes it.
  // This prevents historical authentication/permission errors from remaining visible after a successful retry.
  const failedDiscoveries = discoveries
    .filter(item => item.status === "FAILED" || item.status === "TIMEOUT")
    .filter(failed => !discoveries.some(candidate =>
      candidate.agentId === failed.agentId
      && candidate.provider.toUpperCase() === failed.provider.toUpperCase()
      && candidate.status === "SUCCESS"
      && new Date(candidate.createdAt).getTime() > new Date(failed.createdAt).getTime()
    ))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);
  const discoveryAgents = agents.filter(agent => agent.capabilities.some(capability => capability.discovery && DISCOVERY_PROVIDERS.includes(capability.provider.toUpperCase() as DiscoveryProvider)));
  const onlineAgents = discoveryAgents.filter(agent => agent.online && agent.enabled).length;
  const offlineAgents = discoveryAgents.length - onlineAgents;
  const scanBusy = scanMutation.isPending || runningCount > 0;
  const activeFilters = Boolean(providerFilter || agentFilter || textFilter.trim() || actionFilter !== "CAN_ADD" || showDuplicateAgents || showDiscarded);

  const toggleSort = (key: DiscoverySortKey) => {
    if (sortKey === key) setSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  };

  const beginUpdate = (row: DisplayDiscoveryRow, rowKey: string) => {
    if (!row.registered) return;
    const candidateRows = row.sourceRows.filter(source => source.agent?.enabled && source.agent.online);
    const candidates = candidateRows.length ? candidateRows : row.sourceRows;
    const assignedAgentId = row.registered.controlAgent?.id ?? null;
    const assignedIsCandidate = Boolean(assignedAgentId && candidates.some(source => source.discovery.agentId === assignedAgentId));
    if (candidates.length > 1 && !assignedIsCandidate) {
      setAgentChoice({ row, rowKey });
      setSelectedAgentId(candidates[0]?.discovery.agentId ?? null);
      return;
    }
    const selected = assignedIsCandidate
      ? candidates.find(source => source.discovery.agentId === assignedAgentId) ?? row
      : row;
    if (!selected.agent) return;
    updateMutation.mutate({ request: { agent: selected.agent, provider: selected.discovery.provider.toUpperCase(), device: selected.device }, registered: row.registered, key: rowKey });
  };

  const confirmAgentChoice = () => {
    if (!agentChoice?.row.registered || !selectedAgentId) return;
    const selected = agentChoice.row.sourceRows.find(source => source.discovery.agentId === selectedAgentId);
    if (!selected?.agent) return;
    updateMutation.mutate({
      request: { agent: selected.agent, provider: selected.discovery.provider.toUpperCase(), device: selected.device },
      registered: agentChoice.row.registered,
      key: agentChoice.rowKey
    });
    setAgentChoice(null);
    setSelectedAgentId(null);
  };

  return <Stack gap="sm" className="device-registry-discovery-panel">
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <div>
        <Text fw={600}>Device discovery</Text>
        <Text size="xs" c="dimmed">Consolidated Yeelight, ESPHome and Proxmox discovery reported by Device Agents.</Text>
      </div>
      <Group gap="sm" align="center">
        <Text size="xs" c="dimmed">Agents: <Text component="span" c="green" fw={600}>{onlineAgents} online</Text> · <Text component="span" c={offlineAgents ? "red" : "dimmed"} fw={600}>{offlineAgents} offline</Text></Text>
        <Group gap="xs">
          <Button size="compact-sm" variant="light" color="yellow" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "YEELIGHT"} onClick={() => scanMutation.mutate("YEELIGHT")}>Scan Yeelight</Button>
          <Button size="compact-sm" variant="light" color="green" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "ESPHOME"} onClick={() => scanMutation.mutate("ESPHOME")}>Scan ESPHome</Button>
          <Button size="compact-sm" variant="light" color="indigo" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "PROXMOX"} onClick={() => scanMutation.mutate("PROXMOX")}>Scan Proxmox</Button>
          <Button size="compact-sm" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "ALL"} onClick={() => scanMutation.mutate("ALL")}>Scan all</Button>
        </Group>
      </Group>
    </Group>

    <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-blue-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilter === "CAN_ADD"} color="blue" label="Filter Can be added" onClick={() => setActionFilter(current => current === "CAN_ADD" ? "ALL" : "CAN_ADD")} /><Text size="xs" c="dimmed">Can be added</Text></Group><Text fw={700} size="xl">{canAddCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-orange-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilter === "UPDATE"} color="orange" label="Filter To be updated" onClick={() => setActionFilter(current => current === "UPDATE" ? "ALL" : "UPDATE")} /><Text size="xs" c="dimmed">To be updated</Text></Group><Text fw={700} size="xl">{updateCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-green-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilter === "REGISTERED"} color="green" label="Filter Registered" onClick={() => setActionFilter(current => current === "REGISTERED" ? "ALL" : "REGISTERED")} /><Text size="xs" c="dimmed">Registered</Text></Group><Text fw={700} size="xl">{registeredCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-gray-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilter === "DISCARDED"} color="gray" label="Filter Discarded" onClick={() => { setShowDiscarded(true); setActionFilter(current => current === "DISCARDED" ? "ALL" : "DISCARDED"); }} /><Text size="xs" c="dimmed">Discarded</Text></Group><Text fw={700} size="xl">{discardedCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-cyan-6)" }}><Text size="xs" c="dimmed">Scans running</Text><Text fw={700} size="xl">{runningCount}</Text></Card>
    </SimpleGrid>

    {scanMutation.isError && <Text size="sm" c="red">{scanMutation.error instanceof Error ? scanMutation.error.message : "Unable to start discovery"}</Text>}
    {failedDiscoveries.map(item => <Text key={item.commandId} size="xs" c="red">{item.provider} discovery on {agentById.get(item.agentId)?.name ?? item.agentId}: {item.error ?? item.status}</Text>)}

    <Group gap="sm" wrap="nowrap">
      <ResetFiltersAction active={activeFilters} onReset={() => { setProviderFilter(null); setAgentFilter(null); setTextFilter(""); setActionFilter("CAN_ADD"); setShowDuplicateAgents(false); setShowDiscarded(false); }} />
      <Select size="xs" placeholder="All providers" clearable value={providerFilter} onChange={setProviderFilter} styles={activeFilterStyles(Boolean(providerFilter))} data={DISCOVERY_PROVIDERS.map(provider => ({ value: provider, label: providerLabel(provider) }))} w={140} />
      <Select size="xs" placeholder="All agents" clearable searchable value={agentFilter} onChange={setAgentFilter} styles={activeFilterStyles(Boolean(agentFilter))} data={discoveryAgents.map(agent => ({ value: agent.id, label: agent.name }))} w={180} />
      <TextInput size="xs" placeholder="Name / IP / MAC / ID / VMID" value={textFilter} onChange={event => setTextFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(textFilter.trim()))} style={{ flex: 1 }} />
      <Switch size="xs" label="Show duplicate agent discoveries" checked={showDuplicateAgents} onChange={event => setShowDuplicateAgents(event.currentTarget.checked)} />
      <Switch size="xs" label="Show discarded" checked={showDiscarded} onChange={event => setShowDiscarded(event.currentTarget.checked)} />
      <Select size="xs" clearable placeholder="All" value={actionFilter === "ALL" ? null : actionFilter} onChange={value => setActionFilter((value as DiscoveryActionFilter | null) ?? "ALL")} data={[
        { value: "CAN_ADD", label: "Can be added" }, { value: "UPDATE", label: "To be updated" }, { value: "REGISTERED", label: "Registered" }, { value: "DISCARDED", label: "Discarded" }
      ]} styles={activeFilterStyles(actionFilter !== "ALL")} w={155} />
      <Text size="xs" c="dimmed">{sortedRows.length}</Text>
    </Group>

    <Card withBorder padding={0}>
      <div className="device-registry-discovery-scroll">
        <Table striped highlightOnHover stickyHeader style={{ minWidth: 1040 }}>
          <Table.Thead><Table.Tr>
            <SortableTableHeader active={sortKey === "provider"} direction={sortDirection} onClick={() => toggleSort("provider")}>Provider</SortableTableHeader>
            <SortableTableHeader active={sortKey === "agent"} direction={sortDirection} onClick={() => toggleSort("agent")}>Agent</SortableTableHeader>
            <SortableTableHeader active={sortKey === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>Name</SortableTableHeader>
            <SortableTableHeader active={sortKey === "ip"} direction={sortDirection} onClick={() => toggleSort("ip")}>IP</SortableTableHeader>
            <SortableTableHeader active={sortKey === "identity"} direction={sortDirection} onClick={() => toggleSort("identity")}>Identity</SortableTableHeader>
            <SortableTableHeader active={sortKey === "model"} direction={sortDirection} onClick={() => toggleSort("model")}>Model</SortableTableHeader>
            <Table.Th>Details</Table.Th>
            <SortableTableHeader active={sortKey === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>Registry</SortableTableHeader>
            <Table.Th style={{ width: 150, textAlign: "right" }}>Actions</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {sortedRows.map(row => {
              const provider = row.discovery.provider.toUpperCase();
              const request: DiscoveredDeviceImportRequest = { agent: row.agent!, provider, device: row.device };
              const rowKey = `${row.discovery.commandId}:${row.index}:${row.discovery.agentId}`;
              const details = provider === "ESPHOME"
                ? `${Array.isArray(row.device.entities) ? row.device.entities.length : 0} entities`
                : provider === "PROXMOX"
                  ? `${textValue(row.device, "kind")} · node ${textValue(row.device, "node")} · status ${textValue(row.device, "status")}`
                  : `Power ${textValue(row.device, "power")} · ${textValue(row.device, "brightness")}%`;
              const agentNames = row.sourceRows.map(source => source.agent?.name ?? source.discovery.agentId);
              const primaryAgentName = row.agent?.name ?? row.discovery.agentId;
              const agentContent = row.sourceRows.length > 1 && !showDuplicateAgents
                ? <Tooltip multiline label={<>Discovered by {row.sourceRows.length} agents:<br />{agentNames.join(" · ")}</>}><Text size="sm" style={{ cursor: "help" }}>{primaryAgentName} ({row.sourceRows.length - 1} other{row.sourceRows.length > 2 ? "s" : ""})</Text></Tooltip>
                : <Text size="sm">{primaryAgentName}</Text>;
              const statusBadge = <Badge size="sm" variant="light" color={statusColor(row.status)}>{statusLabel(row.status)}</Badge>;
              return <Table.Tr key={rowKey}>
                <Table.Td><Badge variant="light" color={providerColor(provider)}>{providerLabel(provider)}</Badge></Table.Td>
                <Table.Td>{agentContent}</Table.Td>
                <Table.Td><CopyableDiscoveryValue value={textValue(row.device, "name") !== "—" ? textValue(row.device, "name") : textValue(row.device, "hostname")} fw={600} /></Table.Td>
                <Table.Td><CopyableDiscoveryValue value={textValue(row.device, "ip")} monospace /></Table.Td>
                <Table.Td><CopyableDiscoveryValue value={provider === "YEELIGHT" ? textValue(row.device, "id") : provider === "PROXMOX" ? textValue(row.device, "providerId") : textValue(row.device, "mac")} monospace compact /></Table.Td>
                <Table.Td><Text size="sm">{provider === "PROXMOX" ? textValue(row.device, "kind") : textValue(row.device, "model")}</Text></Table.Td>
                <Table.Td><Tooltip multiline label={<Stack gap={2}><Text size="xs" fw={600}>Discovery details</Text><Text size="xs">Name: {textValue(row.device, "name") !== "—" ? textValue(row.device, "name") : textValue(row.device, "hostname")}</Text><Text size="xs">IP: {textValue(row.device, "ip")}</Text><Text size="xs">MAC: {textValue(row.device, "mac")}</Text><Text size="xs">Identity: {provider === "YEELIGHT" ? textValue(row.device, "id") : provider === "PROXMOX" ? textValue(row.device, "providerId") : textValue(row.device, "mac")}</Text><Text size="xs">Model / kind: {provider === "PROXMOX" ? textValue(row.device, "kind") : textValue(row.device, "model")}</Text>{provider === "PROXMOX" && <><Text size="xs">Endpoint: {textValue(row.device, "endpointId")}</Text><Text size="xs">Node: {textValue(row.device, "node")}</Text><Text size="xs">VMID: {textValue(row.device, "vmid")}</Text><Text size="xs">OS: {textValue(row.device, "os")} / {textValue(row.device, "osType")}</Text><Text size="xs">Guest agent: {textValue(row.device, "guestAgent")}</Text><Text size="xs">Parent: {textValue(row.device, "parentProviderId")}</Text></>}<Text size="xs">{details}</Text></Stack>}><Text size="xs" c="dimmed" style={{ cursor: "help" }}>{details}</Text></Tooltip></Table.Td>
                <Table.Td>{row.status === "UPDATE" ? <Tooltip multiline label={<Stack gap={2}><Text size="xs" fw={600}>Expected updates</Text>{row.updateReasons.map(reason => <Text key={reason} size="xs">• {reason}</Text>)}</Stack>}>{statusBadge}</Tooltip> : statusBadge}</Table.Td>
                <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">
                  {row.status === "CAN_ADD" && row.agent && <Tooltip label="Import into Device Registry"><ActionIcon size="sm" variant="light" color="green" onClick={() => onImportDiscoveredDevice(request)}>+</ActionIcon></Tooltip>}
                  {row.status === "UPDATE" && row.registered && row.agent && <Tooltip label="Update registered device from discovery"><ActionIcon size="sm" variant="light" color="orange" loading={updateKey === rowKey} onClick={() => beginUpdate(row, rowKey)}>↻</ActionIcon></Tooltip>}
                  {row.registered && <EditActionIcon onClick={() => onOpenRegisteredDevice(row.registered!)} />}
                  {!row.discarded
                    ? <Tooltip label="Discard this discovered device"><ActionIcon size="sm" variant="light" color="gray" loading={discardMutation.isPending} onClick={() => discardMutation.mutate({ provider, identityKey: row.logicalKey, label: textValue(row.device, "name"), discarded: true })}>×</ActionIcon></Tooltip>
                    : <Tooltip label="Restore discarded discovery"><ActionIcon size="sm" variant="light" color="blue" loading={discardMutation.isPending} onClick={() => discardMutation.mutate({ provider, identityKey: row.logicalKey, discarded: false })}>↺</ActionIcon></Tooltip>}
                </Group></Table.Td>
              </Table.Tr>;
            })}
            {!sortedRows.length && <Table.Tr><Table.Td colSpan={9}><Text c="dimmed" ta="center" py="xl">No discovery matches the current filters.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
        <div className="device-registry-discovery-scroll-spacer" aria-hidden="true" />
      </div>
    </Card>

    <Modal opened={Boolean(agentChoice)} onClose={() => { setAgentChoice(null); setSelectedAgentId(null); }} title="Select Device Agent" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">This device was discovered by multiple agents and is not currently assigned to one of them. Choose the agent that should own the device.</Text>
        <Select
          label="Device Agent"
          data={(agentChoice?.row.sourceRows ?? []).filter(source => source.agent).map(source => ({ value: source.discovery.agentId, label: source.agent?.name ?? source.discovery.agentId }))}
          value={selectedAgentId}
          onChange={setSelectedAgentId}
          searchable
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => { setAgentChoice(null); setSelectedAgentId(null); }}>Cancel</Button>
          <Button disabled={!selectedAgentId} loading={updateMutation.isPending} onClick={confirmAgentChoice}>Update device</Button>
        </Group>
      </Stack>
    </Modal>
  </Stack>;
}

function CopyableDiscoveryValue({ value, monospace = false, compact = false, fw }: { value: string; monospace?: boolean; compact?: boolean; fw?: number }) {
  const canCopy = Boolean(value && value !== "—");
  return <Group gap={4} wrap="nowrap">
    <Text ff={monospace ? "monospace" : undefined} size={compact ? "xs" : "sm"} fw={fw}>{value}</Text>
    {canCopy && <Tooltip label={`Copy ${value}`}><ActionIcon size="xs" variant="subtle" color="gray" aria-label={`Copy ${value}`} onClick={() => void copyTextToClipboard(value)}>⧉</ActionIcon></Tooltip>}
  </Group>;
}

function FilterCardAction({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return <Tooltip label={label}><ActionIcon size="xs" variant={active ? "light" : "subtle"} color={color} aria-label={label} onClick={onClick}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7Z"/></svg>
  </ActionIcon></Tooltip>;
}

function sourceRowsForKey(groups: Map<string, RawDiscoveryRow[]>, provider: string, logicalKey: string): RawDiscoveryRow[] {
  return groups.get(`${provider}|${logicalKey}`) ?? [];
}
