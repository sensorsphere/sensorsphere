import React from "react";
import { ActionIcon, Badge, Button, Card, Checkbox, Group, HoverCard, Modal, MultiSelect, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bulkAssignDeviceRegistrySlot, getDeviceAgentSlots, getDeviceAgents, getDeviceDiscoveries, getDiscardedDeviceDiscoveries, getRealtimeEntities, setDeviceDiscoveryDiscarded, startDeviceDiscovery } from "./api";
import type { DeviceAgent, DeviceRegistryDevice, RealtimeEntityRecord } from "./types";
import type { DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { EditActionIcon } from "./TableActionIcons";
import { ResolvedIconGlyph, resolveDiscoveryIcon, resolveProviderIcon } from "./ResolvedDeviceIcon";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { FilterClearAction } from "./FilterClearAction";
import { discoveryEntityInventory } from "./DiscoveryEntityInventory";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability } from "./AgentVersionAvailability";
import { ProxmoxConfigModal } from "./ProxmoxConfigModal";

const DISCOVERY_PROVIDERS = ["YEELIGHT", "ESPHOME", "PROXMOX"] as const;
type DiscoveryProvider = typeof DISCOVERY_PROVIDERS[number];
type DiscoveryActionFilter = "CAN_ADD" | "POSSIBLE" | "AMBIGUOUS" | "UPDATE" | "REGISTERED" | "DISCARDED";
type RegistryFilterValue = DiscoveryActionFilter | "ACTION_REQUIRED";
type DiscoveryRowStatus = DiscoveryActionFilter;

const ACTION_REQUIRED_STATUSES: DiscoveryActionFilter[] = ["CAN_ADD", "POSSIBLE", "AMBIGUOUS", "UPDATE"];
const DEFAULT_REGISTRY_FILTERS: RegistryFilterValue[] = ["ACTION_REQUIRED"];
type DiscoverySortKey = "status" | "provider" | "agent" | "name" | "ip" | "identity" | "model";

interface DeviceDiscoveryPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onPreviewBulkImportDiscoveredDevices: (requests: DiscoveredDeviceImportRequest[], slotId: string | null) => Promise<Array<{ name: string; provider: string; agentName: string; slotName: string; deviceType: string }>>;
  onBulkImportDiscoveredDevices: (requests: DiscoveredDeviceImportRequest[], slotId: string | null) => Promise<{ createdDevices: number; deviceIds: string[] }>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

interface RawDiscoveryRow {
  discovery: { commandId: string; agentId: string; provider: string; createdAt: string };
  device: Record<string, unknown>;
  index: number;
  agent: DeviceAgent | null;
  logicalKey: string;
}

interface DiscoveryMatchCandidate {
  device: DeviceRegistryDevice;
  score: number;
  reasons: string[];
  exact: boolean;
}

interface DisplayDiscoveryRow extends RawDiscoveryRow {
  sourceRows: RawDiscoveryRow[];
  registered: DeviceRegistryDevice | null;
  matchCandidates: DiscoveryMatchCandidate[];
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

function registryFiltersExpanded(values: RegistryFilterValue[]): DiscoveryActionFilter[] {
  if (!values.length) return [];
  const expanded = new Set<DiscoveryActionFilter>();
  for (const value of values) {
    if (value === "ACTION_REQUIRED") ACTION_REQUIRED_STATUSES.forEach(status => expanded.add(status));
    else expanded.add(value);
  }
  return [...expanded];
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
}

interface ProxmoxNetworkInterfaceDetail {
  name: string;
  type: string | null;
  active: boolean | null;
  autostart: boolean | null;
  ip: string | null;
  cidr: string | null;
  gateway: string | null;
  ipv6: string | null;
  cidr6: string | null;
  gateway6: string | null;
  mac: string | null;
  bridgePorts: string[];
  vlanAware: boolean | null;
  comment: string | null;
}

function proxmoxNetworkInterfaces(device: Record<string, unknown>): ProxmoxNetworkInterfaceDetail[] {
  if (!Array.isArray(device.networkInterfaces)) return [];
  return device.networkInterfaces.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return [];
    const text = (key: string) => typeof item[key] === "string" && String(item[key]).trim() ? String(item[key]).trim() : null;
    const bool = (key: string) => typeof item[key] === "boolean" ? item[key] as boolean : null;
    return [{
      name,
      type: text("type"),
      active: bool("active"),
      autostart: bool("autostart"),
      ip: text("ip"),
      cidr: text("cidr"),
      gateway: text("gateway"),
      ipv6: text("ipv6"),
      cidr6: text("cidr6"),
      gateway6: text("gateway6"),
      mac: text("mac"),
      bridgePorts: stringArray(item.bridgePorts),
      vlanAware: bool("vlanAware"),
      comment: text("comment")
    }];
  });
}

function discoveredIdentityValues(discovered: Record<string, unknown>, scalarKey: string, arrayKey: string): string[] {
  const scalar = typeof discovered[scalarKey] === "string" ? String(discovered[scalarKey]).trim() : "";
  return [...new Set([scalar, ...stringArray(discovered[arrayKey])].filter(Boolean))];
}

function discoveryMatchCandidates(provider: string, discovered: Record<string, unknown>, devices: DeviceRegistryDevice[]): DiscoveryMatchCandidate[] {
  const normalizedProvider = provider.toUpperCase();
  const proxmoxId = normalizeText(discovered.providerId);
  const yeelightId = normalizeYeelightId(discovered.id);
  const macs = discoveredIdentityValues(discovered, "mac", "macAddresses").map(normalizeMac).filter(Boolean);
  const ips = discoveredIdentityValues(discovered, "ip", "ipAddresses").map(value => value.trim().toLowerCase());
  const hostname = normalizeText(discovered.hostname);
  const name = normalizeText(discovered.name);
  const model = normalizeText(discovered.model || discovered.kind);

  const matches: DiscoveryMatchCandidate[] = [];
  for (const existing of devices) {
    let score = 0;
    let exact = false;
    const reasons: string[] = [];
    const identityValues = (type: string) => existing.identities
      .filter(identity => identity.identityType.toUpperCase() === type)
      .map(identity => identity.value.trim());

    if (normalizedProvider === "PROXMOX" && proxmoxId && identityValues("PROXMOX_ID").some(value => value.toLowerCase() === proxmoxId)) {
      score += 1000;
      exact = true;
      reasons.push(`PROXMOX_ID ${discovered.providerId}`);
    }
    if (normalizedProvider === "YEELIGHT" && yeelightId && identityValues("YEELIGHT_ID").some(value => normalizeYeelightId(value) === yeelightId)) {
      score += 1000;
      exact = true;
      reasons.push(`YEELIGHT_ID ${discovered.id}`);
    }

    const existingMacs = identityValues("MAC").map(normalizeMac).filter(Boolean);
    const sharedMacs = macs.filter(mac => existingMacs.includes(mac));
    if (sharedMacs.length) {
      score += 300 + sharedMacs.length * 10;
      exact = true;
      reasons.push(`MAC ${sharedMacs.join(", ")}`);
    }

    const existingHostnames = existing.identities
      .filter(identity => ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase()))
      .map(identity => normalizeText(identity.value));
    if (hostname && existingHostnames.includes(hostname)) {
      score += 180;
      reasons.push(`Hostname ${discovered.hostname}`);
    }

    const existingIps = identityValues("IP").map(value => value.toLowerCase());
    const sharedIps = ips.filter(ip => existingIps.includes(ip));
    if (sharedIps.length) {
      score += 100 + sharedIps.length * 5;
      reasons.push(`IP ${sharedIps.join(", ")}`);
    }

    const existingName = normalizeText(existing.name);
    const existingModel = normalizeText(existing.model);
    if (name && existingName === name) {
      score += 35;
      reasons.push(`Name ${existing.name}`);
    }
    if (model && existingModel && existingModel === model) {
      score += 15;
      reasons.push(`Model ${existing.model}`);
    }

    // A model-only match is not meaningful (for example every Proxmox node has model PVE_NODE).
    // Keep weak name evidence, but require at least the name-level score before exposing a Registry candidate.
    if (score >= 35) matches.push({ device: existing, score, reasons, exact });
  }
  return matches.sort((left, right) => right.score - left.score || left.device.name.localeCompare(right.device.name));
}

function registeredDeviceFor(provider: string, discovered: Record<string, unknown>, devices: DeviceRegistryDevice[]): { registered: DeviceRegistryDevice | null; candidates: DiscoveryMatchCandidate[] } {
  const candidates = discoveryMatchCandidates(provider, discovered, devices);
  const exact = candidates.filter(candidate => candidate.exact);
  if (exact.length === 1) return { registered: exact[0]!.device, candidates };
  if (!exact.length && candidates.length === 1 && candidates[0]!.score >= 180) return { registered: candidates[0]!.device, candidates };
  return { registered: null, candidates };
}

