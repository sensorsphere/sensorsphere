import React from "react";
import { ActionIcon, Badge, Button, Card, Checkbox, Code, Group, Modal, Notification, NumberInput, Select, Stack, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceAgent, deleteDeviceAgent, getDeviceAgents, getDeviceDiscovery, getDiscoveredDeviceAction, regenerateDeviceAgentToken, requestDeviceAgentUpdate, requestSupervisorAgentUpdate, runManagedAgentOperation, startDeviceDiscovery, startDiscoveredDeviceAction, updateDeviceAgent } from "./api";
import { ResolvedIconGlyph, resolveProviderIcon } from "./ResolvedDeviceIcon";
import { DeviceGlyph } from "./DeviceGlyph";
import type { DeviceAgent, DeviceDiscovery, DeviceRegistryDevice, DiscoveredDeviceAction, ManagedAgentStatus } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability } from "./AgentVersionAvailability";



function RadarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" opacity="0.8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 12L18.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AgentUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 15V9m0 0-2.5 2.5M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8.5a4 4 0 0 1 2.8 6.8M20 15.3v-3m0 3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupervisorUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V8m0 0-2.5 2.5M12 8l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface DiscoveredDeviceImportRequest {
  agent: DeviceAgent;
  provider: string;
  device: Record<string, unknown>;
}

interface DeviceAgentsPanelProps {
  devices?: DeviceRegistryDevice[];
  showSupervisorControls?: boolean;
  onImportDiscoveredDevice?: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice?: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice?: (device: DeviceRegistryDevice) => void;
}

interface AgentFormState {
  name: string;
  enabled: boolean;
  labelsText: string;
  heartbeatTimeoutSeconds: number;
}

function compactDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "less than 1 minute";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

const emptyForm = (): AgentFormState => ({ name: "", enabled: true, labelsText: "", heartbeatTimeoutSeconds: 60 });
const DEVICE_DISCOVERY_PROVIDER_STORAGE_KEY = "sensorsphere.deviceDiscovery.lastProvider";

type DiscoveryModalSortKey = "registry" | "name" | "ip" | "model" | "power" | "brightness" | "entities" | "id";
type DiscoveryModalSortDirection = "asc" | "desc";

function DiscoveryModalSortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort
}: {
  label: string;
  column: DiscoveryModalSortKey;
  activeColumn: DiscoveryModalSortKey;
  direction: DiscoveryModalSortDirection;
  onSort: (column: DiscoveryModalSortKey) => void;
}) {
  const active = activeColumn === column;
  return <Table.Th onClick={() => onSort(column)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
    {label}{active ? (direction === "asc" ? " ↑" : " ↓") : ""}
  </Table.Th>;
}

function parseLabels(value: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of value.split(",").map(part => part.trim()).filter(Boolean)) {
    const separator = item.indexOf("=");
    if (separator > 0) labels[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
    else labels[item] = "true";
  }
  return labels;
}

function labelsText(agent: DeviceAgent): string {
  return Object.entries(agent.labels ?? {}).map(([key, value]) => value === "true" ? key : `${key}=${value}`).join(", ");
}

async function writeClipboardText(text: string): Promise<void> {
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


function discoveryValue(device: Record<string, unknown>, key: string): string {
  const value = device[key];
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function normalizeMac(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^0-9A-F]/g, "") : "";
}

function normalizeYeelightId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function discoveredDeviceKey(device: Record<string, unknown>): string {
  return normalizeMac(device.mac)
    || normalizeYeelightId(device.id)
    || (typeof device.providerId === "string" ? device.providerId.trim().toLowerCase() : "")
    || (typeof device.hostname === "string" ? device.hostname.trim().toLowerCase() : "")
    || (typeof device.ip === "string" ? device.ip.trim() : "");
}

function ipv4SortValue(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map(part => Number(part));
  if (numbers.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers;
}


function discoveryNeedsRegistryUpdate(
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  agent: DeviceAgent | null,
  provider: string | null
): boolean {
  const providerName = provider?.toUpperCase() ?? "";
  const ip = typeof discovered.ip === "string" ? discovered.ip.trim() : "";
  const mac = normalizeMac(discovered.mac);
  const hostname = typeof discovered.hostname === "string" ? discovered.hostname.trim().toLowerCase() : "";
  const model = typeof discovered.model === "string" ? discovered.model.trim() : "";
  const firmwareVersion = typeof discovered.firmwareVersion === "string" ? discovered.firmwareVersion.trim() : "";
  const proxmoxId = typeof discovered.providerId === "string" ? discovered.providerId.trim().toLowerCase() : "";
  const proxmoxKind = typeof discovered.kind === "string" ? discovered.kind.trim().toUpperCase() : "";

  const hasIdentity = (type: string, predicate: (value: string) => boolean) =>
    registered.identities.some(identity => identity.identityType.toUpperCase() === type && predicate(identity.value));

  if (providerName === "YEELIGHT") {
    const yeelightId = normalizeYeelightId(discovered.id);
    if (yeelightId && !hasIdentity("YEELIGHT_ID", value => normalizeYeelightId(value) === yeelightId)) return true;
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "yeelight") return true;
  } else if (providerName === "ESPHOME") {
    if (hostname && !registered.identities.some(identity =>
      ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
      && identity.value.trim().toLowerCase() === hostname
    )) return true;
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "esphome") return true;
  } else if (providerName === "PROXMOX") {
    if (proxmoxId && !hasIdentity("PROXMOX_ID", value => value.trim().toLowerCase() === proxmoxId)) return true;
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "proxmox") return true;
    const expectedClass = proxmoxKind === "PVE_NODE" || proxmoxKind === "PBS_SERVER" ? "COMPUTE" : "VIRTUAL";
    const expectedType = proxmoxKind === "PVE_NODE" ? "hypervisor" : proxmoxKind === "PBS_SERVER" ? "backup_server" : proxmoxKind === "PVE_VM" ? "virtual_machine" : proxmoxKind === "PVE_LXC" ? "lxc_container" : "";
    if (expectedType && (registered.deviceClass !== expectedClass || registered.deviceType !== expectedType)) return true;
  }

  if (mac && !hasIdentity("MAC", value => normalizeMac(value) === mac)) return true;
  if (ip && !hasIdentity("IP", value => value.trim() === ip)) return true;
  if (model && (registered.model ?? "").trim() !== model) return true;
  if (firmwareVersion && (registered.firmwareVersion ?? "").trim() !== firmwareVersion) return true;
  if (agent && registered.controlAgent?.id !== agent.id) return true;
  if (provider && registered.controlProvider?.toUpperCase() !== providerName) return true;
  if (provider && !registered.technologies.some(item => item.code.toLowerCase() === provider.toLowerCase())) return true;
  return false;
}

