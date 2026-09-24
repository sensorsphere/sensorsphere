import React from "react";
import { ActionIcon, Badge, Button, Card, Checkbox, Code, Group, Modal, Notification, NumberInput, Select, Stack, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceAgent, deleteDeviceAgent, deleteSupervisorManagedAgentAssignment, getDeviceAgents, getDeviceDiscovery, getDiscoveredDeviceAction, regenerateDeviceAgentToken, checkDeviceAgentToken, requestDeviceAgentUpdate, requestSupervisorAgentUpdate, runManagedAgentOperation, runSupervisorManagedAgentOperation, startDeviceDiscovery, startDiscoveredDeviceAction, updateDeviceAgent, getDeviceAgentProxmoxConfig, saveDeviceAgentProxmoxConfig, deleteDeviceAgentProxmoxConfig, type ProxmoxEndpointConfigDto } from "./api";
import { ResolvedIconGlyph, resolveProviderIcon } from "./ResolvedDeviceIcon";
import { DeviceGlyph } from "./DeviceGlyph";
import type { AgentTokenCheckResult, DeviceAgent, DeviceDiscovery, DeviceRegistryDevice, DiscoveredDeviceAction, ManagedAgentStatus } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability, UpdateLifecycleAge } from "./AgentVersionAvailability";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { FilterClearAction } from "./FilterClearAction";
import { getAutonomousSupervisors } from "./SupervisorAgentsPanel";
import { HostNetworkCell } from "./HostNetworkCell";
import { hasAgentUpdate } from "./AgentBulkUpdate";



const ACTIVE_UPDATE_STATES = ["UPDATE_REQUESTED", "REQUESTED", "UPDATING", "VERIFYING"];

function updateAge(value: string | null): string {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return value;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "less than 1 minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function CheckTokenIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ProxmoxConfigIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h9M4 12h16M4 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="13" cy="17" r="2" stroke="currentColor" strokeWidth="1.6"/></svg>;
}

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
      <path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.7 6.5 9.2 3.7-1.5 6.5-5 6.5-9.2V6L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.3 2.3M12 9l2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