function mergedDiscoveryDevice(sourceRows: RawDiscoveryRow[], preferred: RawDiscoveryRow): Record<string, unknown> {
  const merged = { ...preferred.device };
  const mergeValues = (scalarKey: string, arrayKey: string) => {
    const values: string[] = [];
    for (const row of [preferred, ...sourceRows.filter(row => row !== preferred)]) {
      const scalar = typeof row.device[scalarKey] === "string" ? String(row.device[scalarKey]).trim() : "";
      if (scalar) values.push(scalar);
      values.push(...stringArray(row.device[arrayKey]));
    }
    const unique = [...new Set(values)];
    if (unique.length) {
      merged[scalarKey] = unique[0];
      merged[arrayKey] = unique;
    }
  };
  mergeValues("ip", "ipAddresses");
  mergeValues("mac", "macAddresses");
  return merged;
}

function entityInventoryKeysFromSignature(signature: string | null): string[] | null {
  if (signature === null) return null;
  return signature.split("\n").map(value => value.trim()).filter(Boolean).sort();
}

function realtimeEntityInventoryKeys(
  registered: DeviceRegistryDevice,
  provider: string,
  realtimeEntities: RealtimeEntityRecord[]
): string[] | null {
  const matching = realtimeEntities.filter(entity =>
    entity.deviceId === registered.id
    && entity.provider.trim().toUpperCase() === provider.trim().toUpperCase()
  );
  if (!matching.length) return null;
  return [...new Set(matching.map(entity => {
    const type = normalizeText(entity.entityType) || "unknown";
    const value = normalizeText(entity.entityValue);
    const prefix = `${type}:`;
    const objectId = value.startsWith(prefix) ? value.slice(prefix.length) : value;
    return `${type}:${objectId}`;
  }))].sort();
}

function appendEntityInventoryReasons(
  reasons: string[],
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  provider: string,
  realtimeEntities: RealtimeEntityRecord[]
): void {
  const discoveredInventory = discoveryEntityInventory(discovered);
  if (discoveredInventory.signature === null) return;

  const discoveredKeys = discoveredInventory.items.map(item => item.key);
  const trackedKeys = entityInventoryKeysFromSignature(registered.discoveryEntitySignature);
  const baselineKeys = trackedKeys ?? realtimeEntityInventoryKeys(registered, provider, realtimeEntities) ?? [];

  const current = new Set(discoveredKeys);
  const baseline = new Set(baselineKeys);
  const added = discoveredKeys.filter(key => !baseline.has(key));
  const removed = baselineKeys.filter(key => !current.has(key));
  if (!added.length && !removed.length) return;

  const baselineCount = trackedKeys !== null
    ? (registered.discoveryEntityCount ?? baselineKeys.length)
    : baselineKeys.length;
  const discoveredCount = discoveredInventory.count ?? discoveredKeys.length;
  reasons.push(`Entities: ${baselineCount} → ${discoveredCount} (+${added.length} / -${removed.length})`);

  const summarize = (values: string[]): string =>
    values.length <= 6 ? values.join(", ") : `${values.slice(0, 6).join(", ")} (+${values.length - 6} more)`;
  if (added.length) reasons.push(`Entities added: ${summarize(added)}`);
  if (removed.length) reasons.push(`Entities removed: ${summarize(removed)}`);
}

function registryUpdateReasons(
  provider: string,
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  discoveryAgent: DeviceAgent | null,
  agentById: Map<string, DeviceAgent>,
  devices: DeviceRegistryDevice[],
  realtimeEntities: RealtimeEntityRecord[]
): string[] {
  const reasons: string[] = [];
  const providerName = provider.toUpperCase();
  const ips = discoveredIdentityValues(discovered, "ip", "ipAddresses");
  const macs = discoveredIdentityValues(discovered, "mac", "macAddresses");
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
    const expectedClass = kind === "PVE_NODE" || kind === "PBS_SERVER" ? "COMPUTE" : "VIRTUAL";
    const expectedType = kind === "PVE_NODE" ? "hypervisor" : kind === "PBS_SERVER" ? "backup_server" : kind === "PVE_LXC" ? "lxc_container" : kind === "PVE_VM" ? "virtual_machine" : "";
    if (expectedType && registered.deviceClass !== expectedClass) reasons.push(`Class: ${registered.deviceClass} → ${expectedClass}`);
    if (expectedType && registered.deviceType !== expectedType) reasons.push(`Type: ${registered.deviceType} → ${expectedType}`);
    const parentProviderId = normalizeText(discovered.parentProviderId);
    if (parentProviderId) {
      const expectedParent = devices.find(device => device.id !== registered.id && device.identities.some(identity =>
        identity.identityType.toUpperCase() === "PROXMOX_ID"
        && normalizeText(identity.value) === parentProviderId
      )) ?? null;
      if (expectedParent && registered.parentDevice?.id !== expectedParent.id) {
        reasons.push(`Parent: ${registered.parentDevice?.name ?? "none"} → ${expectedParent.name}`);
      }
    }
  }

  for (const mac of macs) {
    const normalizedMac = normalizeMac(mac);
    if (normalizedMac && !hasIdentity("MAC", value => normalizeMac(value) === normalizedMac)) reasons.push(`MAC: add ${mac}`);
  }
  for (const ip of ips) {
    if (!hasIdentity("IP", value => value.trim().toLowerCase() === ip.toLowerCase())) reasons.push(`IP: add ${ip}`);
  }
  if (model && (registered.model ?? "").trim() !== model) reasons.push(`Model: ${registered.model ?? "—"} → ${model}`);
  if (firmwareVersion && (registered.firmwareVersion ?? "").trim() !== firmwareVersion) reasons.push(`Firmware: ${registered.firmwareVersion ?? "—"} → ${firmwareVersion}`);
  appendEntityInventoryReasons(reasons, discovered, registered, providerName, realtimeEntities);
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
  if (status === "POSSIBLE") return "Possible match";
  if (status === "AMBIGUOUS") return "Ambiguous";
  if (status === "UPDATE") return "To be updated";
  if (status === "DISCARDED") return "Discarded";
  return "Registered";
}

function statusColor(status: DiscoveryRowStatus): string {
  if (status === "CAN_ADD") return "blue";
  if (status === "POSSIBLE") return "yellow";
  if (status === "AMBIGUOUS") return "red";
  if (status === "UPDATE") return "orange";
  if (status === "DISCARDED") return "gray";
  return "green";
}

const STATUS_ORDER: Record<DiscoveryRowStatus, number> = { CAN_ADD: 0, POSSIBLE: 1, AMBIGUOUS: 2, UPDATE: 3, REGISTERED: 4, DISCARDED: 5 };

function discoveryRowSelectionKey(row: DisplayDiscoveryRow): string {
  return `${row.discovery.provider.toUpperCase()}|${row.logicalKey}`;
}