function compareDiscoveryIp(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftIp = ipv4SortValue(left.ip);
  const rightIp = ipv4SortValue(right.ip);
  if (leftIp && rightIp) {
    for (let index = 0; index < 4; index += 1) {
      const difference = leftIp[index]! - rightIp[index]!;
      if (difference !== 0) return difference;
    }
    return 0;
  }
  return discoveryValue(left, "ip").localeCompare(discoveryValue(right, "ip"), undefined, { numeric: true });
}

export function DeviceAgentsPanel({ devices = [], showSupervisorControls = false, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: DeviceAgentsPanelProps = {}) {
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
  const copyNoticeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (copyNoticeTimerRef.current != null) window.clearTimeout(copyNoticeTimerRef.current);
  }, []);

  const showCopyNotice = React.useCallback((message: string) => {
    if (copyNoticeTimerRef.current != null) window.clearTimeout(copyNoticeTimerRef.current);
    setCopyNotice(message);
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice(null);
      copyNoticeTimerRef.current = null;
    }, 2200);
  }, []);
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const [opened, setOpened] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceAgent | null>(null);
  const [form, setForm] = React.useState<AgentFormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ name: string; token: string } | null>(null);
  const [discoveryAgent, setDiscoveryAgent] = React.useState<DeviceAgent | null>(null);
  const [discoveryProvider, setDiscoveryProvider] = React.useState<string | null>(null);
  const [discoveryId, setDiscoveryId] = React.useState<string | null>(null);
  const [setNameTarget, setSetNameTarget] = React.useState<Record<string, unknown> | null>(null);
  const [setNameValue, setSetNameValue] = React.useState("");
  const [discoveredActionId, setDiscoveredActionId] = React.useState<string | null>(null);
  const [powerActionTarget, setPowerActionTarget] = React.useState<Record<string, unknown> | null>(null);
  const [powerAction, setPowerAction] = React.useState<"POWER_ON" | "POWER_OFF" | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = React.useState<Array<Record<string, unknown>>>([]);
  const [discoverySortKey, setDiscoverySortKey] = React.useState<DiscoveryModalSortKey>("name");
  const [discoverySortDirection, setDiscoverySortDirection] = React.useState<DiscoveryModalSortDirection>("asc");
  const [updateTarget, setUpdateTarget] = React.useState<DeviceAgent | null>(null);
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [supervisorUpdateTarget, setSupervisorUpdateTarget] = React.useState<DeviceAgent | null>(null);
  const [supervisorUpdateVersion, setSupervisorUpdateVersion] = React.useState("");
  const [managedTarget, setManagedTarget] = React.useState<DeviceAgent | null>(null);
  const [managedStatuses, setManagedStatuses] = React.useState<ManagedAgentStatus[]>([]);
  const [managedAgentType, setManagedAgentType] = React.useState<"device-agent" | "monitor-agent">("monitor-agent");
  const [managedInstance, setManagedInstance] = React.useState("main");
  const [managedVersion, setManagedVersion] = React.useState("");
  const [managedEnvironment, setManagedEnvironment] = React.useState("{}");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] });
  const save = useMutation({
    mutationFn: async () => editing
      ? updateDeviceAgent(editing.id, { name: form.name.trim(), enabled: form.enabled, labels: parseLabels(form.labelsText), heartbeatTimeoutSeconds: form.heartbeatTimeoutSeconds })
      : createDeviceAgent({ name: form.name.trim(), labels: parseLabels(form.labelsText), heartbeatTimeoutSeconds: form.heartbeatTimeoutSeconds }),
    onSuccess: async result => {
      if (!editing && "token" in result) setTokenInfo({ name: result.agent.name, token: result.token });
      setOpened(false); setEditing(null); setForm(emptyForm()); await refresh();
    }
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteDeviceAgent(id), onSuccess: async () => { setDeleteTarget(null); await refresh(); } });
  const regenerate = useMutation({ mutationFn: (agent: DeviceAgent) => regenerateDeviceAgentToken(agent.id), onSuccess: async result => { setTokenInfo({ name: result.agent.name, token: result.token }); await refresh(); } });
  const agentUpdateMutation = useMutation({
    mutationFn: ({ agentId, version }: { agentId: string; version: string }) => requestDeviceAgentUpdate(agentId, version),
    onSuccess: async () => { setUpdateTarget(null); setUpdateVersion(""); await refresh(); }
  });
  const supervisorUpdateMutation = useMutation({
    mutationFn: ({ agentId, version }: { agentId: string; version: string }) => requestSupervisorAgentUpdate(agentId, version),
    onSuccess: async () => { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); await refresh(); }
  });
  const managedMutation = useMutation({
    mutationFn: async ({ agent, operation, status }: { agent: DeviceAgent; operation: "LIST" | "DEPLOY" | "UPDATE" | "REMOVE"; status?: ManagedAgentStatus }) => {
      const environment = operation === "DEPLOY" ? JSON.parse(managedEnvironment || "{}") as Record<string, string> : undefined;
      return runManagedAgentOperation(agent.id, {
        operation,
        agentType: operation === "LIST" ? undefined : status?.agent_type ?? managedAgentType,
        instance: operation === "LIST" ? undefined : status?.instance ?? (managedInstance.trim() || "main"),
        version: ["DEPLOY", "UPDATE"].includes(operation) ? managedVersion.trim() || status?.configured_version || undefined : undefined,
        environment
      });
    },
    onSuccess: async (result, variables) => {
      if (variables.operation === "LIST") {
        setManagedStatuses(Array.isArray(result.result) ? result.result as ManagedAgentStatus[] : []);
      } else if (managedTarget) {
        const refreshResult = await runManagedAgentOperation(managedTarget.id, { operation: "LIST" });
        setManagedStatuses(Array.isArray(refreshResult.result) ? refreshResult.result as ManagedAgentStatus[] : []);
        setManagedVersion("");
      }
    }
  });
  const discoveryMutation = useMutation({
    mutationFn: ({ agentId, provider }: { agentId: string; provider: string }) => startDeviceDiscovery(agentId, provider),
    onSuccess: result => setDiscoveryId(result.commandId)
  });
  const discoveryQuery = useQuery<DeviceDiscovery>({
    queryKey: ["device-control", "discovery", discoveryId],
    queryFn: () => getDeviceDiscovery(discoveryId!),
    enabled: discoveryId != null,
    refetchInterval: query => query.state.data?.status === "SENT" ? 500 : false
  });
  React.useEffect(() => {
    if (discoveryQuery.data?.status !== "SUCCESS") return;
    setDiscoveredDevices([...discoveryQuery.data.devices].sort(compareDiscoveryIp));
  }, [discoveryQuery.data?.status, discoveryQuery.data?.devices]);

  const setNameMutation = useMutation({
    mutationFn: async () => {
      if (!discoveryAgent || !discoveryProvider || !setNameTarget) throw new Error("Discovery context is no longer available");
      return startDiscoveredDeviceAction(
        discoveryAgent.id,
        discoveryProvider,
        "SET_NAME",
        setNameTarget,
        { name: setNameValue.trim() }
      );
    },
    onSuccess: result => setDiscoveredActionId(result.commandId)
  });
  const powerMutation = useMutation({
    mutationFn: async ({ device, action }: { device: Record<string, unknown>; action: "POWER_ON" | "POWER_OFF" }) => {
      if (!discoveryAgent || !discoveryProvider) throw new Error("Discovery context is no longer available");
      setPowerActionTarget(device);
      setPowerAction(action);
      return startDiscoveredDeviceAction(discoveryAgent.id, discoveryProvider, action, device);
    },
    onSuccess: result => setDiscoveredActionId(result.commandId)
  });
  const updateRegisteredMutation = useMutation({
    mutationFn: async ({ request, registered }: { request: DiscoveredDeviceImportRequest; registered: DeviceRegistryDevice }) => {
      if (!onUpdateDiscoveredDevice) throw new Error("Update callback is not available");
      await onUpdateDiscoveredDevice(request, registered);
    }
  });
  const discoveredActionQuery = useQuery<DiscoveredDeviceAction>({
    queryKey: ["device-control", "discovered-action", discoveredActionId],
    queryFn: () => getDiscoveredDeviceAction(discoveredActionId!),
    enabled: discoveredActionId != null,
    refetchInterval: query => query.state.data?.status === "SENT" ? 300 : false
  });

  React.useEffect(() => {
    const completedAction = discoveredActionQuery.data;
    if (completedAction?.status !== "SUCCESS") return;

    const targetKey = discoveredDeviceKey(completedAction.target);
    const result = completedAction.result ?? {};
    setDiscoveredDevices(current => current
      .map(device => discoveredDeviceKey(device) === targetKey ? { ...device, ...result } : device)
      .sort(compareDiscoveryIp));

    setSetNameTarget(null);
    setSetNameValue("");
    setPowerActionTarget(null);
    setPowerAction(null);
    setDiscoveredActionId(null);
    setNameMutation.reset();
    powerMutation.reset();
  }, [discoveredActionQuery.data?.status, discoveredActionQuery.data?.commandId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpened(true); };
  const openEdit = (agent: DeviceAgent) => { setEditing(agent); setForm({ name: agent.name, enabled: agent.enabled, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openCopy = (agent: DeviceAgent) => { setEditing(null); setForm({ name: `${agent.name} (copy)`, enabled: true, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openAgentUpdate = (agent: DeviceAgent) => {
    setUpdateTarget(agent);
    setUpdateVersion(agent.desiredVersion ?? versionsQuery.data?.agents.deviceAgent.latestVersion ?? agent.version ?? "");
    agentUpdateMutation.reset();
  };
  const openSupervisorUpdate = (agent: DeviceAgent) => {
    setSupervisorUpdateTarget(agent);
    setSupervisorUpdateVersion(agent.supervisorDesiredVersion ?? versionsQuery.data?.agents.supervisorAgent.latestVersion ?? agent.supervisorVersion ?? "");
    supervisorUpdateMutation.reset();
  };
  const openDiscovery = (agent: DeviceAgent) => {
    const providers = agent.capabilities.filter(capability => capability.discovery).map(capability => capability.provider);
    const savedProvider = typeof window === "undefined"
      ? null
      : window.localStorage.getItem(DEVICE_DISCOVERY_PROVIDER_STORAGE_KEY);
    const initialProvider = savedProvider
      ? providers.find(provider => provider.toUpperCase() === savedProvider.toUpperCase()) ?? providers[0] ?? null
      : providers[0] ?? null;

    setDiscoveryAgent(agent);
    setDiscoveryProvider(initialProvider);
    setDiscoveryId(null);
    setDiscoveredDevices([]);
  };
  const closeDiscovery = () => {
    setDiscoveryAgent(null);
    setDiscoveryProvider(null);
    setDiscoveryId(null);
    setSetNameTarget(null);
    setSetNameValue("");
    setDiscoveredActionId(null);
    setPowerActionTarget(null);
    setPowerAction(null);
    setDiscoveredDevices([]);
    discoveryMutation.reset();
    setNameMutation.reset();
    powerMutation.reset();
  };

  const sensorsphereUrl = typeof window === "undefined" ? "" : window.location.origin;
  const agentEnvironment = tokenInfo
    ? `SENSORSPHERE_URL=${sensorsphereUrl}\nSENSORSPHERE_DEVICE_AGENT_TOKEN=${tokenInfo.token}`
    : "";


  const openManagedAgents = (agent: DeviceAgent) => {
    setManagedTarget(agent);
    setManagedStatuses([]);
    setManagedVersion("");
    setManagedEnvironment("{}");
    managedMutation.reset();
    managedMutation.mutate({ agent, operation: "LIST" });
  };

  const registeredDeviceFor = (device: Record<string, unknown>): DeviceRegistryDevice | null => {
    const provider = discoveryProvider?.toUpperCase();
    const mac = normalizeMac(device.mac);
    const yeelightId = normalizeYeelightId(device.id);
    const hostname = typeof device.hostname === "string" ? device.hostname.trim().toLowerCase() : "";
    const proxmoxId = typeof device.providerId === "string" ? device.providerId.trim().toLowerCase() : "";

    return devices.find(existing => {
      const macMatch = mac && existing.identities.some(identity =>
        identity.identityType.toUpperCase() === "MAC"
        && normalizeMac(identity.value) === mac
      );
      if (provider === "PROXMOX") {
        return Boolean(proxmoxId && existing.identities.some(identity =>
          identity.identityType.toUpperCase() === "PROXMOX_ID"
          && identity.value.trim().toLowerCase() === proxmoxId
        ));
      }
      if (provider === "ESPHOME") {
        const hostnameMatch = hostname && existing.identities.some(identity =>
          ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
          && identity.value.trim().toLowerCase() === hostname
        );
        return Boolean(macMatch || hostnameMatch);
      }
      const idMatch = yeelightId && (
        existing.identities.some(identity =>
          identity.identityType.toUpperCase() === "YEELIGHT_ID"
          && normalizeYeelightId(identity.value) === yeelightId
        )
        || (existing.description ?? "").toLowerCase().includes(yeelightId)
      );
      return Boolean(idMatch || macMatch);
    }) ?? null;
  };

  const toggleDiscoverySort = (column: DiscoveryModalSortKey) => {
    if (discoverySortKey === column) {
      setDiscoverySortDirection(current => current === "asc" ? "desc" : "asc");
      return;
    }
    setDiscoverySortKey(column);
    setDiscoverySortDirection("asc");
  };

  const sortedDiscoveredDevices = React.useMemo(() => {
    const provider = discoveryProvider?.toUpperCase() ?? "";
    const valueFor = (device: Record<string, unknown>, column: DiscoveryModalSortKey): string | number => {
      const registered = registeredDeviceFor(device);
      const needsUpdate = registered ? discoveryNeedsRegistryUpdate(device, registered, discoveryAgent, discoveryProvider) : false;
      if (column === "registry") return registered ? (needsUpdate ? 1 : 2) : 0;
      if (column === "name") return discoveryValue(device, "name").toLowerCase();
      if (column === "ip") {
        const parts = ipv4SortValue(device.ip);
        return parts ? (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) : discoveryValue(device, "ip").toLowerCase();
      }
      if (column === "model") return discoveryValue(device, provider === "PROXMOX" ? "kind" : "model").toLowerCase();
      if (column === "power") return discoveryValue(device, provider === "PROXMOX" ? "status" : "power").toLowerCase();
      if (column === "brightness") return discoveryValue(device, provider === "PROXMOX" ? "node" : "brightness").toLowerCase();
      if (column === "entities") return discoveryValue(device, provider === "PROXMOX" ? (device.kind === "PBS_SERVER" ? "version" : "vmid") : "entities").toLowerCase();
      return discoveryValue(device, provider === "PROXMOX" ? "providerId" : "id").toLowerCase();
    };
    const compare = (left: string | number, right: string | number) => {
      if (typeof left === "number" && typeof right === "number") return left - right;
      return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
    };
    return [...discoveredDevices].sort((left, right) => {
      const result = compare(valueFor(left, discoverySortKey), valueFor(right, discoverySortKey));
      if (result !== 0) return discoverySortDirection === "asc" ? result : -result;
      return discoveryValue(left, "name").localeCompare(discoveryValue(right, "name"), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [discoveredDevices, discoverySortKey, discoverySortDirection, discoveryProvider, discoveryAgent, devices]);

  return <Stack gap="md" className="agent-admin-panel">
    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Device Agents</Text><Text size="xs" c="dimmed">Outbound WebSocket agents used for discovery and interactive device control.</Text></div><Button size="xs" onClick={openCreate}>Add Device Agent</Button></Group>
      <div className="monitoring-table-scroll"><Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
        <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th><Table.Th>Reported</Table.Th><Table.Th>Version</Table.Th>{showSupervisorControls && <Table.Th>Supervisor</Table.Th>}<Table.Th>System</Table.Th><Table.Th style={{ width: 110 }}>Last Seen</Table.Th><Table.Th>Capabilities</Table.Th><Table.Th>Agent Labels</Table.Th><Table.Th style={{ width: showSupervisorControls ? 202 : 160, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{(agentsQuery.data ?? []).map(agent => <Table.Tr key={agent.id}>
          <Table.Td><Text size="sm" fw={600}>{agent.name}</Text></Table.Td>
          <Table.Td><Badge color={agent.online ? "green" : agent.enabled ? "gray" : "red"} variant="light">{agent.online ? "ONLINE" : agent.enabled ? "OFFLINE" : "DISABLED"}</Badge></Table.Td>
          <Table.Td><Text size="sm">{agent.reportedName ?? "—"}</Text>{agent.hostname && <Text size="xs" c="dimmed">{agent.hostname}</Text>}</Table.Td>
          <Table.Td><Text size="sm">{agent.version ?? "—"}</Text><AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents.deviceAgent} /><Tooltip label={agent.updateError ?? (agent.supervisorAvailable ? "Supervisor Agent available" : "Supervisor Agent unavailable")}><Badge size="xs" variant="light" color={agent.updateStatus === "FAILED" ? "red" : agent.updateStatus === "UPDATED" ? "green" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? "blue" : agent.supervisorAvailable ? "teal" : "gray"}>{agent.updateStatus === "IDLE" ? (agent.supervisorAvailable ? "READY" : "NO SUPERVISOR") : agent.updateStatus}</Badge></Tooltip>{agent.desiredVersion && agent.desiredVersion !== agent.version && agent.updateStatus !== "UPDATED" && <Text size="xs" c="dimmed">Target {agent.desiredVersion}</Text>}</Table.Td>
          {showSupervisorControls && <Table.Td><Text size="sm">{agent.supervisorVersion ?? "—"}</Text><Tooltip label={agent.supervisorUpdateError ?? (agent.supervisorAvailable ? `Supervisor ${agent.supervisorContainerState ?? "available"}` : "Supervisor Agent unavailable")}><Badge size="xs" variant="light" color={!agent.supervisorAvailable ? "gray" : agent.supervisorUpdateStatus === "FAILED" ? "red" : agent.supervisorUpdateStatus === "UPDATED" ? "green" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus) ? "blue" : agent.supervisorSelfUpdateSupported ? "teal" : "gray"}>{agent.supervisorUpdateStatus === "IDLE" ? (agent.supervisorSelfUpdateSupported ? "READY" : agent.supervisorAvailable ? "NO SELF-UPDATE" : "OFFLINE") : agent.supervisorUpdateStatus}</Badge></Tooltip>{agent.supervisorDesiredVersion && agent.supervisorDesiredVersion !== agent.supervisorVersion && agent.supervisorUpdateStatus !== "UPDATED" && <Text size="xs" c="dimmed">Target {agent.supervisorDesiredVersion}</Text>}</Table.Td>}
          <Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td>
          <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{compactDate(agent.lastSeenAt)}</Text></Table.Td>
          <Table.Td><Group gap={8}>{agent.capabilities.length ? agent.capabilities.map(item => { const resolved=resolveProviderIcon(item.provider); return <Tooltip key={item.provider} label={`${item.provider} · ${item.actions.join(", ") || "No actions reported"}${item.discovery ? " · discovery" : ""}`}><span style={{ display: "inline-flex" }}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={22} /></span></Tooltip>; }) : <Text size="sm" c="dimmed">—</Text>}</Group></Table.Td>
          <Table.Td>{agent.agentLabels.length > 0 ? <Group gap={4} wrap="wrap">{agent.agentLabels.map(label => <Badge key={label} size="xs" variant="light" color="cyan">{label}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
          <Table.Td><Group gap={10} wrap="nowrap" justify="flex-end"><Tooltip label={agent.online ? "Discover devices" : "Device Agent must be online to discover"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Discover devices" disabled={!agent.online || !agent.capabilities.some(capability => capability.discovery)} onClick={() => openDiscovery(agent)}><RadarIcon size={16} /></ActionIcon></Tooltip><Tooltip label={!agent.online ? "Device Agent must be online to update" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? "An update is already in progress" : "Update Device Agent"}><ActionIcon size="sm" variant="light" color="violet" aria-label="Update Device Agent" disabled={!agent.online || !agent.supervisorAvailable || ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)} onClick={() => openAgentUpdate(agent)}><AgentUpdateIcon size={16} /></ActionIcon></Tooltip>{showSupervisorControls && <><Tooltip label={!agent.online ? "Device Agent must be online" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : !agent.supervisorSelfUpdateSupported ? "Supervisor Agent does not support self-update" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus) ? "Supervisor update already in progress" : "Update Supervisor Agent"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.supervisorAvailable || !agent.supervisorSelfUpdateSupported || ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus)} onClick={() => openSupervisorUpdate(agent)}><SupervisorUpdateIcon size={16} /></ActionIcon></Tooltip><Tooltip label={!agent.online ? "Device Agent must be online" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : "Managed agents"}><ActionIcon size="sm" variant="light" color="indigo" aria-label="Managed agents" disabled={!agent.online || !agent.supervisorAvailable} onClick={() => openManagedAgents(agent)}>M</ActionIcon></Tooltip></>}<Group gap={4} wrap="nowrap"><EditActionIcon onClick={() => openEdit(agent)} /><Tooltip label="Copy device agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy device agent" onClick={() => openCopy(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerate.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Group></Table.Td>
        </Table.Tr>)}{(agentsQuery.data ?? []).length === 0 && <Table.Tr><Table.Td colSpan={showSupervisorControls ? 10 : 9}><Text ta="center" c="dimmed" py="xl">No Device Agents yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
      </Table></div>
    </Card>

    <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "Edit Device Agent" : "Add Device Agent"} centered>
      <Stack><TextInput data-autofocus label="Name" required value={form.name} onChange={event => { const value = event.currentTarget.value; setForm(current => ({ ...current, name: value })); }} />
        <TextInput label="Managed labels" description="Comma separated. key=value or simple labels." value={form.labelsText} onChange={event => { const value = event.currentTarget.value; setForm(current => ({ ...current, labelsText: value })); }} />
        <NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={form.heartbeatTimeoutSeconds} onChange={value => setForm(current => ({ ...current, heartbeatTimeoutSeconds: Number(value) || 60 }))} />
        {editing && <Checkbox label="Enabled" checked={form.enabled} onChange={event => { const checked = event.currentTarget.checked; setForm(current => ({ ...current, enabled: checked })); }} />}
        <Group justify="flex-end"><Button variant="default" onClick={() => setOpened(false)}>Cancel</Button><Button disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={!!discoveryAgent} onClose={closeDiscovery} title={`Discover devices${discoveryAgent ? ` — ${discoveryAgent.name}` : ""}`} size={1035} centered>
      <Stack>
        <Group align="flex-end">
          <Select
            label="Provider"
            value={discoveryProvider}
            onChange={provider => {
              setDiscoveryProvider(provider);
              if (provider && typeof window !== "undefined") {
                window.localStorage.setItem(DEVICE_DISCOVERY_PROVIDER_STORAGE_KEY, provider);
              }
            }}
            data={(discoveryAgent?.capabilities ?? []).filter(capability => capability.discovery).map(capability => ({ value: capability.provider, label: capability.provider }))}
            leftSection={discoveryProvider ? <ResolvedIconGlyph resolved={resolveProviderIcon(discoveryProvider)} size={16} /> : undefined}
            renderOption={({ option }) => <Group gap={6} wrap="nowrap"><ResolvedIconGlyph resolved={resolveProviderIcon(option.value)} size={16} /><Text size="sm">{option.label}</Text></Group>}
            style={{ flex: 1 }}
          />
          <Button
            loading={discoveryMutation.isPending || discoveryQuery.data?.status === "SENT"}
            disabled={!discoveryProvider || !discoveryAgent?.online}
            onClick={() => discoveryAgent && discoveryProvider && discoveryMutation.mutate({ agentId: discoveryAgent.id, provider: discoveryProvider })}
          >
            Scan
          </Button>
        </Group>
        {discoveryMutation.isError && <Text c="red" size="sm">{discoveryMutation.error instanceof Error ? discoveryMutation.error.message : "Unable to start discovery"}</Text>}
        {discoveryQuery.data?.error && <Text c="red" size="sm">{discoveryQuery.data.error}</Text>}
        {updateRegisteredMutation.isError && <Text c="red" size="sm">{updateRegisteredMutation.error instanceof Error ? updateRegisteredMutation.error.message : "Unable to update registered device"}</Text>}
        {discoveryQuery.data?.status === "SENT" && <Text size="sm" c="dimmed">Discovery is running on the Device Agent…</Text>}
        {discoveryQuery.data?.status === "SUCCESS" && discoveredDevices.length === 0 && <Text size="sm" c="dimmed">No devices found.</Text>}
        {discoveredDevices.length ? (
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <Table striped highlightOnHover stickyHeader style={{ minWidth: 760 }}>
              <Table.Thead><Table.Tr><Table.Th>Actions</Table.Th><DiscoveryModalSortHeader label="Registry" column="registry" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label="Name" column="name" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label="IP" column="ip" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label={discoveryProvider?.toUpperCase() === "PROXMOX" ? "Type / OS" : "Model"} column="model" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label={discoveryProvider?.toUpperCase() === "PROXMOX" ? "Status / MAC" : "Power"} column="power" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label={discoveryProvider?.toUpperCase() === "PROXMOX" ? "Node" : "Brightness"} column="brightness" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label={discoveryProvider?.toUpperCase() === "PROXMOX" ? "VMID / Version" : "Entities"} column="entities" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /><DiscoveryModalSortHeader label="ID" column="id" activeColumn={discoverySortKey} direction={discoverySortDirection} onSort={toggleDiscoverySort} /></Table.Tr></Table.Thead>
              <Table.Tbody>{sortedDiscoveredDevices.map((device, index) => {
                const registeredDevice = registeredDeviceFor(device);
                const isYeelight = discoveryProvider?.toUpperCase() === "YEELIGHT";
                const isEspHome = discoveryProvider?.toUpperCase() === "ESPHOME";
                const isProxmox = discoveryProvider?.toUpperCase() === "PROXMOX";
                const power = device.power === true;
                const needsUpdate = registeredDevice ? discoveryNeedsRegistryUpdate(device, registeredDevice, discoveryAgent, discoveryProvider) : false;
                const updatingThisDevice = updateRegisteredMutation.isPending && updateRegisteredMutation.variables?.registered.id === registeredDevice?.id;
                const actionBusy = discoveredActionQuery.data?.status === "SENT" || setNameMutation.isPending || powerMutation.isPending || updatingThisDevice;
                return <Table.Tr key={`${discoveryValue(device, "id")}-${index}`}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Set name">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="blue"
                        aria-label="Set name"
                        disabled={!isYeelight || discoveryValue(device, "ip") === "—" || actionBusy}
                        onClick={() => {
                          setSetNameTarget(device);
                          const currentName = discoveryValue(device, "name");
                          setSetNameValue(currentName === "—" ? "" : currentName);
                          setDiscoveredActionId(null);
                          setNameMutation.reset();
                        }}
                      >
                        ✎
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={power ? "Turn off to identify device" : "Turn on to identify device"}>
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color={power ? "orange" : "green"}
                        aria-label={power ? "Turn off" : "Turn on"}
                        loading={discoveredDeviceKey(powerActionTarget ?? {}) === discoveredDeviceKey(device) && powerMutation.isPending}
                        disabled={!isYeelight || discoveryValue(device, "ip") === "—" || actionBusy}
                        onClick={() => powerMutation.mutate({ device, action: power ? "POWER_OFF" : "POWER_ON" })}
                      >
                        ⏻
                      </ActionIcon>
                    </Tooltip>
                    {registeredDevice ? (
                      <>
                        {needsUpdate && (
                          <Tooltip label="Update registered device from discovery">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color="cyan"
                              aria-label="Update registered device"
                              loading={updatingThisDevice}
                              disabled={!onUpdateDiscoveredDevice || !discoveryAgent || !discoveryProvider}
                              onClick={() => discoveryAgent && discoveryProvider && updateRegisteredMutation.mutate({
                                request: { agent: discoveryAgent, provider: discoveryProvider, device },
                                registered: registeredDevice
                              })}
                            >
                              ↻
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <EditActionIcon onClick={() => onOpenRegisteredDevice?.(registeredDevice)} />
                      </>
                    ) : (
                      <Tooltip label="Add to Device Registry">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="cyan"
                          aria-label="Add to Device Registry"
                          disabled={!onImportDiscoveredDevice}
                          onClick={() => discoveryAgent && discoveryProvider && onImportDiscoveredDevice?.({ agent: discoveryAgent, provider: discoveryProvider, device })}
                        >
                          ＋
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{registeredDevice ? <Badge size="sm" variant="light" color={needsUpdate ? "orange" : "green"}>{needsUpdate ? "Needs update" : "Registered"}</Badge> : <Badge size="sm" variant="light" color="gray">New</Badge>}</Table.Td>
                <Table.Td>{discoveryValue(device, "name")}</Table.Td>
                <Table.Td><Text ff="monospace" size="sm">{discoveryValue(device, "ip")}</Text></Table.Td>
                <Table.Td>{isProxmox ? <><Text size="sm">{discoveryValue(device, "kind")}</Text><Text size="xs" c="dimmed">{discoveryValue(device, "os")}</Text></> : discoveryValue(device, "model")}</Table.Td>
                <Table.Td>{isProxmox ? <><Text size="sm">{discoveryValue(device, "status")}</Text><Text size="xs" c="dimmed">{discoveryValue(device, "mac")}</Text></> : discoveryValue(device, "power")}</Table.Td>
                <Table.Td>{isProxmox ? discoveryValue(device, "node") : discoveryValue(device, "brightness")}</Table.Td>
                <Table.Td><Text size="xs">{isEspHome ? discoveryValue(device, "entities") : isProxmox ? discoveryValue(device, device.kind === "PBS_SERVER" ? "version" : "vmid") : "—"}</Text></Table.Td>
                <Table.Td><Text ff="monospace" size="xs">{isProxmox ? discoveryValue(device, "providerId") : discoveryValue(device, "id")}</Text></Table.Td>
              </Table.Tr>;
              })}</Table.Tbody>
            </Table>
          </div>
        ) : null}
        <Group justify="flex-end"><Button variant="default" onClick={closeDiscovery}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal
      opened={!!setNameTarget}
      onClose={() => { setSetNameTarget(null); setDiscoveredActionId(null); setNameMutation.reset(); }}
      title="Set Yeelight name"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">{discoveryValue(setNameTarget ?? {}, "ip")}</Text>
        <TextInput
          data-autofocus
          label="Name"
          required
          maxLength={64}
          value={setNameValue}
          onChange={event => setSetNameValue(event.currentTarget.value)}
        />
        {setNameMutation.isError && <Text c="red" size="sm">{setNameMutation.error instanceof Error ? setNameMutation.error.message : "Unable to set name"}</Text>}
        {discoveredActionQuery.data?.status === "FAILED" && <Text c="red" size="sm">{discoveredActionQuery.data.error ?? "Unable to set name"}</Text>}
        {discoveredActionQuery.data?.status === "TIMEOUT" && <Text c="red" size="sm">Set name timed out.</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => { setSetNameTarget(null); setDiscoveredActionId(null); setNameMutation.reset(); }}>Cancel</Button>
          <Button
            loading={setNameMutation.isPending || discoveredActionQuery.data?.status === "SENT"}
            disabled={!setNameValue.trim() || setNameValue.trim().length > 64}
            onClick={() => setNameMutation.mutate()}
          >
            Set name
          </Button>
        </Group>
      </Stack>
    </Modal>

    {showSupervisorControls && <>
    <Modal opened={managedTarget != null} onClose={() => { setManagedTarget(null); setManagedStatuses([]); managedMutation.reset(); }} title={`Managed Agents${managedTarget ? ` — ${managedTarget.name}` : ""}`} size="xl" centered>
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Agents installed and controlled by the local Supervisor Agent.</Text>
          <Button size="xs" variant="light" loading={managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "LIST" })}>Refresh</Button>
        </Group>
        {managedMutation.isError && <Text c="red" size="sm">{managedMutation.error instanceof Error ? managedMutation.error.message : "Managed Agent operation failed"}</Text>}
        <Table striped withTableBorder>
          <Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>Instance</Table.Th><Table.Th>Version</Table.Th><Table.Th>State</Table.Th><Table.Th style={{ textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {managedStatuses.map(status => <Table.Tr key={`${status.agent_type}/${status.instance}`}>
              <Table.Td>{status.agent_type}</Table.Td>
              <Table.Td><Text ff="monospace" size="sm">{status.instance}</Text></Table.Td>
              <Table.Td>{status.configured_version ?? "—"}</Table.Td>
              <Table.Td><Badge size="xs" variant="light" color={status.container_state === "running" ? "green" : "gray"}>{status.container_state}</Badge></Table.Td>
              <Table.Td><Group gap={4} justify="flex-end">
                <Button size="compact-xs" variant="light" onClick={() => { setManagedVersion(status.configured_version ?? ""); }} disabled={managedMutation.isPending}>Select</Button>
                <Button size="compact-xs" color="violet" variant="light" disabled={!managedVersion.trim() || managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "UPDATE", status })}>Update</Button>
                <Button size="compact-xs" color="red" variant="light" disabled={(status.agent_type === "device-agent" && status.instance === "main") || managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "REMOVE", status })}>Remove</Button>
              </Group></Table.Td>
            </Table.Tr>)}
            {!managedStatuses.length && !managedMutation.isPending && <Table.Tr><Table.Td colSpan={5}><Text ta="center" c="dimmed">No managed agents reported.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600} size="sm">Deploy managed agent</Text>
            <Group grow align="flex-end">
              <Select label="Agent type" value={managedAgentType} onChange={value => setManagedAgentType((value as "device-agent" | "monitor-agent") ?? "monitor-agent")} data={[{ value: "monitor-agent", label: "Monitoring Agent" }, { value: "device-agent", label: "Device Agent" }]} />
              <TextInput label="Instance" value={managedInstance} onChange={event => setManagedInstance(event.currentTarget.value)} placeholder="main or i2" />
              <TextInput label="Version" value={managedVersion} onChange={event => setManagedVersion(event.currentTarget.value)} placeholder="1.0.0" />
            </Group>
            <Textarea label="Environment (JSON)" description="Required deployment variables are validated by the Supervisor. Secrets are sent only to the target host." minRows={4} autosize value={managedEnvironment} onChange={event => setManagedEnvironment(event.currentTarget.value)} placeholder={'{"SENSORSPHERE_URL":"http://na-01:8080","SENSORSPHERE_AGENT_TOKEN":"..."}'} />
            <Group justify="flex-end"><Button loading={managedMutation.isPending} disabled={!managedInstance.trim() || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(managedVersion.trim())} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "DEPLOY" })}>Deploy</Button></Group>
          </Stack>
        </Card>
        <Group justify="flex-end"><Button variant="default" onClick={() => setManagedTarget(null)}>Close</Button></Group>
      </Stack>
    </Modal>

    </>}

    <Modal opened={updateTarget != null} onClose={() => { setUpdateTarget(null); setUpdateVersion(""); agentUpdateMutation.reset(); }} title="Update Device Agent" centered>
      <Stack>
        <Text size="sm">Update <strong>{updateTarget?.name}</strong>{updateTarget?.version ? ` from ${updateTarget.version}` : ""} to the requested version through its Supervisor Agent.</Text>
        <TextInput label="Target version" placeholder="1.2.1" value={updateVersion} onChange={event => setUpdateVersion(event.currentTarget.value)} autoFocus />
        {agentUpdateMutation.isError && <Text c="red" size="sm">{agentUpdateMutation.error instanceof Error ? agentUpdateMutation.error.message : "Unable to request Device Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => { setUpdateTarget(null); setUpdateVersion(""); agentUpdateMutation.reset(); }}>Cancel</Button><Button color="violet" loading={agentUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim())} onClick={() => updateTarget && agentUpdateMutation.mutate({ agentId: updateTarget.id, version: updateVersion.trim() })}>Update</Button></Group>
      </Stack>
    </Modal>

    {showSupervisorControls && <>
    <Modal opened={supervisorUpdateTarget != null} onClose={() => { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); supervisorUpdateMutation.reset(); }} title="Update Supervisor Agent" centered>
      <Stack>
        <Text size="sm">Update the Supervisor Agent for <strong>{supervisorUpdateTarget?.name}</strong>{supervisorUpdateTarget?.supervisorVersion ? ` from ${supervisorUpdateTarget.supervisorVersion}` : ""} to the requested version.</Text>
        <TextInput label="Target version" placeholder="0.3.1" value={supervisorUpdateVersion} onChange={event => setSupervisorUpdateVersion(event.currentTarget.value)} autoFocus />
        {supervisorUpdateMutation.isError && <Text c="red" size="sm">{supervisorUpdateMutation.error instanceof Error ? supervisorUpdateMutation.error.message : "Unable to request Supervisor Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); supervisorUpdateMutation.reset(); }}>Cancel</Button><Button color="teal" loading={supervisorUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(supervisorUpdateVersion.trim())} onClick={() => supervisorUpdateTarget && supervisorUpdateMutation.mutate({ agentId: supervisorUpdateTarget.id, version: supervisorUpdateVersion.trim() })}>Update</Button></Group>
      </Stack>
    </Modal>

    </>}

    <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Device Agent?" centered>
      <Stack><Text>Delete <strong>{deleteTarget?.name}</strong>? Devices assigned to it will keep their provider but lose the Device Agent association.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Delete</Button></Group></Stack>
    </Modal>

    {copyNotice && (
      <Notification color="green" title="Copied" onClose={() => setCopyNotice(null)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 10000, width: 320 }}>
        {copyNotice}
      </Notification>
    )}

    <Modal opened={!!tokenInfo} onClose={() => setTokenInfo(null)} title="Device Agent token" size="lg">
      <Stack>
        <Text size="sm">Copy this token now. SensorSphere stores only its hash and cannot display it again.</Text>
        <TextInput
          label="Token"
          readOnly
          value={tokenInfo?.token ?? ""}
          styles={{ input: { fontFamily: "monospace" } }}
          rightSection={
            <Tooltip label="Copy token">
              <ActionIcon
                color="green"
                variant="subtle"
                aria-label="Copy token"
                onClick={() => { if (!tokenInfo) return; void writeClipboardText(tokenInfo.token).then(() => showCopyNotice("Token copied to clipboard")); }}
              >
                ⧉
              </ActionIcon>
            </Tooltip>
          }
        />
        <Stack gap={4}>
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>Agent environment variables</Text>
            <Tooltip label="Copy SensorSphere URL and token">
              <ActionIcon
                color="green"
                variant="subtle"
                aria-label="Copy SensorSphere URL and token"
                onClick={() => { if (!tokenInfo) return; void writeClipboardText(agentEnvironment).then(() => showCopyNotice("Agent environment copied to clipboard")); }}
              >
                ⧉
              </ActionIcon>
            </Tooltip>
          </Group>
          <Code block>{agentEnvironment}</Code>
        </Stack>
        <Group justify="flex-end"><Button onClick={() => setTokenInfo(null)}>Close</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