type DeviceAgentSortKey = "name" | "status" | "reported" | "version" | "system" | "lastSeen" | "capabilities" | "labels" | "agentLabels";

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
  const supervisorsQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const [opened, setOpened] = React.useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = React.useState(false);
  const [proxmoxTarget, setProxmoxTarget] = React.useState<DeviceAgent | null>(null);
  const [proxmoxEndpoints, setProxmoxEndpoints] = React.useState<ProxmoxEndpointConfigDto[]>([]);
  const [proxmoxLoading, setProxmoxLoading] = React.useState(false);
  const [proxmoxError, setProxmoxError] = React.useState<string | null>(null);
  const [proxmoxTestResult, setProxmoxTestResult] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<DeviceAgent | null>(null);
  const [form, setForm] = React.useState<AgentFormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ name: string; token: string } | null>(null);
  const [tokenCheckResult, setTokenCheckResult] = React.useState<{ name: string; result: AgentTokenCheckResult } | null>(null);
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
  const [agentNameFilter, setAgentNameFilter] = usePersistentState("device-control.agents.filter.name", "");
  const [agentStatusFilter, setAgentStatusFilter] = usePersistentState<string | null>("device-control.agents.filter.status", null);
  const [agentReportedFilter, setAgentReportedFilter] = usePersistentState("device-control.agents.filter.reported", "");
  const [agentLabelsFilter, setAgentLabelsFilter] = usePersistentState("device-control.agents.filter.labels", "");
  const [agentSortKey, setAgentSortKey] = usePersistentState<DeviceAgentSortKey>("device-control.agents.sort.key", "name");
  const [agentSortDirection, setAgentSortDirection] = usePersistentState<SortDirection>("device-control.agents.sort.direction", "asc");

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
  const remove = useMutation({
    mutationFn: async (agent: DeviceAgent) => {
      if (agent.managedBySupervisorId) {
        await runSupervisorManagedAgentOperation(agent.managedBySupervisorId, {
          operation: "REMOVE",
          agentType: "device-agent",
          agentId: agent.id,
          instance: agent.managedInstance ?? "main"
        });
      }
      if (agent.managedAssociationId) await deleteSupervisorManagedAgentAssignment(agent.managedAssociationId);
      await deleteDeviceAgent(agent.id);
    },
    onSuccess: async () => { setDeleteTarget(null); await refresh(); }
  });
  const regenerate = useMutation({ mutationFn: (agent: DeviceAgent) => regenerateDeviceAgentToken(agent.id), onSuccess: async result => { setTokenInfo({ name: result.agent.name, token: result.token }); await refresh(); } });
  const checkToken = useMutation({ mutationFn: (agent: DeviceAgent) => checkDeviceAgentToken(agent.id), onSuccess: (result, agent) => setTokenCheckResult({ name: agent.name, result }) });
  const agentUpdateMutation = useMutation({
    mutationFn: ({ agentId, version, closeOnSuccess = false }: { agentId: string; version: string; closeOnSuccess?: boolean }) => requestDeviceAgentUpdate(agentId, version).then(result => ({ result, closeOnSuccess })),
    onMutate: async ({ agentId, version }) => {
      await queryClient.cancelQueries({ queryKey: ["device-control", "agents"] });
      const now = new Date().toISOString();
      queryClient.setQueryData<DeviceAgent[]>(["device-control", "agents"], current => current?.map(agent => agent.id === agentId ? { ...agent, desiredVersion: version, updateStatus: "UPDATE_REQUESTED", updateRequestedAt: now, updateStartedAt: null, updateFinishedAt: null, updateError: null } : agent));
    },
    onSuccess: async ({ closeOnSuccess }) => { if (closeOnSuccess) { setUpdateTarget(null); setUpdateVersion(""); } await refresh(); },
    onError: async () => { await refresh(); }
  });
  const bulkDeviceUpdateMutation = useMutation({
    mutationFn: async (agents: DeviceAgent[]) => {
      const latest = versionsQuery.data?.agents.deviceAgent.latestVersion;
      if (!latest) throw new Error("Latest Device Agent version is unavailable");
      for (const agent of agents) await requestDeviceAgentUpdate(agent.id, latest);
    },
    onSuccess: async () => { setBulkUpdateOpen(false); await refresh(); }
  });
  const supervisorUpdateMutation = useMutation({
    mutationFn: ({ agentId, version, closeOnSuccess = false }: { agentId: string; version: string; closeOnSuccess?: boolean }) => requestSupervisorAgentUpdate(agentId, version).then(result => ({ result, closeOnSuccess })),
    onSuccess: async ({ closeOnSuccess }) => { if (closeOnSuccess) { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); } await refresh(); }
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

  const allAgents = agentsQuery.data ?? [];
  const toggleAgentSort = (key: DeviceAgentSortKey) => {
    if (agentSortKey === key) setAgentSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setAgentSortKey(key); setAgentSortDirection("asc"); }
  };
  const filteredAgents = allAgents.filter(agent => {
    const status = !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const reported = `${agent.reportedName ?? ""} ${agent.hostname ?? ""}`.toLowerCase();
    const labels = `${Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(" ")} ${agent.agentLabels.join(" ")}`.toLowerCase();
    return (!agentNameFilter.trim() || agent.name.toLowerCase().includes(agentNameFilter.trim().toLowerCase()))
      && (!agentStatusFilter || status === agentStatusFilter)
      && (!agentReportedFilter.trim() || reported.includes(agentReportedFilter.trim().toLowerCase()))
      && (!agentLabelsFilter.trim() || labels.includes(agentLabelsFilter.trim().toLowerCase()));
  }).sort((left, right) => {
    const status = (agent: DeviceAgent) => !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const value = (agent: DeviceAgent) => agentSortKey === "name" ? agent.name
      : agentSortKey === "status" ? status(agent)
      : agentSortKey === "reported" ? `${agent.reportedName ?? ""} ${agent.hostname ?? ""}`
      : agentSortKey === "version" ? agent.version
      : agentSortKey === "system" ? `${agent.os ?? ""} ${agent.osVersion ?? ""} ${agent.architecture ?? ""}`
      : agentSortKey === "lastSeen" ? agent.lastSeenAt
      : agentSortKey === "capabilities" ? agent.capabilities.map(item => item.provider).join(",")
      : agentSortKey === "labels" ? Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(",")
      : agent.agentLabels.join(",");
    return compareTableValues(value(left), value(right), agentSortDirection);
  });
  const agentFiltersActive = Boolean(agentNameFilter || agentStatusFilter || agentReportedFilter || agentLabelsFilter);
  const latestDeviceVersion = versionsQuery.data?.agents.deviceAgent.latestVersion ?? null;
  const bulkDeviceCandidates = allAgents.filter(agent => agent.online && agent.enabled && !ACTIVE_UPDATE_STATES.includes(agent.updateStatus) && hasAgentUpdate(agent.version, latestDeviceVersion));
  const supervisorById = new Map((supervisorsQuery.data ?? []).map(supervisor => [supervisor.id, supervisor]));

  const proxmoxConfigPayload = (endpoints: ProxmoxEndpointConfigDto[]): ProxmoxEndpointConfigDto[] => endpoints.map(endpoint => ({
    id: endpoint.id,
    product: endpoint.product,
    url: endpoint.url,
    tokenId: endpoint.tokenId,
    ...(endpoint.originalId ? { originalId: endpoint.originalId } : {}),
    ...(endpoint.tokenSecret ? { tokenSecret: endpoint.tokenSecret } : {}),
    verifyTls: endpoint.verifyTls
  }));

  const openProxmoxConfig = async (agent: DeviceAgent) => {
    setProxmoxTarget(agent); setProxmoxEndpoints([]); setProxmoxError(null); setProxmoxTestResult(null); setProxmoxLoading(true);
    try {
      const config = await getDeviceAgentProxmoxConfig(agent.id);
      setProxmoxEndpoints(config.endpoints.map(endpoint => ({ ...endpoint, originalId: endpoint.id, tokenSecret: "" })));
    } catch (error) { setProxmoxError(error instanceof Error ? error.message : "Unable to load Proxmox configuration"); }
    finally { setProxmoxLoading(false); }
  };
  const saveProxmoxConfig = async () => {
    if (!proxmoxTarget) return;
    setProxmoxLoading(true); setProxmoxError(null); setProxmoxTestResult(null);
    try {
      const saved = await saveDeviceAgentProxmoxConfig(proxmoxTarget.id, proxmoxConfigPayload(proxmoxEndpoints));
      setProxmoxEndpoints(saved.endpoints.map(endpoint => ({ ...endpoint, originalId: endpoint.id, tokenSecret: "" })));
      await refresh();
    } catch (error) { setProxmoxError(error instanceof Error ? error.message : "Unable to save Proxmox configuration"); }
    finally { setProxmoxLoading(false); }
  };
  const removeProxmoxConfig = async () => {
    if (!proxmoxTarget) return;
    setProxmoxLoading(true); setProxmoxError(null);
    try { await deleteDeviceAgentProxmoxConfig(proxmoxTarget.id); setProxmoxEndpoints([]); await refresh(); }
    catch (error) { setProxmoxError(error instanceof Error ? error.message : "Unable to delete Proxmox configuration"); }
    finally { setProxmoxLoading(false); }
  };
  const waitForDeviceAgentOnline = async (agentId: string, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const agent = (await getDeviceAgents()).find(item => item.id === agentId);
      if (agent?.online) return;
      await new Promise(resolve => window.setTimeout(resolve, 500));
    }
    throw new Error("Device Agent did not reconnect after applying the Proxmox configuration");
  };

  const testProxmoxConfig = async () => {
    if (!proxmoxTarget) return;
    setProxmoxLoading(true); setProxmoxError(null); setProxmoxTestResult(null);
    try {
      await saveDeviceAgentProxmoxConfig(proxmoxTarget.id, proxmoxConfigPayload(proxmoxEndpoints));
      await waitForDeviceAgentOnline(proxmoxTarget.id);
      let discovery = await startDeviceDiscovery(proxmoxTarget.id, "PROXMOX", 8);
      const deadline = Date.now() + 20_000;
      while (discovery.status === "SENT" && Date.now() < deadline) { await new Promise(resolve => window.setTimeout(resolve, 500)); discovery = await getDeviceDiscovery(discovery.commandId); }
      if (discovery.status !== "SUCCESS") throw new Error(discovery.error ?? `Proxmox test ${discovery.status.toLowerCase()}`);
      setProxmoxTestResult(`Connection OK · ${discovery.devices.length} object(s) discovered`);
      await refresh();
    } catch (error) { setProxmoxError(error instanceof Error ? error.message : "Proxmox connection test failed"); }
    finally { setProxmoxLoading(false); }
  };

  return <Stack gap="md" className="agent-admin-panel">
    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Device Agents</Text><Text size="xs" c="dimmed">Outbound WebSocket agents used for discovery and interactive device control.</Text></div><Group gap="xs"><Button size="xs" variant="light" color="teal" disabled={bulkDeviceCandidates.length === 0} onClick={() => setBulkUpdateOpen(true)}>Update All ({bulkDeviceCandidates.length})</Button><Button size="xs" onClick={openCreate}>Add Device Agent</Button></Group></Group>
      <Group gap="xs" mb="sm" wrap="wrap">
        <ResetFiltersAction active={agentFiltersActive} onReset={() => { setAgentNameFilter(""); setAgentStatusFilter(null); setAgentReportedFilter(""); setAgentLabelsFilter(""); }} />
        <TextInput size="xs" placeholder="Filter name" value={agentNameFilter} onChange={event => setAgentNameFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentNameFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentNameFilter.trim())} onClear={() => setAgentNameFilter("")} />} w={180} />
        <Select size="xs" clearable placeholder="Status" data={["ONLINE","OFFLINE","DISABLED"]} value={agentStatusFilter} onChange={setAgentStatusFilter} styles={activeFilterStyles(Boolean(agentStatusFilter))} w={140} />
        <TextInput size="xs" placeholder="Reported / host" value={agentReportedFilter} onChange={event => setAgentReportedFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentReportedFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentReportedFilter.trim())} onClear={() => setAgentReportedFilter("")} />} w={180} />
        <TextInput size="xs" placeholder="Labels" value={agentLabelsFilter} onChange={event => setAgentLabelsFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentLabelsFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentLabelsFilter.trim())} onClear={() => setAgentLabelsFilter("")} />} w={200} />
        <Text size="xs" c="dimmed">{filteredAgents.length}/{allAgents.length}</Text>
      </Group>
      <div className="monitoring-table-scroll"><Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
        <Table.Thead><Table.Tr><SortableTableHeader active={agentSortKey === "name"} direction={agentSortDirection} onClick={() => toggleAgentSort("name")}>Name</SortableTableHeader><SortableTableHeader active={agentSortKey === "status"} direction={agentSortDirection} onClick={() => toggleAgentSort("status")}>Status</SortableTableHeader><SortableTableHeader active={agentSortKey === "reported"} direction={agentSortDirection} onClick={() => toggleAgentSort("reported")}>Reported</SortableTableHeader><SortableTableHeader active={agentSortKey === "version"} direction={agentSortDirection} onClick={() => toggleAgentSort("version")}>Version</SortableTableHeader>{showSupervisorControls && <Table.Th>Supervisor</Table.Th>}<SortableTableHeader active={agentSortKey === "system"} direction={agentSortDirection} onClick={() => toggleAgentSort("system")}>System</SortableTableHeader><Table.Th>Host Network</Table.Th><SortableTableHeader active={agentSortKey === "lastSeen"} direction={agentSortDirection} onClick={() => toggleAgentSort("lastSeen")}>Last Seen</SortableTableHeader><SortableTableHeader active={agentSortKey === "capabilities"} direction={agentSortDirection} onClick={() => toggleAgentSort("capabilities")}>Capabilities</SortableTableHeader><SortableTableHeader active={agentSortKey === "agentLabels"} direction={agentSortDirection} onClick={() => toggleAgentSort("agentLabels")}>Agent Labels</SortableTableHeader><Table.Th style={{ width: showSupervisorControls ? 202 : 160, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{filteredAgents.map(agent => <Table.Tr key={agent.id}>
          <Table.Td><Text size="sm" fw={600}>{agent.name}</Text>{agent.managedBySupervisorName ? <Text size="xs" c="dimmed">Supervisor: {agent.managedBySupervisorName}{agent.managedInstance && agent.managedInstance !== "main" ? ` / ${agent.managedInstance}` : ""}</Text> : <Text size="xs" c="orange">[No supervisor]</Text>}</Table.Td>
          <Table.Td><Badge color={agent.online ? "green" : agent.enabled ? "gray" : "red"} variant="light">{agent.online ? "ONLINE" : agent.enabled ? "OFFLINE" : "DISABLED"}</Badge></Table.Td>
          <Table.Td><Text size="sm">{agent.reportedName ?? "—"}</Text>{agent.hostname && <Text size="xs" c="dimmed">{agent.hostname}</Text>}</Table.Td>
          <Table.Td><Text size="sm">{agent.version ?? "—"}</Text>{ACTIVE_UPDATE_STATES.includes(agent.updateStatus) ? <><Badge size="xs" variant="light" color="blue">{agent.updateStatus}</Badge><UpdateLifecycleAge status={agent.updateStatus} timestamp={agent.updateStatus === "UPDATE_REQUESTED" || agent.updateStatus === "REQUESTED" ? agent.updateRequestedAt ?? agent.updateStartedAt : agent.updateStartedAt ?? agent.updateRequestedAt} />{agent.desiredVersion && <Text size="xs" c="dimmed">Target {agent.desiredVersion}</Text>}</> : <><AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents.deviceAgent} />{agent.updateStatus === "FAILED" && <><Tooltip label={agent.updateError ?? "Device Agent update failed"}><Badge size="xs" variant="light" color="red">FAILED</Badge></Tooltip><UpdateLifecycleAge status="FAILED" timestamp={agent.updateFinishedAt} label="failed" /></>}{agent.lastSuccessfulUpdateAt && <Text size="xs" c="dimmed" title={agent.lastSuccessfulUpdateAt}>Updated {updateAge(agent.lastSuccessfulUpdateAt)}</Text>}</>}</Table.Td>
          {showSupervisorControls && <Table.Td><Text size="sm">{agent.supervisorVersion ?? "—"}</Text><Tooltip label={agent.supervisorUpdateError ?? (agent.supervisorAvailable ? `Supervisor ${agent.supervisorContainerState ?? "available"}` : "Supervisor Agent unavailable")}><Badge size="xs" variant="light" color={!agent.supervisorAvailable ? "gray" : agent.supervisorUpdateStatus === "FAILED" ? "red" : agent.supervisorUpdateStatus === "UPDATED" ? "green" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus) ? "blue" : agent.supervisorSelfUpdateSupported ? "teal" : "gray"}>{agent.supervisorUpdateStatus === "IDLE" ? (agent.supervisorSelfUpdateSupported ? "READY" : agent.supervisorAvailable ? "NO SELF-UPDATE" : "OFFLINE") : agent.supervisorUpdateStatus}</Badge></Tooltip>{agent.supervisorDesiredVersion && agent.supervisorDesiredVersion !== agent.supervisorVersion && agent.supervisorUpdateStatus !== "UPDATED" && <Text size="xs" c="dimmed">Target {agent.supervisorDesiredVersion}</Text>}</Table.Td>}
          <Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td><Table.Td><HostNetworkCell networks={agent.hostNetworks.length > 0 ? agent.hostNetworks : agent.managedBySupervisorId ? supervisorById.get(agent.managedBySupervisorId)?.hostNetworks : undefined} /></Table.Td>
          <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{compactDate(agent.lastSeenAt)}</Text></Table.Td>
          <Table.Td><Group gap={8}>{agent.capabilities.map(item => { const resolved=resolveProviderIcon(item.provider); return <Tooltip key={item.provider} label={`${item.provider} · ${item.actions.join(", ") || "No actions reported"}${item.discovery ? " · discovery" : ""}`}><span style={{ display: "inline-flex" }}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={22} /></span></Tooltip>; })}{!agent.capabilities.some(item => item.provider.toLowerCase() === "proxmox") && (() => { const resolved=resolveProviderIcon("proxmox"); return <Tooltip label="No Proxmox server configured on this agent"><span style={{ display: "inline-flex", filter: "grayscale(1)", opacity: 0.35 }}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={22} /></span></Tooltip>; })()}</Group></Table.Td>

          <Table.Td>{agent.agentLabels.length > 0 ? <Group gap={4} wrap="wrap">{agent.agentLabels.map(label => <Badge key={label} size="xs" variant="light" color="cyan">{label}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
          <Table.Td><Group gap={10} wrap="nowrap" justify="flex-end"><Tooltip label={agent.managedBySupervisorId ? "Configure Proxmox" : "Proxmox configuration requires a Supervisor-managed Device Agent"}><ActionIcon size="sm" variant="light" color="orange" aria-label="Configure Proxmox" disabled={!agent.managedBySupervisorId} onClick={() => openProxmoxConfig(agent)}><ProxmoxConfigIcon /></ActionIcon></Tooltip><Tooltip label={agent.online ? "Discover devices" : "Device Agent must be online to discover"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Discover devices" disabled={!agent.online || !agent.capabilities.some(capability => capability.discovery)} onClick={() => openDiscovery(agent)}><RadarIcon size={16} /></ActionIcon></Tooltip><Tooltip label={!agent.online ? "Device Agent must be online to update" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? "An update is already in progress" : "Update Device Agent"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Device Agent" disabled={!agent.online || ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)} onClick={() => openAgentUpdate(agent)}><AgentUpdateIcon size={16} /></ActionIcon></Tooltip>{showSupervisorControls && <><Tooltip label={!agent.online ? "Device Agent must be online" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : !agent.supervisorSelfUpdateSupported ? "Supervisor Agent does not support self-update" : ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus) ? "Supervisor update already in progress" : "Update Supervisor Agent"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.supervisorAvailable || !agent.supervisorSelfUpdateSupported || ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus)} onClick={() => openSupervisorUpdate(agent)}><SupervisorUpdateIcon size={16} /></ActionIcon></Tooltip><Tooltip label={!agent.online ? "Device Agent must be online" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : "Managed agents"}><ActionIcon size="sm" variant="light" color="indigo" aria-label="Managed agents" disabled={!agent.online || !agent.supervisorAvailable} onClick={() => openManagedAgents(agent)}>M</ActionIcon></Tooltip></>}<Group gap={4} wrap="nowrap"><EditActionIcon onClick={() => openEdit(agent)} /><Tooltip label="Copy device agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy device agent" onClick={() => openCopy(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Check deployed token"><ActionIcon size="sm" variant="light" color="teal" aria-label="Check deployed token" onClick={() => checkToken.mutate(agent)}><CheckTokenIcon /></ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerate.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Group></Table.Td>
        </Table.Tr>)}{filteredAgents.length === 0 && <Table.Tr><Table.Td colSpan={showSupervisorControls ? 11 : 10}><Text ta="center" c="dimmed" py="xl">No Device Agents yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
      </Table></div>
    </Card>

    <Modal opened={!!proxmoxTarget} onClose={() => !proxmoxLoading && setProxmoxTarget(null)} title={`Proxmox configuration${proxmoxTarget ? ` — ${proxmoxTarget.name}` : ""}`} size="lg" centered>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Stored on the Device Agent host in <Code>config/proxmox.yml</Code>. Secrets stay on the host and are never returned to SensorSphere.</Text>
        {proxmoxEndpoints.map((endpoint, index) => <Card key={`${endpoint.id}-${index}`} withBorder p="sm"><Stack gap="xs">
          <Group grow><TextInput label="Endpoint id" value={endpoint.id} onChange={event => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, id: event.currentTarget.value } : item))} /><Select label="Product" value={endpoint.product} data={["PVE","PBS"]} onChange={value => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, product: (value === "PBS" ? "PBS" : "PVE") } : item))} /></Group>
          <TextInput label="URL" placeholder="https://pve.example.net:8006" value={endpoint.url} onChange={event => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, url: event.currentTarget.value } : item))} />
          <TextInput label="Token ID" placeholder="user@realm!token" value={endpoint.tokenId} onChange={event => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, tokenId: event.currentTarget.value } : item))} />
          <TextInput type="password" label="Token secret" description={endpoint.tokenSecretConfigured ? "Leave empty to keep the current secret." : "Required for a new endpoint."} value={endpoint.tokenSecret ?? ""} onChange={event => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, tokenSecret: event.currentTarget.value } : item))} />
          <Group justify="space-between"><Checkbox label="Verify TLS certificate" checked={endpoint.verifyTls} onChange={event => setProxmoxEndpoints(current => current.map((item,i) => i === index ? { ...item, verifyTls: event.currentTarget.checked } : item))} /><Button size="compact-xs" variant="subtle" color="red" onClick={() => setProxmoxEndpoints(current => current.filter((_,i) => i !== index))}>Remove endpoint</Button></Group>
        </Stack></Card>)}
        <Button variant="light" size="xs" onClick={() => setProxmoxEndpoints(current => [...current, { id: `proxmox-${current.length + 1}`, product: "PVE", url: "", tokenId: "", tokenSecret: "", verifyTls: true }])}>Add Proxmox server</Button>
        {proxmoxError && <Text c="red" size="sm">{proxmoxError}</Text>}
        {proxmoxTestResult && <Text c="green" size="sm">{proxmoxTestResult}</Text>}
        <Group justify="space-between"><Button variant="light" color="red" disabled={proxmoxEndpoints.length === 0 || proxmoxLoading} onClick={removeProxmoxConfig}>Delete configuration</Button><Group><Button variant="default" disabled={proxmoxLoading} onClick={() => setProxmoxTarget(null)}>Close</Button><Button variant="light" loading={proxmoxLoading} disabled={proxmoxEndpoints.length === 0} onClick={testProxmoxConfig}>Test connection</Button><Button loading={proxmoxLoading} disabled={proxmoxEndpoints.length === 0} onClick={saveProxmoxConfig}>Save</Button></Group></Group>
      </Stack>
    </Modal>

    <Modal opened={bulkUpdateOpen} onClose={() => !bulkDeviceUpdateMutation.isPending && setBulkUpdateOpen(false)} title="Update all Device Agents" centered>
      <Stack><Text size="sm">Update {bulkDeviceCandidates.length} Device Agent{bulkDeviceCandidates.length === 1 ? "" : "s"} to <strong>{latestDeviceVersion ?? "—"}</strong>?</Text>{bulkDeviceCandidates.map(agent => <Text size="sm" key={agent.id}>{agent.name}: {agent.version ?? "—"} → {latestDeviceVersion}</Text>)}{bulkDeviceUpdateMutation.isError && <Text size="sm" c="red">{bulkDeviceUpdateMutation.error instanceof Error ? bulkDeviceUpdateMutation.error.message : "Unable to update all Device Agents"}</Text>}<Group justify="flex-end"><Button variant="default" disabled={bulkDeviceUpdateMutation.isPending} onClick={() => setBulkUpdateOpen(false)}>Cancel</Button><Button color="teal" loading={bulkDeviceUpdateMutation.isPending} disabled={bulkDeviceCandidates.length === 0} onClick={() => bulkDeviceUpdateMutation.mutate(bulkDeviceCandidates)}>Update All</Button></Group></Stack>
    </Modal>

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
        <Group justify="flex-end"><Button variant="default" onClick={() => { setUpdateTarget(null); setUpdateVersion(""); agentUpdateMutation.reset(); }}>Close</Button><Button color="teal" variant="light" loading={agentUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim()) || agentUpdateMutation.isPending} onClick={() => updateTarget && agentUpdateMutation.mutate({ agentId: updateTarget.id, version: updateVersion.trim(), closeOnSuccess: true })}>Update and Close</Button><Button color="teal" loading={agentUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim()) || agentUpdateMutation.isPending} onClick={() => updateTarget && agentUpdateMutation.mutate({ agentId: updateTarget.id, version: updateVersion.trim(), closeOnSuccess: false })}>Update</Button></Group>
      </Stack>
    </Modal>

    {showSupervisorControls && <>
    <Modal opened={supervisorUpdateTarget != null} onClose={() => { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); supervisorUpdateMutation.reset(); }} title="Update Supervisor Agent" centered>
      <Stack>
        <Text size="sm">Update the Supervisor Agent for <strong>{supervisorUpdateTarget?.name}</strong>{supervisorUpdateTarget?.supervisorVersion ? ` from ${supervisorUpdateTarget.supervisorVersion}` : ""} to the requested version.</Text>
        <TextInput label="Target version" placeholder="0.3.1" value={supervisorUpdateVersion} onChange={event => setSupervisorUpdateVersion(event.currentTarget.value)} autoFocus />
        {supervisorUpdateMutation.isError && <Text c="red" size="sm">{supervisorUpdateMutation.error instanceof Error ? supervisorUpdateMutation.error.message : "Unable to request Supervisor Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => { setSupervisorUpdateTarget(null); setSupervisorUpdateVersion(""); supervisorUpdateMutation.reset(); }}>Close</Button><Button color="teal" variant="light" loading={supervisorUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(supervisorUpdateVersion.trim()) || supervisorUpdateMutation.isPending} onClick={() => supervisorUpdateTarget && supervisorUpdateMutation.mutate({ agentId: supervisorUpdateTarget.id, version: supervisorUpdateVersion.trim(), closeOnSuccess: true })}>Update and Close</Button><Button color="teal" loading={supervisorUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(supervisorUpdateVersion.trim()) || supervisorUpdateMutation.isPending} onClick={() => supervisorUpdateTarget && supervisorUpdateMutation.mutate({ agentId: supervisorUpdateTarget.id, version: supervisorUpdateVersion.trim(), closeOnSuccess: false })}>Update</Button></Group>
      </Stack>
    </Modal>

    </>}

    <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Device Agent?" centered>
      <Stack><Text>Delete <strong>{deleteTarget?.name}</strong>? Devices assigned to it will keep their provider but lose the Device Agent association.{deleteTarget?.managedBySupervisorId ? " Its local installation will first be removed by the associated Supervisor Agent." : ""}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget)}>Delete</Button></Group></Stack>
    </Modal>

    {copyNotice && (
      <Notification color="green" title="Copied" onClose={() => setCopyNotice(null)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 10000, width: 320 }}>
        {copyNotice}
      </Notification>
    )}

    <Modal opened={tokenCheckResult != null} onClose={() => setTokenCheckResult(null)} title="Check Device Agent token" centered>
      <Stack>
        <Text size="sm"><strong>{tokenCheckResult?.name}</strong></Text>
        <Badge color={tokenCheckResult?.result.matches ? "green" : "red"} variant="light">{tokenCheckResult?.result.matches ? "TOKEN MATCH" : "TOKEN MISMATCH"}</Badge>
        <Text size="sm">SensorSphere fingerprint: <Code>{tokenCheckResult?.result.expectedFingerprint ?? "—"}</Code></Text>
        <Text size="sm">Configured .env fingerprint: <Code>{tokenCheckResult?.result.configuredFingerprint ?? "—"}</Code></Text>
        <Text size="sm">Running container fingerprint: <Code>{tokenCheckResult?.result.runtimeFingerprint ?? "—"}</Code></Text>
        {tokenCheckResult?.result.configuredSensorSphereUrl && <Text size="xs" c="dimmed">Configured SensorSphere URL: {tokenCheckResult.result.configuredSensorSphereUrl}</Text>}
        {tokenCheckResult?.result.runtimeSensorSphereUrl && <Text size="xs" c="dimmed">Running container SensorSphere URL: {tokenCheckResult.result.runtimeSensorSphereUrl}</Text>}
        {tokenCheckResult?.result.runtimePresent === false && <Text size="xs" c="orange">The running container does not expose the expected token variable. Recreate the container before trusting the configured .env.</Text>}
        {tokenCheckResult?.result.configuredMatches === true && tokenCheckResult?.result.runtimeMatches === false && <Text size="xs" c="red">The .env token matches SensorSphere, but the running container is using a different token.</Text>}
        {tokenCheckResult?.result.installDir && <Text size="xs" c="dimmed">Install directory: {tokenCheckResult.result.installDir}</Text>}
        <Group justify="flex-end"><Button onClick={() => setTokenCheckResult(null)}>Close</Button></Group>
      </Stack>
    </Modal>

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