export function DeviceDiscoveryPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onPreviewBulkImportDiscoveredDevices, onBulkImportDiscoveredDevices, onOpenRegisteredDevice }: DeviceDiscoveryPanelProps) {
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = usePersistentState<string | null>("device-registry.discovery.filter.provider", null);
  const [agentFilter, setAgentFilter] = usePersistentState<string | null>("device-registry.discovery.filter.agent", null);
  const [textFilter, setTextFilter] = usePersistentState("device-registry.discovery.filter.text", "");
  const [identityFilter, setIdentityFilter] = usePersistentState("device-registry.discovery.filter.identity", "");
  const [modelFilter, setModelFilter] = usePersistentState("device-registry.discovery.filter.model", "");
  const [actionFilters, setActionFilters] = usePersistentState<RegistryFilterValue[]>("device-registry.discovery.filter.actions.v3", [...DEFAULT_REGISTRY_FILTERS]);
  const [showDuplicateAgents, setShowDuplicateAgents] = usePersistentState("device-registry.discovery.show-duplicate-agents", false);
  const [showDiscarded, setShowDiscarded] = usePersistentState("device-registry.discovery.show-discarded", false);
  const [sortKey, setSortKey] = usePersistentState<DiscoverySortKey>("device-registry.discovery.sort.key.v2", "name");
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>("device-registry.discovery.sort.direction.v2", "asc");
  const [updateKey, setUpdateKey] = React.useState<string | null>(null);
  const [scanProvider, setScanProvider] = React.useState<DiscoveryProvider | "ALL" | null>(null);
  const [clearBeforeScan, setClearBeforeScan] = usePersistentState("device-registry.discovery.clear-before-scan", false);
  const [scanAgentIds, setScanAgentIds] = usePersistentState<string[]>("device-registry.discovery.scan.agent-ids", []);
  const [proxmoxBootstrapOpen, setProxmoxBootstrapOpen] = React.useState(false);
  const [proxmoxBootstrapAgentId, setProxmoxBootstrapAgentId] = React.useState<string | null>(null);
  const [proxmoxConfigTarget, setProxmoxConfigTarget] = React.useState<DeviceAgent | null>(null);
  const [hiddenDiscoveryCommandIds, setHiddenDiscoveryCommandIds] = React.useState<Set<string>>(() => new Set());
  const [agentChoice, setAgentChoice] = React.useState<{ row: DisplayDiscoveryRow; rowKey: string } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [reconcileChoice, setReconcileChoice] = React.useState<{ row: DisplayDiscoveryRow; rowKey: string } | null>(null);
  const [selectedRegistryDeviceId, setSelectedRegistryDeviceId] = React.useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<string[]>([]);
  const [bulkAction, setBulkAction] = React.useState<"ADD" | "SLOT" | null>(null);
  const [bulkSlotId, setBulkSlotId] = React.useState<string | null>("__DISCOVERED_SLOT__");
  const [bulkSlotDropdownOpened, setBulkSlotDropdownOpened] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = React.useState<Array<{ name: string; provider: string; agentName: string; slotName: string; deviceType: string }>>([]);
  const [bulkPreviewLoading, setBulkPreviewLoading] = React.useState(false);
  const [bulkSuccessCount, setBulkSuccessCount] = React.useState<number | null>(null);

  const agentsQuery = useQuery({ queryKey: ["device-agents"], queryFn: getDeviceAgents, refetchInterval: 5000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const slotsQuery = useQuery({ queryKey: ["device-control", "slots"], queryFn: getDeviceAgentSlots, refetchInterval: 10000 });
  const discoveriesQuery = useQuery({
    queryKey: ["device-discoveries"],
    queryFn: getDeviceDiscoveries,
    refetchInterval: query => (query.state.data?.some(item => item.status === "SENT") ? 1000 : 5000)
  });
  const discardedQuery = useQuery({ queryKey: ["device-discovery-discarded"], queryFn: getDiscardedDeviceDiscoveries });
  const realtimeEntitiesQuery = useQuery({
    queryKey: ["device-control", "realtime-entities"],
    queryFn: getRealtimeEntities,
    refetchInterval: 5000
  });

  const scanMutation = useMutation({
    mutationFn: async (provider: DiscoveryProvider | "ALL") => {
      if (clearBeforeScan) {
        const existingCommandIds = (discoveriesQuery.data ?? []).map(item => item.commandId);
        if (existingCommandIds.length) {
          setHiddenDiscoveryCommandIds(previous => new Set([...previous, ...existingCommandIds]));
        }
      }
      setScanProvider(provider);
      const agents = agentsQuery.data ?? [];
      const selectedAgents = scanAgentIds.length > 0
        ? agents.filter(agent => scanAgentIds.includes(agent.id))
        : agents;
      const providers = provider === "ALL" ? [...DISCOVERY_PROVIDERS] : [provider];
      const requests: Promise<unknown>[] = [];
      for (const agent of selectedAgents) {
        if (!agent.online || !agent.enabled) continue;
        for (const currentProvider of providers) {
          const capability = agent.capabilities.find(item => item.provider.toUpperCase() === currentProvider && item.discovery);
          if (capability) requests.push(startDeviceDiscovery(agent.id, currentProvider));
        }
      }
      if (!requests.length) {
        if (provider === "PROXMOX") {
          throw new Error("No selected Device Agent currently reports Proxmox discovery. Configure the first Proxmox endpoint, then scan again.");
        }
        throw new Error(`No online Device Agent can discover ${provider === "ALL" ? "Yeelight, ESPHome or Proxmox devices" : provider}`);
      }
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
  const selectedScanAgents = scanAgentIds.length > 0
    ? agents.filter(agent => scanAgentIds.includes(agent.id))
    : agents;
  const proxmoxBootstrapCandidates = selectedScanAgents.filter(agent =>
    agent.enabled && Boolean(agent.managedBySupervisorId) && agent.supervisorAvailable
  );

  const openProxmoxBootstrap = () => {
    if (proxmoxBootstrapCandidates.length === 1) {
      setProxmoxConfigTarget(proxmoxBootstrapCandidates[0]!);
      return;
    }
    setProxmoxBootstrapAgentId(proxmoxBootstrapCandidates[0]?.id ?? null);
    setProxmoxBootstrapOpen(true);
  };
  const allDiscoveries = discoveriesQuery.data ?? [];
  const discoveries = hiddenDiscoveryCommandIds.size
    ? allDiscoveries.filter(item => !hiddenDiscoveryCommandIds.has(item.commandId))
    : allDiscoveries;
  const discardedKeys = new Set((discardedQuery.data ?? []).map(item => `${item.provider.toUpperCase()}|${item.identityKey}`));
  const realtimeEntities = realtimeEntitiesQuery.data ?? [];

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
    const matches = sourceRows.map(row => registeredDeviceFor(provider, row.device, devices));
    const registered = matches.map(match => match.registered).find((device): device is DeviceRegistryDevice => Boolean(device)) ?? null;
    const matchCandidates = matches.flatMap(match => match.candidates)
      .filter((candidate, index, items) => items.findIndex(item => item.device.id === candidate.device.id) === index)
      .sort((left, right) => right.score - left.score || left.device.name.localeCompare(right.device.name));
    const assignedAgentId = registered?.controlAgent?.id ?? null;
    const assignedAgent = assignedAgentId ? agentById.get(assignedAgentId) : null;
    const assignedOnline = Boolean(assignedAgent?.online && assignedAgent.enabled);
    const preferred = (assignedOnline ? sourceRows.find(row => row.discovery.agentId === assignedAgentId) : null)
      ?? sourceRows.find(row => row.agent?.online && row.agent.enabled)
      ?? first;
    const selectedRows = showDuplicateAgents ? sourceRows : [preferred];
    for (const selected of selectedRows) {
      const discarded = discardedKeys.has(`${provider}|${selected.logicalKey}`);
      const mergedDevice = mergedDiscoveryDevice(sourceRows, selected);
      const updateReasons = registered ? registryUpdateReasons(provider, mergedDevice, registered, selected.agent, agentById, devices, realtimeEntities) : [];
      const exactCandidates = matchCandidates.filter(candidate => candidate.exact);
      const status: DiscoveryRowStatus = discarded
        ? "DISCARDED"
        : registered
          ? (updateReasons.length ? "UPDATE" : "REGISTERED")
          : exactCandidates.length > 1 || matchCandidates.length > 1
            ? "AMBIGUOUS"
            : matchCandidates.length === 1
              ? "POSSIBLE"
              : "CAN_ADD";
      displayRows.push({ ...selected, device: mergedDevice, sourceRows, registered, matchCandidates, updateReasons, status, discarded });
    }
  }

  const expandedActionFilters = registryFiltersExpanded(actionFilters);
  const filteredRows = displayRows
    .filter(row => {
      if (row.discarded) return expandedActionFilters.includes("DISCARDED") || showDiscarded;
      if (!expandedActionFilters.length) return true;
      return expandedActionFilters.includes(row.status);
    })
    .filter(row => !providerFilter || row.discovery.provider.toUpperCase() === providerFilter)
    .filter(row => !agentFilter || row.sourceRows.some(source => source.discovery.agentId === agentFilter))
    .filter(row => {
      const needle = textFilter.trim().toLowerCase();
      if (!needle) return true;
      return ["name", "hostname", "ip", "mac", "model", "id", "providerId", "node", "vmid", "kind", "endpointId", "os", "osType"].some(key => textValue(row.device, key).toLowerCase().includes(needle))
        || ["ipAddresses", "macAddresses"].some(key => Array.isArray(row.device[key]) && (row.device[key] as unknown[]).some(value => String(value).toLowerCase().includes(needle)))
        || proxmoxNetworkInterfaces(row.device).some(networkInterface => [
          networkInterface.name,
          networkInterface.type,
          networkInterface.ip,
          networkInterface.cidr,
          networkInterface.ipv6,
          networkInterface.cidr6,
          networkInterface.mac,
          networkInterface.gateway,
          networkInterface.gateway6,
          networkInterface.comment,
          ...networkInterface.bridgePorts
        ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle)));
    })
    .filter(row => {
      const needle = identityFilter.trim().toLowerCase();
      if (!needle) return true;
      const identityText = [
        row.logicalKey,
        textValue(row.device, "id"),
        textValue(row.device, "providerId"),
        textValue(row.device, "mac"),
        textValue(row.device, "hostname"),
        ...(Array.isArray(row.device.macAddresses) ? row.device.macAddresses.map(value => String(value)) : []),
        ...(Array.isArray(row.device.ipAddresses) ? row.device.ipAddresses.map(value => String(value)) : [])
      ].join(" ").toLowerCase();
      return identityText.includes(needle);
    })
    .filter(row => {
      const needle = modelFilter.trim().toLowerCase();
      if (!needle) return true;
      const provider = row.discovery.provider.toUpperCase();
      const modelText = provider === "PROXMOX" ? `${textValue(row.device, "kind")} ${textValue(row.device, "model")}` : textValue(row.device, "model");
      return modelText.toLowerCase().includes(needle);
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

  const selectedLogicalRows = [...new Map(
    displayRows
      .filter(row => selectedRowKeys.includes(discoveryRowSelectionKey(row)))
      .map(row => [discoveryRowSelectionKey(row), row] as const)
  ).values()];
  const selectedAddRows = selectedLogicalRows.filter(row => row.status === "CAN_ADD" && row.agent);
  const selectedRegisteredRows = selectedLogicalRows.filter(row => Boolean(row.registered));
  const selectedAddRequests = () => selectedAddRows.map(row => ({
    agent: row.agent!,
    provider: row.discovery.provider.toUpperCase(),
    device: row.device
  }));
  const refreshBulkPreview = async (slotId: string | null) => {
    setBulkPreviewLoading(true);
    setBulkError(null);
    setBulkSuccessCount(null);
    try {
      const preview = await onPreviewBulkImportDiscoveredDevices(selectedAddRequests(), slotId);
      setBulkPreview(preview);
    } catch (cause) {
      setBulkPreview([]);
      setBulkError(cause instanceof Error ? cause.message : "Unable to validate selected devices");
    } finally {
      setBulkPreviewLoading(false);
    }
  };
  const visibleSelectableKeys = [...new Set(
    sortedRows
      .filter(row => (row.status === "CAN_ADD" && Boolean(row.agent)) || Boolean(row.registered))
      .map(discoveryRowSelectionKey)
  )];
  const selectedVisibleCount = visibleSelectableKeys.filter(key => selectedRowKeys.includes(key)).length;

  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      const requests = selectedAddRequests();
      if (bulkPreview.length !== requests.length) throw new Error("Bulk import preview is stale; validate the selected devices again before importing");
      return onBulkImportDiscoveredDevices(requests, bulkSlotId);
    },
    onSuccess: async result => {
      setBulkSuccessCount(result.createdDevices);
      setBulkError(null);
      await queryClient.invalidateQueries({ queryKey: ["device-registry", "devices"] });
    },
    onError: cause => setBulkError(cause instanceof Error ? cause.message : "Unable to add selected devices")
  });

  const bulkSlotMutation = useMutation({
    mutationFn: async () => {
      const deviceIds = [...new Set(selectedRegisteredRows.flatMap(row => row.registered ? [row.registered.id] : []))];
      return bulkAssignDeviceRegistrySlot({ deviceIds, slotId: bulkSlotId });
    },
    onSuccess: async () => {
      setSelectedRowKeys([]);
      setBulkAction(null);
      setBulkError(null);
      await queryClient.invalidateQueries({ queryKey: ["device-registry", "devices"] });
    },
    onError: cause => setBulkError(cause instanceof Error ? cause.message : "Unable to assign Device Agent Slot")
  });

  const allLogicalRows = [...groups.values()].map(sourceRows => sourceRows[0]);
  const logicalStatuses = allLogicalRows.map(row => {
    const provider = row.discovery.provider.toUpperCase();
    const discarded = discardedKeys.has(`${provider}|${row.logicalKey}`);
    const match = registeredDeviceFor(provider, row.device, devices);
    if (discarded) return "DISCARDED" as const;
    if (!match.registered) {
      const exactCandidates = match.candidates.filter(candidate => candidate.exact);
      if (exactCandidates.length > 1 || match.candidates.length > 1) return "AMBIGUOUS" as const;
      if (match.candidates.length === 1) return "POSSIBLE" as const;
      return "CAN_ADD" as const;
    }
    const registered = match.registered;
    const assigned = registered.controlAgent?.id ? sourceRowsForKey(groups, provider, row.logicalKey).find(item => item.discovery.agentId === registered.controlAgent?.id) : undefined;
    const candidate = assigned ?? row;
    const merged = mergedDiscoveryDevice(sourceRowsForKey(groups, provider, row.logicalKey), candidate);
    return registryUpdateReasons(provider, merged, registered, candidate.agent, agentById, devices, realtimeEntities).length ? "UPDATE" as const : "REGISTERED" as const;
  });
  const canAddCount = logicalStatuses.filter(item => item === "CAN_ADD").length;
  const possibleCount = logicalStatuses.filter(item => item === "POSSIBLE").length;
  const ambiguousCount = logicalStatuses.filter(item => item === "AMBIGUOUS").length;
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
  const actionFiltersAreDefault = actionFilters.length === 1 && actionFilters[0] === "ACTION_REQUIRED";
  const activeFilters = Boolean(providerFilter || agentFilter || textFilter.trim() || identityFilter.trim() || modelFilter.trim() || !actionFiltersAreDefault || showDuplicateAgents || showDiscarded);

  const actionFilterActive = (status: DiscoveryActionFilter) => !expandedActionFilters.length || expandedActionFilters.includes(status);
  const toggleActionFilter = (status: DiscoveryActionFilter) => {
    setActionFilters(current => {
      const expanded = registryFiltersExpanded(current);
      if (!expanded.length) return [status];
      return expanded.includes(status) ? expanded.filter(item => item !== status) : [...expanded, status];
    });
  };

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
    updateMutation.mutate({ request: { agent: selected.agent, provider: selected.discovery.provider.toUpperCase(), device: mergedDiscoveryDevice(row.sourceRows, selected) }, registered: row.registered, key: rowKey });
  };

  const confirmAgentChoice = () => {
    if (!agentChoice?.row.registered || !selectedAgentId) return;
    const selected = agentChoice.row.sourceRows.find(source => source.discovery.agentId === selectedAgentId);
    if (!selected?.agent) return;
    updateMutation.mutate({
      request: { agent: selected.agent, provider: selected.discovery.provider.toUpperCase(), device: mergedDiscoveryDevice(agentChoice.row.sourceRows, selected) },
      registered: agentChoice.row.registered,
      key: agentChoice.rowKey
    });
    setAgentChoice(null);
    setSelectedAgentId(null);
  };

  const openReconcile = (row: DisplayDiscoveryRow, rowKey: string) => {
    setReconcileChoice({ row, rowKey });
    setSelectedRegistryDeviceId(row.matchCandidates[0]?.device.id ?? null);
  };

  const reconcileImportRequest = (row: DisplayDiscoveryRow): DiscoveredDeviceImportRequest | null => {
    const selected = row.sourceRows.find(source => source.agent?.online && source.agent.enabled) ?? row;
    if (!selected.agent) return null;
    return {
      agent: selected.agent,
      provider: selected.discovery.provider.toUpperCase(),
      device: mergedDiscoveryDevice(row.sourceRows, selected)
    };
  };

  const closeReconcile = () => {
    setReconcileChoice(null);
    setSelectedRegistryDeviceId(null);
  };

  const confirmReconcile = () => {
    if (!reconcileChoice || !selectedRegistryDeviceId) return;
    const registered = reconcileChoice.row.matchCandidates.find(candidate => candidate.device.id === selectedRegistryDeviceId)?.device;
    const request = reconcileImportRequest(reconcileChoice.row);
    if (!registered || !request) return;
    updateMutation.mutate({ request, registered, key: reconcileChoice.rowKey });
    closeReconcile();
  };

  const addReconcileAsNew = () => {
    if (!reconcileChoice) return;
    const request = reconcileImportRequest(reconcileChoice.row);
    if (!request) return;
    closeReconcile();
    onImportDiscoveredDevice(request);
  };

  const ignoreReconcile = () => {
    if (!reconcileChoice) return;
    const row = reconcileChoice.row;
    const provider = row.discovery.provider.toUpperCase();
    discardMutation.mutate({ provider, identityKey: row.logicalKey, label: textValue(row.device, "name"), discarded: true });
    closeReconcile();
  };

  return <Stack gap="sm" className="device-registry-devices-stack device-registry-discovery-panel">
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <div>
        <Text fw={600}>Device discovery</Text>
        <Text size="xs" c="dimmed">Consolidated Yeelight, ESPHome and Proxmox discovery reported by Device Agents.</Text>
      </div>
      <Group gap="sm" align="center">
        <Text size="xs" c="dimmed">Agents: <Text component="span" c="green" fw={600}>{onlineAgents} online</Text> · <Text component="span" c={offlineAgents ? "red" : "dimmed"} fw={600}>{offlineAgents} offline</Text></Text>
        <Group gap="xs" align="center">
          <MultiSelect
            size="xs"
            w={280}
            searchable
            clearable
            placeholder="All Device Agents"
            value={scanAgentIds}
            data={agents
              .filter(agent => agent.enabled)
              .map(agent => ({
                value: agent.id,
                label: agent.name + (agent.online ? "" : " · OFFLINE")
              }))}
            onChange={setScanAgentIds}
            disabled={scanBusy}
            maxDropdownHeight={260}
            nothingFoundMessage="No Device Agents"
            comboboxProps={{ withinPortal: true }}
          />
          <Switch
            size="xs"
            label="Clear before scan"
            checked={clearBeforeScan}
            onChange={event => setClearBeforeScan(event.currentTarget.checked)}
            disabled={scanBusy}
          />
          <Button size="compact-sm" variant="light" color="yellow" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "YEELIGHT"} onClick={() => scanMutation.mutate("YEELIGHT")}>Scan Yeelight</Button>
          <Button size="compact-sm" variant="light" color="green" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "ESPHOME"} onClick={() => scanMutation.mutate("ESPHOME")}>Scan ESPHome</Button>
          <Tooltip label={proxmoxBootstrapCandidates.length > 0 ? "Configure Proxmox on a Supervisor-managed Device Agent" : "Select an enabled Device Agent with an available Supervisor"}>
            <span><Button size="compact-sm" variant="light" color="orange" disabled={scanBusy || proxmoxBootstrapCandidates.length === 0} onClick={openProxmoxBootstrap}>Configure Proxmox</Button></span>
          </Tooltip>
          <Button size="compact-sm" variant="light" color="indigo" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "PROXMOX"} onClick={() => scanMutation.mutate("PROXMOX")}>Scan Proxmox</Button>
          <Button size="compact-sm" disabled={scanBusy} loading={scanMutation.isPending && scanProvider === "ALL"} onClick={() => scanMutation.mutate("ALL")}>Scan all</Button>
        </Group>
      </Group>
    </Group>

    <Modal opened={proxmoxBootstrapOpen} onClose={() => setProxmoxBootstrapOpen(false)} title="Configure Proxmox" centered>
      <Stack gap="sm">
        <Text size="sm">Choose the Supervisor-managed Device Agent that hosts the Proxmox configuration.</Text>
        <Select
          label="Device Agent"
          placeholder="Select Device Agent"
          value={proxmoxBootstrapAgentId}
          data={proxmoxBootstrapCandidates.map(agent => ({
            value: agent.id,
            label: `${agent.name}${agent.managedBySupervisorName ? ` · ${agent.managedBySupervisorName}` : ""}`
          }))}
          onChange={setProxmoxBootstrapAgentId}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setProxmoxBootstrapOpen(false)}>Cancel</Button>
          <Button
            color="orange"
            disabled={!proxmoxBootstrapAgentId}
            onClick={() => {
              const target = proxmoxBootstrapCandidates.find(agent => agent.id === proxmoxBootstrapAgentId) ?? null;
              setProxmoxBootstrapOpen(false);
              setProxmoxConfigTarget(target);
            }}
          >Configure</Button>
        </Group>
      </Stack>
    </Modal>

    <ProxmoxConfigModal
      agent={proxmoxConfigTarget}
      onClose={() => setProxmoxConfigTarget(null)}
      onChanged={async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["device-agents"] }),
          queryClient.invalidateQueries({ queryKey: ["device-discoveries"] })
        ]);
      }}
    />

    <SimpleGrid cols={{ base: 2, sm: 7 }} spacing="sm">
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-blue-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("CAN_ADD")} color="blue" label="Toggle Can be added" onClick={() => toggleActionFilter("CAN_ADD")} /><Text size="xs" c="dimmed">Can be added</Text></Group><Text fw={700} size="xl">{canAddCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-yellow-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("POSSIBLE")} color="yellow" label="Toggle Possible match" onClick={() => toggleActionFilter("POSSIBLE")} /><Text size="xs" c="dimmed">Possible match</Text></Group><Text fw={700} size="xl">{possibleCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-red-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("AMBIGUOUS")} color="red" label="Toggle Ambiguous" onClick={() => toggleActionFilter("AMBIGUOUS")} /><Text size="xs" c="dimmed">Ambiguous</Text></Group><Text fw={700} size="xl">{ambiguousCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-orange-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("UPDATE")} color="orange" label="Toggle To be updated" onClick={() => toggleActionFilter("UPDATE")} /><Text size="xs" c="dimmed">To be updated</Text></Group><Text fw={700} size="xl">{updateCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-green-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("REGISTERED")} color="green" label="Toggle Registered" onClick={() => toggleActionFilter("REGISTERED")} /><Text size="xs" c="dimmed">Registered</Text></Group><Text fw={700} size="xl">{registeredCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-gray-6)" }}><Group gap={6} wrap="nowrap"><FilterCardAction active={actionFilterActive("DISCARDED")} color="gray" label="Toggle Discarded" onClick={() => { setShowDiscarded(true); toggleActionFilter("DISCARDED"); }} /><Text size="xs" c="dimmed">Discarded</Text></Group><Text fw={700} size="xl">{discardedCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-cyan-6)" }}><Text size="xs" c="dimmed">Scans running</Text><Text fw={700} size="xl">{runningCount}</Text></Card>
    </SimpleGrid>

    {scanMutation.isError && <Text size="sm" c="red">{scanMutation.error instanceof Error ? scanMutation.error.message : "Unable to start discovery"}</Text>}
    {failedDiscoveries.map(item => <Text key={item.commandId} size="xs" c="red">{item.provider} discovery on {agentById.get(item.agentId)?.name ?? item.agentId}: {item.error ?? item.status}</Text>)}

    <Group gap="xs" wrap="wrap">
      <Button
        size="compact-sm"
        variant="light"
        color="green"
        disabled={selectedAddRows.length === 0}
        onClick={() => {
          setBulkSlotId("__DISCOVERED_SLOT__");
          setBulkSlotDropdownOpened(false);
          setBulkError(null);
          setBulkPreview([]);
          setBulkSuccessCount(null);
          setBulkAction("ADD");
          void refreshBulkPreview("__DISCOVERED_SLOT__");
        }}
      >
        Add selected ({selectedAddRows.length})
      </Button>
      <Button
        size="compact-sm"
        variant="light"
        color="violet"
        disabled={selectedRegisteredRows.length === 0}
        onClick={() => {
          const slotIds = [...new Set(selectedRegisteredRows.map(row => row.registered?.controlSlotId).filter((value): value is string => Boolean(value)))];
          setBulkSlotId(slotIds.length === 1 ? slotIds[0]! : null);
          setBulkError(null);
          setBulkAction("SLOT");
        }}
      >
        Assign Slot ({selectedRegisteredRows.length})
      </Button>
      {selectedRowKeys.length > 0 && <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setSelectedRowKeys([])}>Clear selection</Button>}
    </Group>

    <Group gap="sm" wrap="nowrap">
      <ResetFiltersAction active={activeFilters} onReset={() => { setProviderFilter(null); setAgentFilter(null); setTextFilter(""); setIdentityFilter(""); setModelFilter(""); setActionFilters([...DEFAULT_REGISTRY_FILTERS]); setShowDuplicateAgents(false); setShowDiscarded(false); }} />
      <Select
        size="xs"
        placeholder="All providers"
        clearable
        value={providerFilter}
        onChange={setProviderFilter}
        styles={activeFilterStyles(Boolean(providerFilter))}
        data={DISCOVERY_PROVIDERS.map(provider => ({ value: provider, label: providerLabel(provider) }))}
        leftSection={providerFilter ? <ResolvedIconGlyph resolved={resolveProviderIcon(providerFilter)} size={16} /> : undefined}
        renderOption={({ option }) => <Group gap={6} wrap="nowrap"><ResolvedIconGlyph resolved={resolveProviderIcon(option.value)} size={16} /><Text size="sm">{option.label}</Text></Group>}
        w={155}
      />
      <TextInput size="xs" placeholder="Name / IP / MAC / VMID" value={textFilter} onChange={event => setTextFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(textFilter.trim()))} rightSection={<FilterClearAction active={Boolean(textFilter.trim())} onClear={() => setTextFilter("")} />} style={{ flex: 1, minWidth: 180 }} />
      <TextInput size="xs" placeholder="Identity" value={identityFilter} onChange={event => setIdentityFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(identityFilter.trim()))} rightSection={<FilterClearAction active={Boolean(identityFilter.trim())} onClear={() => setIdentityFilter("")} />} w={165} />
      <TextInput size="xs" placeholder="Model" value={modelFilter} onChange={event => setModelFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(modelFilter.trim()))} rightSection={<FilterClearAction active={Boolean(modelFilter.trim())} onClear={() => setModelFilter("")} />} w={150} />
      <Select size="xs" placeholder="All agents" clearable searchable value={agentFilter} onChange={setAgentFilter} styles={activeFilterStyles(Boolean(agentFilter))} data={discoveryAgents.map(agent => ({ value: agent.id, label: agent.name }))} w={180} />
      <Switch size="xs" label="Show duplicate agent discoveries" checked={showDuplicateAgents} onChange={event => setShowDuplicateAgents(event.currentTarget.checked)} />
      <Switch size="xs" label="Show discarded" checked={showDiscarded} onChange={event => setShowDiscarded(event.currentTarget.checked)} />
      <MultiSelect
        size="xs"
        clearable
        searchable
        placeholder="All Registry statuses"
        value={actionFilters}
        onChange={values => setActionFilters(values as RegistryFilterValue[])}
        data={[
          { value: "ACTION_REQUIRED", label: "Action required" },
          { value: "CAN_ADD", label: "Can be added" },
          { value: "POSSIBLE", label: "Possible match" },
          { value: "AMBIGUOUS", label: "Ambiguous" },
          { value: "UPDATE", label: "To be updated" },
          { value: "REGISTERED", label: "Registered" },
          { value: "DISCARDED", label: "Discarded" }
        ]}
        styles={activeFilterStyles(Boolean(actionFilters.length))}
        w={315}
      />
      <Text size="xs" c="dimmed">{sortedRows.length}</Text>
    </Group>

    <Card withBorder padding={0} className="device-registry-table-card">
      <div className="device-registry-table-scroll">
        <Table striped highlightOnHover stickyHeader style={{ minWidth: 1040 }}>
          <Table.Thead><Table.Tr>
            <Table.Th style={{ width: 34, minWidth: 34, maxWidth: 34, paddingInline: 6 }}>
              <Checkbox
                size="xs"
                aria-label="Select all actionable discovery rows"
                checked={visibleSelectableKeys.length > 0 && selectedVisibleCount === visibleSelectableKeys.length}
                indeterminate={selectedVisibleCount > 0 && selectedVisibleCount < visibleSelectableKeys.length}
                onChange={event => setSelectedRowKeys(current => {
                  const visible = new Set(visibleSelectableKeys);
                  if (event.currentTarget.checked) return [...new Set([...current, ...visible])];
                  return current.filter(key => !visible.has(key));
                })}
              />
            </Table.Th>
            <Table.Th aria-label="Icon" style={{ width: 28, minWidth: 28, maxWidth: 28, paddingInline: 4 }} />
            <SortableTableHeader active={sortKey === "provider"} direction={sortDirection} onClick={() => toggleSort("provider")}>Provider</SortableTableHeader>
            <SortableTableHeader active={sortKey === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>Name</SortableTableHeader>
            <SortableTableHeader active={sortKey === "ip"} direction={sortDirection} onClick={() => toggleSort("ip")}>IP</SortableTableHeader>
            <SortableTableHeader active={sortKey === "identity"} direction={sortDirection} onClick={() => toggleSort("identity")}>Identity</SortableTableHeader>
            <SortableTableHeader active={sortKey === "model"} direction={sortDirection} onClick={() => toggleSort("model")}>Model</SortableTableHeader>
            <Table.Th>Details</Table.Th>
            <SortableTableHeader active={sortKey === "agent"} direction={sortDirection} onClick={() => toggleSort("agent")}>Agent</SortableTableHeader>
            <SortableTableHeader active={sortKey === "status"} direction={sortDirection} onClick={() => toggleSort("status")}>Registry</SortableTableHeader>
            <Table.Th style={{ width: 150, textAlign: "right" }}>Actions</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {sortedRows.map(row => {
              const provider = row.discovery.provider.toUpperCase();
              const request: DiscoveredDeviceImportRequest = { agent: row.agent!, provider, device: row.device };
              const rowKey = `${row.discovery.commandId}:${row.index}:${row.discovery.agentId}`;
              const proxmoxKind = provider === "PROXMOX" ? textValue(row.device, "kind") : "";
              const proxmoxGuest = provider === "PROXMOX" && ["PVE_VM", "PVE_LXC"].includes(proxmoxKind);
              const proxmoxStatus = textValue(row.device, "status");
              const networkInterfaces = provider === "PROXMOX" && proxmoxKind === "PVE_NODE"
                ? proxmoxNetworkInterfaces(row.device)
                : [];
              const entitySummaries = ["ESPHOME", "YEELIGHT"].includes(provider) ? discoveryEntityInventory(row.device).items : [];
              const entityTypes = [...new Set(entitySummaries.map(entity => entity.type))];
              const details = provider === "ESPHOME" || (provider === "YEELIGHT" && entitySummaries.length > 0)
                ? `${entitySummaries.length} entities`
                : provider === "PROXMOX"
                  ? `${proxmoxKind} · node ${textValue(row.device, "node")}${!proxmoxGuest ? ` · status ${proxmoxStatus}` : ""}${textValue(row.device, "version") !== "—" ? ` · version ${textValue(row.device, "version")}` : ""}`
                  : `Power ${textValue(row.device, "power")} · ${textValue(row.device, "brightness")}%`;
              const detailsContent = proxmoxGuest
                ? <Stack gap={1}><Text size="xs" c="dimmed">{proxmoxKind} · node {textValue(row.device, "node")}{textValue(row.device, "version") !== "—" ? ` · version ${textValue(row.device, "version")}` : ""}</Text><ProxmoxRuntimeStatus status={proxmoxStatus} /></Stack>
                : entitySummaries.length > 0
                  ? <Stack gap={1}><Text size="xs" c="dimmed">{entitySummaries.length} entities</Text><Text size="xs" c="dimmed">{entityTypes.join(" · ")}</Text></Stack>
                  : <Text size="xs" c="dimmed">{details}</Text>;
              const agentNames = row.sourceRows.map(source => source.agent?.name ?? source.discovery.agentId);
              const primaryAgentName = row.agent?.name ?? row.discovery.agentId;
              const primaryAgentVersion = row.agent?.version ?? null;
              const agentUpdateStatus = row.agent?.updateStatus ?? "IDLE";
              const agentVersionStatus = ["UPDATE_REQUESTED", "REQUESTED", "UPDATING", "VERIFYING"].includes(agentUpdateStatus)
                ? <Badge size="xs" variant="light" color="blue">{agentUpdateStatus}</Badge>
                : agentUpdateStatus === "FAILED"
                  ? <Tooltip label={row.agent?.updateError ?? "Device Agent update failed"}><Badge size="xs" variant="light" color="red">FAILED</Badge></Tooltip>
                  : <AgentVersionFreshnessBadge installedVersion={primaryAgentVersion} release={versionsQuery.data?.agents.deviceAgent} />;
              const agentLabel = <Stack gap={2}><Text size="sm">{primaryAgentName}{row.sourceRows.length > 1 && !showDuplicateAgents ? ` (${row.sourceRows.length - 1} other${row.sourceRows.length > 2 ? "s" : ""})` : ""}</Text><Group gap={6} wrap="nowrap"><Text size="xs" c="dimmed">{primaryAgentVersion ?? "—"}</Text>{agentVersionStatus}</Group></Stack>;
              const agentContent = row.sourceRows.length > 1 && !showDuplicateAgents
                ? <Tooltip multiline label={<>Discovered by {row.sourceRows.length} agents:<br />{agentNames.join(" · ")}</>}><span style={{ cursor: "help" }}>{agentLabel}</span></Tooltip>
                : agentLabel;
              const statusBadge = <Badge size="sm" variant="light" color={statusColor(row.status)} style={{ maxWidth: "none", whiteSpace: "nowrap", overflow: "visible", textOverflow: "clip" }}>{statusLabel(row.status)}</Badge>;
              const selectionKey = discoveryRowSelectionKey(row);
              const selectable = (row.status === "CAN_ADD" && Boolean(row.agent)) || Boolean(row.registered);
              return <Table.Tr key={rowKey}>
                <Table.Td style={{ width: 34, minWidth: 34, maxWidth: 34, paddingInline: 6 }}>
                  <Tooltip label={selectable ? "Select for bulk action" : "Resolve this Registry match before using bulk actions"}>
                    <span>
                      <Checkbox
                        size="xs"
                        aria-label={`Select ${textValue(row.device, "name")}`}
                        disabled={!selectable}
                        checked={selectedRowKeys.includes(selectionKey)}
                        onChange={event => setSelectedRowKeys(current => event.currentTarget.checked ? [...new Set([...current, selectionKey])] : current.filter(key => key !== selectionKey))}
                      />
                    </span>
                  </Tooltip>
                </Table.Td>
                <Table.Td style={{ width: 28, minWidth: 28, maxWidth: 28, paddingInline: 4 }}><ResolvedIconGlyph resolved={resolveDiscoveryIcon(provider, row.device)} size={20} /></Table.Td>
                <Table.Td><Badge variant="light" color={providerColor(provider)} style={{ cursor: "pointer" }} title="Filter by provider" onClick={() => setProviderFilter(provider)}>{providerLabel(provider)}</Badge></Table.Td>
                <Table.Td><CopyableDiscoveryValue value={textValue(row.device, "name") !== "—" ? textValue(row.device, "name") : textValue(row.device, "hostname")} fw={600} /></Table.Td>
                <Table.Td><CopyableDiscoveryValue value={textValue(row.device, "ip")} monospace /></Table.Td>
                <Table.Td><CopyableDiscoveryValue value={provider === "YEELIGHT" ? textValue(row.device, "id") : provider === "PROXMOX" ? textValue(row.device, "providerId") : textValue(row.device, "mac")} monospace compact /></Table.Td>
                <Table.Td><Text size="sm" style={{ cursor: "pointer" }} title="Filter by model" onClick={() => { const value = provider === "PROXMOX" ? textValue(row.device, "kind") : textValue(row.device, "model"); if (value !== "—") setModelFilter(value); }}>{provider === "PROXMOX" ? textValue(row.device, "kind") : textValue(row.device, "model")}</Text></Table.Td>
                <Table.Td>
                  <HoverCard width={provider === "PROXMOX" && proxmoxKind === "PVE_NODE" ? 620 : 430} shadow="md" position="bottom-start" openDelay={150} closeDelay={300} withinPortal>
                    <HoverCard.Target>
                      <span style={{ cursor: "help", display: "inline-block" }}>{detailsContent}</span>
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                      <Stack gap={4}>
                        <Text size="xs" fw={600}>Discovery details</Text>
                        <Text size="xs">Name: {textValue(row.device, "name") !== "—" ? textValue(row.device, "name") : textValue(row.device, "hostname")}</Text>
                        <Text size="xs">IP: {textValue(row.device, "ipAddresses") !== "—" ? textValue(row.device, "ipAddresses") : textValue(row.device, "ip")}</Text>
                        <Text size="xs">MAC: {textValue(row.device, "macAddresses") !== "—" ? textValue(row.device, "macAddresses") : textValue(row.device, "mac")}</Text>
                        <Text size="xs">Identity: {provider === "YEELIGHT" ? textValue(row.device, "id") : provider === "PROXMOX" ? textValue(row.device, "providerId") : textValue(row.device, "mac")}</Text>
                        <Text size="xs">Model / kind: {provider === "PROXMOX" ? textValue(row.device, "kind") : textValue(row.device, "model")}</Text>
                        {entitySummaries.length > 0 && (
                          <>
                            <Text size="xs" fw={600}>Entities ({entitySummaries.length})</Text>
                            <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars scrollbarSize={8}>
                              <Stack gap={2} pr="xs">
                                {entitySummaries.map((entity, entityIndex) => (
                                  <Text key={entity.type + ":" + entity.name + ":" + entityIndex} size="xs">• {entity.type}: {entity.name}</Text>
                                ))}
                              </Stack>
                            </ScrollArea.Autosize>
                          </>
                        )}
                        {provider === "PROXMOX" && (
                          <>
                            <Text size="xs">Endpoint: {textValue(row.device, "endpointId")}</Text>
                            <Text size="xs">Node: {textValue(row.device, "node")}</Text>
                            <Text size="xs">VMID: {textValue(row.device, "vmid")}</Text>
                            {proxmoxGuest && <Group gap={5} wrap="nowrap"><Text component="span" size="xs">Status:</Text><ProxmoxRuntimeStatus status={proxmoxStatus} /></Group>}
                            <Text size="xs">Version: {textValue(row.device, "version")}</Text>
                            <Text size="xs">OS: {textValue(row.device, "os")} / {textValue(row.device, "osType")}</Text>
                            <Text size="xs">Guest agent: {textValue(row.device, "guestAgent")}</Text>
                            <Text size="xs">Parent: {textValue(row.device, "parentProviderId")}</Text>
                            {networkInterfaces.length > 0 && (
                              <>
                                <Text size="xs" fw={600} mt={4}>Network interfaces ({networkInterfaces.length})</Text>
                                <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars scrollbarSize={8}>
                                  <Stack gap={4} pr="xs">
                                    {networkInterfaces.map(networkInterface => (
                                      <Card key={networkInterface.name} withBorder p="xs">
                                        <Stack gap={2}>
                                          <Group gap={6} wrap="wrap">
                                            <Text size="xs" fw={600}>{networkInterface.name}</Text>
                                            {networkInterface.type && <Badge size="xs" variant="light" color="gray">{networkInterface.type}</Badge>}
                                            {networkInterface.active !== null && (
                                              <Badge size="xs" variant="light" color={networkInterface.active ? "green" : "gray"}>
                                                {networkInterface.active ? "UP" : "DOWN"}
                                              </Badge>
                                            )}
                                            {networkInterface.vlanAware === true && <Badge size="xs" variant="light" color="violet">VLAN aware</Badge>}
                                          </Group>
                                          <Text size="xs">
                                            IP: {networkInterface.cidr ?? networkInterface.ip ?? "—"}
                                            {" · "}MAC: {networkInterface.mac ?? "—"}
                                          </Text>
                                          {(networkInterface.cidr6 || networkInterface.ipv6) && (
                                            <Text size="xs">IPv6: {networkInterface.cidr6 ?? networkInterface.ipv6}</Text>
                                          )}
                                          {networkInterface.gateway && <Text size="xs">Gateway: {networkInterface.gateway}</Text>}
                                          {networkInterface.gateway6 && <Text size="xs">Gateway IPv6: {networkInterface.gateway6}</Text>}
                                          {networkInterface.bridgePorts.length > 0 && (
                                            <Text size="xs">Bridge ports: {networkInterface.bridgePorts.join(", ")}</Text>
                                          )}
                                          {networkInterface.comment && <Text size="xs" c="dimmed">{networkInterface.comment}</Text>}
                                        </Stack>
                                      </Card>
                                    ))}
                                  </Stack>
                                </ScrollArea.Autosize>
                              </>
                            )}
                          </>
                        )}
                        {!proxmoxGuest && entitySummaries.length === 0 && <Text size="xs">{details}</Text>}
                      </Stack>
                    </HoverCard.Dropdown>
                  </HoverCard>
                </Table.Td>
                <Table.Td><span style={{ cursor: row.agent ? "pointer" : undefined }} title={row.agent ? "Filter by Device Agent" : undefined} onClick={() => row.agent && setAgentFilter(row.agent.id)}>{agentContent}</span></Table.Td>
                <Table.Td style={{ minWidth: 160 }}>{row.status === "UPDATE"
                  ? <Tooltip multiline label={<Stack gap={2}><Text size="xs" fw={600}>Expected updates</Text>{row.updateReasons.map(reason => <Text key={reason} size="xs">• {reason}</Text>)}</Stack>}>{statusBadge}</Tooltip>
                  : ["POSSIBLE", "AMBIGUOUS"].includes(row.status)
                    ? <Tooltip multiline label={<Stack gap={2}><Text size="xs" fw={600}>Registry match candidates</Text>{row.matchCandidates.map(candidate => <Text key={candidate.device.id} size="xs">• {candidate.device.name}: {candidate.reasons.join(" · ")}</Text>)}</Stack>}><Stack gap={2} align="flex-start"><span>{statusBadge}</span><Text size="xs" c="dimmed">{row.status === "POSSIBLE" ? `→ ${row.matchCandidates[0]?.device.name ?? "Registry candidate"}` : `${row.matchCandidates.length} Registry candidates`}</Text></Stack></Tooltip>
                    : statusBadge}</Table.Td>
                <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">
                  {row.status === "CAN_ADD" && row.agent && <Tooltip label="Import into Device Registry"><ActionIcon size="sm" variant="light" color="green" onClick={() => onImportDiscoveredDevice(request)}>+</ActionIcon></Tooltip>}
                  {["POSSIBLE", "AMBIGUOUS"].includes(row.status) && row.agent && <Tooltip label="Reconcile with an existing Registry device"><ActionIcon size="sm" variant="light" color={row.status === "AMBIGUOUS" ? "red" : "yellow"} loading={updateKey === rowKey} onClick={() => openReconcile(row, rowKey)}>⇄</ActionIcon></Tooltip>}
                  {row.status === "UPDATE" && row.registered && row.agent && <Tooltip multiline label={<Stack gap={2}><Text size="xs" fw={600}>Update registered device</Text>{row.updateReasons.map(reason => <Text key={reason} size="xs">• {reason}</Text>)}</Stack>}><ActionIcon size="sm" variant="light" color="orange" loading={updateKey === rowKey} onClick={() => beginUpdate(row, rowKey)}>↻</ActionIcon></Tooltip>}
                  {row.registered && <EditActionIcon onClick={() => onOpenRegisteredDevice(row.registered!)} />}
                  {!row.discarded
                    ? <Tooltip label="Discard this discovered device"><ActionIcon size="sm" variant="light" color="gray" loading={discardMutation.isPending} onClick={() => discardMutation.mutate({ provider, identityKey: row.logicalKey, label: textValue(row.device, "name"), discarded: true })}>×</ActionIcon></Tooltip>
                    : <Tooltip label="Restore discarded discovery"><ActionIcon size="sm" variant="light" color="blue" loading={discardMutation.isPending} onClick={() => discardMutation.mutate({ provider, identityKey: row.logicalKey, discarded: false })}>↺</ActionIcon></Tooltip>}
                </Group></Table.Td>
              </Table.Tr>;
            })}
            {!sortedRows.length && <Table.Tr><Table.Td colSpan={11}><Text c="dimmed" ta="center" py="xl">No discovery matches the current filters.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </div>
    </Card>

    <Modal
      opened={bulkAction != null}
      onClose={() => {
        if (bulkSuccessCount != null) setSelectedRowKeys([]);
        setBulkAction(null);
        setBulkError(null);
        setBulkSlotDropdownOpened(false);
        setBulkPreview([]);
        setBulkSuccessCount(null);
      }}
      title={bulkAction === "ADD" ? `Add ${bulkPreview.length || selectedAddRows.length} discovered device${(bulkPreview.length || selectedAddRows.length) === 1 ? "" : "s"}` : `Assign Slot to ${selectedRegisteredRows.length} registered device${selectedRegisteredRows.length === 1 ? "" : "s"}`}
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {bulkAction === "ADD"
            ? "By default, each discovered device is assigned to the Device Agent Slot of the Agent that discovered it. You can instead force all selected devices to one Slot or choose No Slot."
            : "The selected Registry devices will be reassigned to the same Device Agent Slot. Clear the field to remove their Slot assignment."}
        </Text>
        <Select
          label="Device Agent Slot"
          searchable
          clearable={bulkAction !== "ADD"}
          placeholder="No Slot"
          value={bulkSlotId}
          dropdownOpened={bulkSlotDropdownOpened}
          onDropdownClose={() => setBulkSlotDropdownOpened(false)}
          onClick={() => setBulkSlotDropdownOpened(true)}
          onKeyDown={event => {
            if (["ArrowDown", "Enter", " "].includes(event.key)) setBulkSlotDropdownOpened(true);
            if (event.key === "Escape") setBulkSlotDropdownOpened(false);
          }}
          onChange={value => {
            setBulkSlotId(value);
            setBulkError(null);
            setBulkSuccessCount(null);
            setBulkSlotDropdownOpened(false);
            if (bulkAction === "ADD") void refreshBulkPreview(value);
          }}
          data={bulkAction === "ADD"
            ? [
                { value: "__DISCOVERED_SLOT__", label: "Assign to discovered slot" },
                { value: "__NO_SLOT__", label: "No Slot" },
                ...(slotsQuery.data ?? []).map(slot => ({
                  value: slot.id,
                  label: `${slot.name} · ${slot.bound ? slot.agentName ?? "BOUND" : "UNBOUND"}`
                }))
              ]
            : (slotsQuery.data ?? []).map(slot => ({
                value: slot.id,
                label: `${slot.name} · ${slot.bound ? slot.agentName ?? "BOUND" : "UNBOUND"}`
              }))}
        />
        {bulkAction === "ADD" && <Card withBorder p="xs">
          <Stack gap={6}>
            <Group justify="space-between"><Text size="sm" fw={600}>Import preview</Text><Badge variant="light" color={bulkError ? "red" : bulkPreviewLoading ? "blue" : "green"}>{bulkPreviewLoading ? "VALIDATING" : bulkError ? "INVALID" : `${bulkPreview.length} READY`}</Badge></Group>
            <Text size="xs" c="dimmed">The complete batch is validated before creation. The API commits all devices in one transaction or rolls the entire batch back.</Text>
            {!bulkPreviewLoading && bulkPreview.length > 0 && <div style={{ maxHeight: 240, overflow: "auto" }}>
              <Table striped withTableBorder>
                <Table.Thead><Table.Tr><Table.Th>Device</Table.Th><Table.Th>Provider</Table.Th><Table.Th>Discovered by</Table.Th><Table.Th>Target Slot</Table.Th><Table.Th>Device Type</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{bulkPreview.map((row, index) => <Table.Tr key={`${row.provider}-${row.name}-${index}`}><Table.Td>{row.name}</Table.Td><Table.Td>{row.provider}</Table.Td><Table.Td>{row.agentName}</Table.Td><Table.Td>{row.slotName}</Table.Td><Table.Td>{row.deviceType}</Table.Td></Table.Tr>)}</Table.Tbody>
              </Table>
            </div>}
          </Stack>
        </Card>}
        {bulkSuccessCount != null && <Text size="sm" c="green" fw={600}>{bulkSuccessCount} device{bulkSuccessCount === 1 ? "" : "s"} imported successfully in one transaction.</Text>}
        {bulkError && <Text size="sm" c="red">{bulkError}</Text>}
        <Group justify="flex-end">
          {bulkSuccessCount != null
            ? <Button data-autofocus onClick={() => { setSelectedRowKeys([]); setBulkAction(null); setBulkError(null); setBulkPreview([]); setBulkSuccessCount(null); }}>Close</Button>
            : <>
              <Button data-autofocus variant="default" disabled={bulkImportMutation.isPending || bulkSlotMutation.isPending} onClick={() => { setBulkAction(null); setBulkError(null); setBulkPreview([]); setBulkSuccessCount(null); }}>Cancel</Button>
              {bulkAction === "ADD"
                ? <Button color="green" loading={bulkImportMutation.isPending} disabled={selectedAddRows.length === 0 || bulkPreviewLoading || Boolean(bulkError) || bulkPreview.length !== selectedAddRows.length} onClick={() => bulkImportMutation.mutate()}>Add selected</Button>
                : <Button color="violet" loading={bulkSlotMutation.isPending} disabled={selectedRegisteredRows.length === 0} onClick={() => bulkSlotMutation.mutate()}>Apply Slot</Button>}
            </>}
        </Group>
      </Stack>
    </Modal>

    <Modal opened={Boolean(reconcileChoice)} onClose={closeReconcile} title="Reconcile discovered device" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Select the existing Registry device that represents this discovered device. Matching evidence is shown for each candidate. You can also add it as a separate Registry device or ignore this discovery.</Text>
        {reconcileChoice && <Card withBorder padding="sm">
          <Stack gap={3}>
            <Text size="xs" fw={600}>Discovered object</Text>
            <Text size="xs">Name: {textValue(reconcileChoice.row.device, "name")}</Text>
            <Text size="xs">Identity: {reconcileChoice.row.discovery.provider.toUpperCase() === "PROXMOX" ? textValue(reconcileChoice.row.device, "providerId") : reconcileChoice.row.logicalKey}</Text>
            <Text size="xs">IP: {textValue(reconcileChoice.row.device, "ip")}</Text>
          </Stack>
        </Card>}
        <Select
          label="Registry device"
          data={(reconcileChoice?.row.matchCandidates ?? []).map(candidate => ({ value: candidate.device.id, label: `${candidate.device.name} · ${candidate.reasons.join(" · ")}` }))}
          value={selectedRegistryDeviceId}
          onChange={setSelectedRegistryDeviceId}
          searchable
        />
        {selectedRegistryDeviceId && reconcileChoice && (() => {
          const candidate = reconcileChoice.row.matchCandidates.find(item => item.device.id === selectedRegistryDeviceId);
          if (!candidate) return null;
          const selectedSource = reconcileChoice.row.sourceRows.find(source => source.agent?.online && source.agent.enabled) ?? reconcileChoice.row;
          const merged = mergedDiscoveryDevice(reconcileChoice.row.sourceRows, selectedSource);
          const changes = registryUpdateReasons(
            selectedSource.discovery.provider.toUpperCase(),
            merged,
            candidate.device,
            selectedSource.agent,
            agentById,
            devices,
            realtimeEntities
          );
          return <Card withBorder padding="sm">
            <Stack gap={4}>
              <Text size="xs" fw={600}>Reconciliation preview</Text>
              <Text size="xs" c="dimmed">Matching evidence: {candidate.reasons.join(" · ") || "—"}</Text>
              {changes.length > 0
                ? <><Text size="xs" fw={600}>Changes to be applied</Text>{changes.map(change => <Text key={change} size="xs">• {change}</Text>)}</>
                : <Text size="xs" c="dimmed">No Registry attributes need to be changed. The discovered device will be linked to this Registry device.</Text>}
            </Stack>
          </Card>;
        })()}
        <Group justify="space-between" wrap="wrap">
          <Button variant="subtle" color="gray" loading={discardMutation.isPending} onClick={ignoreReconcile}>Ignore</Button>
          <Group gap="xs">
            <Button variant="default" onClick={closeReconcile}>Cancel</Button>
            <Button variant="light" color="green" onClick={addReconcileAsNew}>Add as new</Button>
            <Button color="orange" disabled={!selectedRegistryDeviceId} loading={updateMutation.isPending} onClick={confirmReconcile}>Link and update</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>

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

function ProxmoxRuntimeStatus({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  if (normalized !== "running" && normalized !== "stopped") return <Text size="xs" c="dimmed">{status}</Text>;
  const running = normalized === "running";
  const color = running ? "green" : "red";
  return <Group gap={4} wrap="nowrap" component="span">
    <span style={{ display: "inline-flex", color: `var(--mantine-color-${color}-6)` }} aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        {running
          ? <path d="M6.4 4.8 11 8l-4.6 3.2Z" fill="currentColor" />
          : <rect x="5.2" y="5.2" width="5.6" height="5.6" rx="0.8" fill="currentColor" />}
      </svg>
    </span>
    <Text component="span" size="xs" c={color} fw={600}>{normalized}</Text>
  </Group>;
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
