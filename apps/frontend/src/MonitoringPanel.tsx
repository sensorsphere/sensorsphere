import React from "react";

import {
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Modal,
  MultiSelect,
  Notification,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createMonitoringAgent,
  createMonitoringCheck,
  createMonitoringSlot,
  bulkAssignMonitoringSlots,
  deleteMonitoringSlot,
  deleteMonitoringAgent,
  deleteSupervisorManagedAgentAssignment,
  deleteMonitoringCheck,
  getDeviceRegistryDevices,
  getMonitoringAgents,
  getMonitoringSlots,
  getMonitoringChecks,
  regenerateMonitoringAgentToken,
  checkMonitoringAgentToken,
  updateMonitoringAgent,
  updateMonitoringSlot,
  updateMonitoringCheck,
  runSupervisorManagedAgentOperation
} from "./api";
import type {
  AgentTokenCheckResult,
  CreateMonitoringCheckInput,
  MonitoringAgent,
  MonitoringSlot,
  MonitoringCheck,
  MonitoringCheckType,
  MonitoringExecutionMode,
  MonitoringTargetMode,
  DeviceIdentity,
  DeviceRegistryDevice,
  ManagedAgentOperation
} from "./types";
import { EditActionIcon, DeleteActionIcon, ReinstallCommandActionIcon } from "./TableActionIcons";
import { AgentActionDetails } from "./AgentActionDetails";
import { DeviceGlyph } from "./DeviceGlyph";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { FilterClearAction } from "./FilterClearAction";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability, UpdateLifecycleAge } from "./AgentVersionAvailability";
import { HostNetworkCell, type HostNetworkInterface } from "./HostNetworkCell";
import { AgentReportedCell, AgentSystemCell } from "./AgentTechnicalCells";
import { hasAgentUpdate } from "./AgentBulkUpdate";

type AgentSortKey = "name" | "status" | "checks" | "host" | "version" | "lastSeen" | "labels" | "agentLabels";
type CheckSortKey = "device" | "class" | "type" | "technology" | "check" | "target" | "agents" | "mode" | "status";

const STATUS_COLORS: Record<string, string> = {
  UP: "green",
  DOWN: "red",
  UNKNOWN: "gray"
};

function CheckTokenIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function relativeAge(value: string | null): string {
  if (!value) return "Never";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return value;
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return "less than 1 minute";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}


interface MonitoringSupervisorAgent {
  id: string;
  name: string;
  hostname: string | null;
  online: boolean;
  managedAgents: Array<Record<string, unknown>>;
  hostNetworks: HostNetworkInterface[];
}

type MonitoringManagedOperation = ManagedAgentOperation;

async function getMonitoringSupervisors(): Promise<MonitoringSupervisorAgent[]> {
  const response = await fetch("/api/v1/device-control/supervisors");
  if (!response.ok) throw new Error(`Unable to load Supervisor Agents (${response.status})`);
  return response.json();
}

async function requestMonitoringAgentUpdate(supervisorId: string, agentId: string, instance: string, version: string): Promise<MonitoringManagedOperation> {
  const response = await fetch(`/api/v1/device-control/supervisors/${supervisorId}/managed-agents`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "UPDATE", agentType: "monitor-agent", agentId, instance, version })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to request Monitoring Agent update (${response.status})`);
  return payload;
}

async function waitMonitoringAgentUpdate(commandId: string, onProgress?: (operation: MonitoringManagedOperation) => void): Promise<MonitoringManagedOperation> {
  const deadline = Date.now() + 615_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const response = await fetch(`/api/v1/device-control/supervisor-managed-agents/${commandId}`);
    const payload = await response.json() as MonitoringManagedOperation;
    if (!response.ok) throw new Error(payload.error ?? `Unable to read Monitoring Agent update (${response.status})`);
    onProgress?.(payload);
    if (["SUCCESS", "FAILED", "TIMEOUT"].includes(payload.status)) return payload;
  }
  throw new Error("Monitoring Agent update timed out");
}

function AgentUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.7 6.5 9.2 3.7-1.5 6.5-5 6.5-9.2V6L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.3 2.3M12 9l2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function overallCheckStatus(check: MonitoringCheck): "UP" | "DOWN" | "UNKNOWN" {
  if (check.states.some(state => state.status === "UP")) return "UP";
  if (check.states.some(state => state.status === "DOWN")) return "DOWN";
  return "UNKNOWN";
}

interface AgentFormState {
  name: string;
  heartbeatTimeoutSeconds: number;
  labelsText: string;
  enabled: boolean;
}

function emptyAgentForm(): AgentFormState {
  return { name: "", heartbeatTimeoutSeconds: 90, labelsText: "", enabled: true };
}

function agentToForm(agent: MonitoringAgent): AgentFormState {
  return {
    name: agent.name,
    heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds,
    labelsText: Object.entries(agent.labels).map(([key, value]) => `${key}=${value}`).join("\n"),
    enabled: agent.enabled
  };
}

function parseLabels(value: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid label "${trimmed}". Expected key=value.`);
    labels[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return labels;
}

type CheckTargetSelectionMode = MonitoringTargetMode | "EXISTING_IDENTITY";

const identityTargetPattern = /^\{\{identity:([^:}]+):([^}]+)\}\}$/i;

function resolveIdentityTarget(target: string | null | undefined, device: { identities: DeviceIdentity[] } | undefined): string | null {
  if (!target || !device) return null;
  const match = identityTargetPattern.exec(target.trim());
  if (!match) return null;
  const identityType = match[1]!.toUpperCase();
  const identityKey = match[2]!.toLowerCase();
  const identity = device.identities.find(item =>
    item.identityType.toUpperCase() === identityType &&
    [item.labelCode, item.source, item.label].some(value => value?.trim().toLowerCase() === identityKey)
  );
  return identity?.value ?? null;
}

function resolveCheckTarget(check: MonitoringCheck, device: DeviceRegistryDevice | undefined): string | null {
  if (!device) return null;
  if (check.targetMode === "CUSTOM") return resolveIdentityTarget(check.targetValue, device);
  const primary = (type: string) => device.identities.find(item => item.identityType.toUpperCase() === type && item.isPrimary)
    ?? device.identities.find(item => item.identityType.toUpperCase() === type);
  const primaryIp = primary("IP")?.value ?? device.ipAddress ?? null;
  const primaryFqdn = primary("FQDN")?.value ?? primary("HOSTNAME")?.value ?? device.fqdn ?? null;
  if (check.targetMode === "PRIMARY_IP") return primaryIp;
  if (check.targetMode === "PRIMARY_FQDN") return primaryFqdn;
  if (check.targetMode === "PRIMARY_ADDRESS") return primaryIp ?? primaryFqdn;
  return null;
}

interface CheckFormState {
  deviceId: string | null;
  name: string;
  enabled: boolean;
  checkType: MonitoringCheckType;
  targetMode: CheckTargetSelectionMode;
  targetValue: string;
  port: number | string;
  path: string;
  intervalSeconds: number | string;
  timeoutSeconds: number | string;
  failureThreshold: number | string;
  recoveryThreshold: number | string;
  executionMode: MonitoringExecutionMode;
  slotIds: string[];
}

function emptyCheckForm(): CheckFormState {
  return {
    deviceId: null,
    name: "Ping",
    enabled: true,
    checkType: "PING",
    targetMode: "PRIMARY_IP",
    targetValue: "",
    port: "",
    path: "",
    intervalSeconds: 60,
    timeoutSeconds: 3,
    failureThreshold: 3,
    recoveryThreshold: 2,
    executionMode: "FAILOVER",
    slotIds: []
  };
}

function checkToForm(check: MonitoringCheck): CheckFormState {
  const symbolicIdentity = check.targetMode === "CUSTOM" && identityTargetPattern.test(check.targetValue ?? "");
  return {
    deviceId: check.deviceId,
    name: check.name,
    enabled: check.enabled,
    checkType: check.checkType,
    targetMode: symbolicIdentity ? "EXISTING_IDENTITY" : check.targetMode,
    targetValue: check.targetValue ?? "",
    port: check.port ?? "",
    path: check.path ?? "",
    intervalSeconds: check.intervalSeconds,
    timeoutSeconds: check.timeoutSeconds,
    failureThreshold: check.failureThreshold,
    recoveryThreshold: check.recoveryThreshold,
    executionMode: check.executionMode,
    slotIds: [...check.assignments].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100)).map(item => item.slotId)
  };
}

function numeric(value: number | string, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function checkPayload(form: CheckFormState): CreateMonitoringCheckInput {
  if (!form.deviceId) throw new Error("Device is required");
  if (form.slotIds.length === 0) throw new Error("At least one monitoring slot is required");
  return {
    deviceId: form.deviceId,
    name: form.name.trim(),
    enabled: form.enabled,
    checkType: form.checkType,
    targetMode: form.targetMode === "EXISTING_IDENTITY" ? "CUSTOM" : form.targetMode,
    targetValue: form.targetMode === "CUSTOM" || form.targetMode === "EXISTING_IDENTITY" ? form.targetValue.trim() || null : null,
    port: form.checkType === "PING" ? null : numeric(form.port, form.checkType === "HTTPS" ? 443 : form.checkType === "HTTP" ? 80 : 22),
    path: form.checkType === "HTTP" || form.checkType === "HTTPS" ? (form.path.trim() || "/") : null,
    intervalSeconds: numeric(form.intervalSeconds, 60),
    timeoutSeconds: numeric(form.timeoutSeconds, 3),
    failureThreshold: numeric(form.failureThreshold, 3),
    recoveryThreshold: numeric(form.recoveryThreshold, 2),
    executionMode: form.executionMode,
    assignments: form.slotIds.map((slotId, index) => ({ slotId, priority: (index + 1) * 10, enabled: true }))
  };
}

export interface MonitoringQuickCheckRequest {
  requestId: number;
  deviceId: string;
  targetValue: string;
}

export function MonitoringPanel({
  quickCheckRequest,
  onQuickCheckFinished,
  view = "all"
}: {
  quickCheckRequest?: MonitoringQuickCheckRequest | null;
  onQuickCheckFinished?: () => void;
  view?: "all" | "checks" | "agents";
} = {}) {
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);

  const showCopyNotice = React.useCallback((message: string) => {
    setCopyNotice(message);
    window.setTimeout(() => setCopyNotice(current => current === message ? null : current), 2200);
  }, []);

  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const slotsQuery = useQuery({ queryKey: ["monitoring", "slots"], queryFn: getMonitoringSlots, refetchInterval: 15000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const supervisorsQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getMonitoringSupervisors, refetchInterval: 10000 });
  const checksQuery = useQuery({ queryKey: ["monitoring", "checks"], queryFn: getMonitoringChecks, refetchInterval: 15000 });
  const devicesQuery = useQuery({ queryKey: ["device-registry", "devices"], queryFn: getDeviceRegistryDevices });
  const [agentUpdateTarget, setAgentUpdateTarget] = React.useState<MonitoringAgent | null>(null);
  const [bulkUpdateOpen, setBulkUpdateOpen] = React.useState(false);
  const [agentUpdateSupervisorId, setAgentUpdateSupervisorId] = React.useState<string | null>(null);
  const [agentUpdateInstance, setAgentUpdateInstance] = React.useState<string | null>(null);
  const [agentUpdateVersion, setAgentUpdateVersion] = React.useState("");
  const [agentUpdateStatus, setAgentUpdateStatus] = React.useState<"IDLE" | "UPDATING" | "VERIFYING" | "UPDATED" | "FAILED">("IDLE");
  const [agentUpdateError, setAgentUpdateError] = React.useState<string | null>(null);
  const [agentUpdateOperation, setAgentUpdateOperation] = React.useState<ManagedAgentOperation | null>(null);

  const [agentModalOpen, setAgentModalOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<MonitoringAgent | null>(null);
  const [agentForm, setAgentForm] = React.useState<AgentFormState>(emptyAgentForm());
  const [agentDeleteTarget, setAgentDeleteTarget] = React.useState<MonitoringAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ agentName: string; token: string; reinstall?: boolean } | null>(null);
  const [tokenCheckResult, setTokenCheckResult] = React.useState<{ name: string; result: AgentTokenCheckResult } | null>(null);
  const [slotManagerOpen, setSlotManagerOpen] = React.useState(false);
  const [newSlotName, setNewSlotName] = React.useState("");
  const [newSlotDescription, setNewSlotDescription] = React.useState("");

  const [checkModalOpen, setCheckModalOpen] = React.useState(false);
  const [selectedCheckIds, setSelectedCheckIds] = React.useState<string[]>([]);
  const [bulkSlotsOpen, setBulkSlotsOpen] = React.useState(false);
  const [bulkSlotMode, setBulkSlotMode] = React.useState<"ADD" | "REMOVE" | "REPLACE">("REPLACE");
  const [bulkSlotIds, setBulkSlotIds] = React.useState<string[]>([]);
  const [editingCheck, setEditingCheck] = React.useState<MonitoringCheck | null>(null);
  const [checkForm, setCheckForm] = React.useState<CheckFormState>(emptyCheckForm());
  const [checkDeleteTarget, setCheckDeleteTarget] = React.useState<MonitoringCheck | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [deviceDropdownOpened, setDeviceDropdownOpened] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [agentNameFilter, setAgentNameFilter] = usePersistentState("device-registry.monitoring.agents.filter.name", "");
  const [agentStatusFilter, setAgentStatusFilter] = usePersistentState<string | null>("device-registry.monitoring.agents.filter.status", null);
  const [agentHostFilter, setAgentHostFilter] = usePersistentState("device-registry.monitoring.agents.filter.host", "");
  const [agentLabelsFilter, setAgentLabelsFilter] = usePersistentState("device-registry.monitoring.agents.filter.labels", "");
  const [agentSlotFilter, setAgentSlotFilter] = usePersistentState<string | null>("device-registry.monitoring.agents.filter.slot", null);
  const [agentSortKey, setAgentSortKey] = usePersistentState<AgentSortKey>("device-registry.monitoring.agents.sort.key", "name");
  const [agentSortDirection, setAgentSortDirection] = usePersistentState<SortDirection>("device-registry.monitoring.agents.sort.direction", "asc");

  const [checkDeviceFilter, setCheckDeviceFilter] = usePersistentState("device-registry.monitoring.checks.filter.device", "");
  const [checkClassFilter, setCheckClassFilter] = usePersistentState<string | null>("device-registry.monitoring.checks.filter.class", null);
  const [checkTypeFilter, setCheckTypeFilter] = usePersistentState<string | null>("device-registry.monitoring.checks.filter.type", null);
  const [checkTechnologyFilter, setCheckTechnologyFilter] = usePersistentState<string | null>("device-registry.monitoring.checks.filter.technology", null);
  const [checkNameFilter, setCheckNameFilter] = usePersistentState("device-registry.monitoring.checks.filter.name", "");
  const [checkSlotFilter, setCheckSlotFilter] = usePersistentState("device-registry.monitoring.checks.filter.slot", "");
  const [checkStatusFilter, setCheckStatusFilter] = usePersistentState<string | null>("device-registry.monitoring.checks.filter.status", null);
  const [checkSortKey, setCheckSortKey] = usePersistentState<CheckSortKey>("device-registry.monitoring.checks.sort.key", "device");
  const [checkSortDirection, setCheckSortDirection] = usePersistentState<SortDirection>("device-registry.monitoring.checks.sort.direction", "asc");
  const [monitoringTab, setMonitoringTab] = usePersistentState<"checks" | "agents">("device-registry.monitoring.tab", "checks");

  const selectedDevice = (devicesQuery.data ?? []).find(device => device.id === checkForm.deviceId);
  const compatibleIdentities = React.useMemo(() => {
    const identities = selectedDevice?.identities ?? [];
    return identities
      .filter(identity => ["IP", "FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase()))
      .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.identityType.localeCompare(b.identityType));
  }, [selectedDevice]);
  const identityTargetValue = (identity: DeviceIdentity): string => {
    const key = identity.labelCode?.trim() || identity.source?.trim();
    return key ? `{{identity:${identity.identityType.toUpperCase()}:${key}}}` : identity.value;
  };
  const identityOptions = compatibleIdentities.map(identity => {
    const symbolic = identityTargetValue(identity);
    const label = identity.label ?? identity.labelCode ?? identity.source ?? (identity.isPrimary ? "Primary" : "Unlabelled");
    return { value: symbolic, label: `${identity.identityType.toUpperCase()} · ${label} · ${identity.value}` };
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"] }),
      queryClient.invalidateQueries({ queryKey: ["monitoring", "slots"] }),
      queryClient.invalidateQueries({ queryKey: ["monitoring", "checks"] })
    ]);
  };

  const monitoringAgentUpdateMutation = useMutation({
    mutationFn: async ({ supervisorId, agentId, instance, version, closeOnSuccess = false }: { supervisorId: string; agentId: string; instance: string; version: string; closeOnSuccess?: boolean }) => {
      setAgentUpdateStatus("UPDATING");
      setAgentUpdateError(null);
      const requested = await requestMonitoringAgentUpdate(supervisorId, agentId, instance, version);
      setAgentUpdateOperation(requested);
      const completed = await waitMonitoringAgentUpdate(requested.commandId, setAgentUpdateOperation);
      if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Monitoring Agent update ${completed.status.toLowerCase()}`);
      return { ...completed, closeOnSuccess };
    },
    onSuccess: result => {
      if (result.closeOnSuccess) { setAgentUpdateTarget(null); setAgentUpdateStatus("IDLE"); setAgentUpdateError(null); } else setAgentUpdateStatus("VERIFYING");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" })
      ]);
    },
    onError: error => {
      setAgentUpdateStatus("FAILED");
      setAgentUpdateError(error instanceof Error ? error.message : "Unable to update Monitoring Agent");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" })
      ]);
    }
  });

  const bulkMonitoringUpdateMutation = useMutation({
    mutationFn: async (items: Array<{ agent: MonitoringAgent; supervisorId: string; instance: string }>) => {
      const latest = versionsQuery.data?.agents.monitorAgent.latestVersion;
      if (!latest) throw new Error("Latest Monitoring Agent version is unavailable");
      for (const item of items) await requestMonitoringAgentUpdate(item.supervisorId, item.agent.id, item.instance, latest);
    },
    onSuccess: async () => { setBulkUpdateOpen(false); await refresh(); }
  });

  const openMonitoringAgentUpdate = (agent: MonitoringAgent) => {
    const selected = agent.managedBySupervisorId ? (supervisorsQuery.data ?? []).find(item => item.id === agent.managedBySupervisorId && item.online) : undefined;
    setAgentUpdateTarget(agent);
    setAgentUpdateSupervisorId(selected?.id ?? null);
    setAgentUpdateInstance(selected && agent.managedInstance ? agent.managedInstance : null);
    setAgentUpdateVersion(versionsQuery.data?.agents.monitorAgent.latestVersion ?? agent.version ?? "");
    setAgentUpdateStatus("IDLE");
    setAgentUpdateError(null);
    setAgentUpdateOperation(null);
    monitoringAgentUpdateMutation.reset();
  };

  const saveAgent = useMutation({
    mutationFn: async () => {
      const labels = parseLabels(agentForm.labelsText);
      if (editingAgent) {
        return { agent: await updateMonitoringAgent(editingAgent.id, {
          name: agentForm.name.trim(),
          enabled: agentForm.enabled,
          labels,
          heartbeatTimeoutSeconds: agentForm.heartbeatTimeoutSeconds
        }), token: null as string | null };
      }
      const created = await createMonitoringAgent({
        name: agentForm.name.trim(), labels, heartbeatTimeoutSeconds: agentForm.heartbeatTimeoutSeconds
      });
      return { agent: created.agent, token: created.token };
    },
    onSuccess: async result => {
      setAgentModalOpen(false);
      setEditingAgent(null);
      setError(null);
      if (result.token) setTokenInfo({ agentName: result.agent.name, token: result.token });
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to save monitoring agent")
  });

  const removeAgent = useMutation({
    mutationFn: async (agent: MonitoringAgent) => {
      if (agent.managedBySupervisorId) {
        await runSupervisorManagedAgentOperation(agent.managedBySupervisorId, {
          operation: "REMOVE",
          agentType: "monitor-agent",
          agentId: agent.id,
          instance: agent.managedInstance ?? "main"
        });
      }
      if (agent.managedAssociationId) await deleteSupervisorManagedAgentAssignment(agent.managedAssociationId);
      await deleteMonitoringAgent(agent.id);
    },
    onSuccess: async () => { setAgentDeleteTarget(null); await refresh(); },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete monitoring agent")
  });

  const createSlotMutation = useMutation({
    mutationFn: () => createMonitoringSlot({
      name: newSlotName.trim(),
      description: newSlotDescription.trim() || null
    }),
    onSuccess: async () => {
      setNewSlotName("");
      setNewSlotDescription("");
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to create monitoring slot")
  });

  const updateSlotMutation = useMutation({
    mutationFn: ({ slotId, input }: {
      slotId: string;
      input: { name?: string; description?: string | null; enabled?: boolean; agentId?: string | null };
    }) => updateMonitoringSlot(slotId, input),
    onSuccess: refresh,
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to update monitoring slot")
  });

  const removeSlotMutation = useMutation({
    mutationFn: deleteMonitoringSlot,
    onSuccess: refresh,
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete monitoring slot")
  });

  const bulkSlotsMutation = useMutation({
    mutationFn: () => bulkAssignMonitoringSlots({
      checkIds: selectedCheckIds,
      mode: bulkSlotMode,
      slotIds: bulkSlotIds
    }),
    onSuccess: async () => {
      setBulkSlotsOpen(false);
      setSelectedCheckIds([]);
      setBulkSlotIds([]);
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to update monitoring slots")
  });

  const regenerateToken = useMutation({
    mutationFn: regenerateMonitoringAgentToken,
    onSuccess: result => setTokenInfo({ agentName: result.agent.name, token: result.token }),
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to regenerate token")
  });
  const reinstallToken = useMutation({
    mutationFn: (agent: MonitoringAgent) => regenerateMonitoringAgentToken(agent.id),
    onSuccess: result => setTokenInfo({ agentName: result.agent.name, token: result.token, reinstall: true }),
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to generate reinstall command")
  });
  const checkToken = useMutation({
    mutationFn: (agent: MonitoringAgent) => checkMonitoringAgentToken(agent.id),
    onSuccess: (result, agent) => setTokenCheckResult({ name: agent.name, result }),
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to check token")
  });

  const saveCheck = useMutation({
    mutationFn: async () => {
      if (!checkForm.deviceId) throw new Error("Device is required");
      if (!checkForm.name.trim()) throw new Error("Check name is required");
      if (checkForm.targetMode === "EXISTING_IDENTITY" && !checkForm.targetValue) throw new Error("Existing identity is required");
      if (checkForm.targetMode === "CUSTOM" && !checkForm.targetValue.trim()) throw new Error("Custom target is required");
      if (checkForm.targetMode === "CUSTOM" && checkForm.targetValue.trim().startsWith("{{identity:") && !identityTargetPattern.test(checkForm.targetValue.trim())) {
        throw new Error("Invalid identity target. Expected {{identity:TYPE:LABEL}}");
      }
      if (checkForm.slotIds.length === 0) throw new Error("At least one monitoring slot is required");
      const payload = checkPayload(checkForm);
      return editingCheck ? updateMonitoringCheck(editingCheck.id, payload) : createMonitoringCheck(payload);
    },
    onSuccess: async () => {
      const wasQuickCheck = Boolean(quickCheckRequest);
      setCheckModalOpen(false);
      setEditingCheck(null);
      setCheckError(null);
      setDeviceDropdownOpened(false);
      await refresh();
      if (wasQuickCheck) onQuickCheckFinished?.();
    },
    onError: cause => setCheckError(cause instanceof Error ? cause.message : "Unable to save monitoring check")
  });

  const removeCheck = useMutation({
    mutationFn: deleteMonitoringCheck,
    onSuccess: async () => { setCheckDeleteTarget(null); await refresh(); },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete monitoring check")
  });

  const agents = agentsQuery.data ?? [];
  const slots = slotsQuery.data ?? [];
  const checks = checksQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const deviceById = new Map(devices.map(device => [device.id, device]));
  const latestMonitoringVersion = versionsQuery.data?.agents.monitorAgent.latestVersion ?? null;
  const supervisorById = new Map((supervisorsQuery.data ?? []).map(supervisor => [supervisor.id, supervisor]));
  const managedRuntimeInstalled = (agent: MonitoringAgent): boolean => {
    if (!agent.managedBySupervisorId) return false;
    const supervisor = supervisorById.get(agent.managedBySupervisorId);
    if (!supervisor?.online) return false;
    const instance = agent.managedInstance ?? "main";
    return supervisor.managedAgents.some(entry => entry.agent_type === "monitor-agent" && entry.instance === instance && entry.installed !== false && entry.sensor_sphere_agent_id === agent.id);
  };
  const bulkMonitoringCandidates = agents.flatMap(agent => {
    if (!agent.online || !agent.enabled || !agent.managedBySupervisorId || !hasAgentUpdate(agent.version, latestMonitoringVersion) || ["UPDATE_REQUESTED", "REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)) return [];
    const supervisor = supervisorById.get(agent.managedBySupervisorId);
    if (!supervisor?.online || !managedRuntimeInstalled(agent)) return [];
    return [{ agent, supervisorId: supervisor.id, instance: agent.managedInstance ?? "main" }];
  });


  const toggleAgentSort = (key: AgentSortKey) => {
    if (agentSortKey === key) setAgentSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setAgentSortKey(key); setAgentSortDirection("asc"); }
  };
  const filteredAgents = agents.filter(agent => {
    const status = !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const labels = `${Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(" ")} ${agent.agentLabels.join(" ")}`.toLowerCase();
    return (!agentNameFilter.trim() || agent.name.toLowerCase().includes(agentNameFilter.trim().toLowerCase()))
      && (!agentStatusFilter || status === agentStatusFilter)
      && (!agentHostFilter.trim() || `${agent.hostname ?? ""} ${agent.lastIp ?? ""} ${agent.localIp ?? ""} ${agent.sourceIp ?? ""} ${agent.xForwardedFor ?? ""} ${agent.xRealIp ?? ""}`.toLowerCase().includes(agentHostFilter.trim().toLowerCase()))
      && (!agentLabelsFilter.trim() || labels.includes(agentLabelsFilter.trim().toLowerCase()))
      && (!agentSlotFilter || (agentSlotFilter === "__UNBOUND__" ? !agent.slotId : agent.slotId === agentSlotFilter));
  }).sort((left, right) => {
    const status = (agent: MonitoringAgent) => !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const value = (agent: MonitoringAgent) => agentSortKey === "name" ? agent.name
      : agentSortKey === "status" ? status(agent)
      : agentSortKey === "checks" ? (agent.slotId ? checks.filter(check => check.assignments.some(item => item.slotId === agent.slotId)).length : 0)
      : agentSortKey === "host" ? `${agent.hostname ?? ""} ${agent.localIp ?? ""} ${agent.sourceIp ?? ""} ${agent.xForwardedFor ?? ""}`
      : agentSortKey === "version" ? agent.version
      : agentSortKey === "lastSeen" ? agent.lastSeenAt
      : agentSortKey === "labels" ? Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(",")
      : agent.agentLabels.join(",");
    return compareTableValues(value(left), value(right), agentSortDirection);
  });
  const agentFiltersActive = Boolean(agentNameFilter || agentStatusFilter || agentHostFilter || agentLabelsFilter || agentSlotFilter);

  const toggleCheckSort = (key: CheckSortKey) => {
    if (checkSortKey === key) setCheckSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setCheckSortKey(key); setCheckSortDirection("asc"); }
  };
  const filteredChecks = checks.filter(check => {
    const device = deviceById.get(check.deviceId);
    const status = overallCheckStatus(check);
    const slotText = check.assignments.map(item => `${item.slotName} ${item.agentName ?? ""}`).join(" ").toLowerCase();
    return (!checkDeviceFilter.trim() || check.deviceName.toLowerCase().includes(checkDeviceFilter.trim().toLowerCase()))
      && (!checkClassFilter || device?.deviceClass === checkClassFilter)
      && (!checkTypeFilter || device?.deviceType === checkTypeFilter)
      && (!checkTechnologyFilter || device?.technologies.some(item => item.code === checkTechnologyFilter))
      && (!checkNameFilter.trim() || `${check.name} ${check.checkType}`.toLowerCase().includes(checkNameFilter.trim().toLowerCase()))
      && (!checkSlotFilter.trim() || slotText.includes(checkSlotFilter.trim().toLowerCase()))
      && (!checkStatusFilter || status === checkStatusFilter);
  }).sort((left, right) => {
    const leftDevice = deviceById.get(left.deviceId);
    const rightDevice = deviceById.get(right.deviceId);
    const value = (check: MonitoringCheck, device: typeof leftDevice) => checkSortKey === "device" ? check.deviceName
      : checkSortKey === "class" ? device?.deviceClassInfo.label
      : checkSortKey === "type" ? device?.deviceTypeInfo.label
      : checkSortKey === "technology" ? device?.technologies.map(item => item.label).join(",")
      : checkSortKey === "check" ? `${check.name} ${check.checkType}`
      : checkSortKey === "target" ? `${check.targetMode} ${check.targetValue ?? ""} ${check.port ?? ""}`
      : checkSortKey === "agents" ? check.assignments.map(item => item.slotName).join(",")
      : checkSortKey === "mode" ? check.executionMode
      : overallCheckStatus(check);
    return compareTableValues(value(left, leftDevice), value(right, rightDevice), checkSortDirection);
  });
  const checkFiltersActive = Boolean(checkDeviceFilter || checkClassFilter || checkTypeFilter || checkTechnologyFilter || checkNameFilter || checkSlotFilter || checkStatusFilter);

  const onlineAgents = agents.filter(item => item.online).length;
  const statuses = checks.map(overallCheckStatus);
  const upChecks = statuses.filter(item => item === "UP").length;
  const downChecks = statuses.filter(item => item === "DOWN").length;
  const unknownChecks = statuses.filter(item => item === "UNKNOWN").length;

  const openCreateAgent = () => {
    setEditingAgent(null); setAgentForm(emptyAgentForm()); setError(null); setAgentModalOpen(true);
  };
  const openEditAgent = (agent: MonitoringAgent) => {
    setEditingAgent(agent); setAgentForm(agentToForm(agent)); setError(null); setAgentModalOpen(true);
  };
  const openCopyAgent = (agent: MonitoringAgent) => {
    setEditingAgent(null);
    setAgentForm({ ...agentToForm(agent), name: `${agent.name} (copy)` });
    setError(null);
    setAgentModalOpen(true);
  };
  const openCreateCheck = () => {
    setEditingCheck(null);
    setCheckForm(emptyCheckForm());
    setCheckError(null);
    setDeviceDropdownOpened(false);
    setCheckModalOpen(true);
  };
  React.useEffect(() => {
    if (!quickCheckRequest || !checksQuery.isSuccess) return;
    const existing = checks.find(check =>
      check.deviceId === quickCheckRequest.deviceId &&
      check.checkType === "PING" &&
      check.targetMode === "CUSTOM" &&
      (check.targetValue ?? "").trim().toLowerCase() === quickCheckRequest.targetValue.trim().toLowerCase()
    );
    setEditingCheck(existing ?? null);
    setCheckForm(existing
      ? checkToForm(existing)
      : { ...emptyCheckForm(), deviceId: quickCheckRequest.deviceId, name: "Ping", checkType: "PING", targetMode: "EXISTING_IDENTITY", targetValue: quickCheckRequest.targetValue });
    setCheckError(null);
    setDeviceDropdownOpened(false);
    setCheckModalOpen(true);
  }, [quickCheckRequest?.requestId, checksQuery.isSuccess]);

  const closeCheckModal = () => {
    const wasQuickCheck = Boolean(quickCheckRequest);
    setCheckModalOpen(false);
    setCheckError(null);
    setDeviceDropdownOpened(false);
    if (wasQuickCheck) onQuickCheckFinished?.();
  };
  const openEditCheck = (check: MonitoringCheck) => {
    setEditingCheck(check);
    setCheckForm(checkToForm(check));
    setCheckError(null);
    setDeviceDropdownOpened(false);
    setCheckModalOpen(true);
  };
  const openCopyCheck = (check: MonitoringCheck) => {
    setEditingCheck(null);
    setCheckForm({ ...checkToForm(check), name: `${check.name} (copy)` });
    setCheckError(null);
    setDeviceDropdownOpened(false);
    setCheckModalOpen(true);
  };

  const sensorsphereUrl = typeof window === "undefined" ? "" : window.location.origin;
  const agentEnvironment = tokenInfo
    ? `SENSORSPHERE_URL=${sensorsphereUrl}\nSENSORSPHERE_AGENT_TOKEN=${tokenInfo.token}\n#AGENT_LABELS=vm-022,site-paris`
    : "";
  const monitoringReinstallCommand = tokenInfo ? ` SENSORSPHERE_URL='${sensorsphereUrl}' \
SENSORSPHERE_AGENT_TOKEN='${tokenInfo.token}' \
VERSION=${versionsQuery.data?.agents.monitorAgent.latestVersion ?? "latest"} \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-monitor-agent/master/scripts/install.sh)"` : "";

  return (
    <Stack gap="md" className="monitoring-panel">
      {view !== "agents" && <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {[
          ["Agents", agents.length, "blue"],
          ["Agents online", onlineAgents, "green"],
          ["Checks", checks.length, "violet"],
          ["Up", upChecks, "green"],
          ["Down", downChecks, "red"],
          ["Unknown", unknownChecks, "gray"]
        ].map(([label, value, color]) => (
          <Card key={String(label)} withBorder p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${String(color)}-6)` }}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={700} size="xl" c={String(color)}>{value}</Text>
          </Card>
        ))}
      </SimpleGrid>}

      {error && <Text c="red" size="sm">{error}</Text>}

      <Tabs value={view === "all" ? monitoringTab : view} onChange={value => view === "all" && value && setMonitoringTab(value as "checks" | "agents")} keepMounted={false} className="monitoring-tabs">
        {view === "all" && <Tabs.List mb="sm">
          <Tabs.Tab value="checks">Device Checks</Tabs.Tab>
          <Tabs.Tab value="agents">Monitoring Agents</Tabs.Tab>
        </Tabs.List>}

        <Tabs.Panel value="checks" className="monitoring-tab-panel">
      <Card withBorder className="monitoring-table-card">
                  <Group justify="space-between" mb="sm">
                    <div><Title order={4}>Device checks</Title><Text size="xs" c="dimmed">Checks are assigned to persistent Monitoring Slots; the physical Monitoring Agent behind a Slot can be replaced without changing the Check.</Text></div>
                    <Group gap="xs">
                      <Button size="xs" variant="light" disabled={selectedCheckIds.length === 0} onClick={() => setBulkSlotsOpen(true)}>
                        Slots for selected ({selectedCheckIds.length})
                      </Button>
                      <Button size="xs" onClick={openCreateCheck} disabled={slots.length === 0}>+ Add check</Button>
                    </Group>
                  </Group>
                  <Group gap="xs" mb="sm" wrap="wrap">
                    <ResetFiltersAction active={checkFiltersActive} onReset={() => { setCheckDeviceFilter(""); setCheckClassFilter(null); setCheckTypeFilter(null); setCheckTechnologyFilter(null); setCheckNameFilter(""); setCheckSlotFilter(""); setCheckStatusFilter(null); }} />
                    <TextInput size="xs" placeholder="Device name" value={checkDeviceFilter} onChange={event => setCheckDeviceFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(checkDeviceFilter.trim()))} rightSection={<FilterClearAction active={Boolean(checkDeviceFilter.trim())} onClear={() => setCheckDeviceFilter("")} />} w={170} />
                    <Select size="xs" clearable searchable placeholder="Class" data={[...new Map(devices.map(device => [device.deviceClass, { value: device.deviceClass, label: device.deviceClassInfo.label }])).values()].sort((a,b)=>a.label.localeCompare(b.label))} value={checkClassFilter} onChange={setCheckClassFilter} styles={activeFilterStyles(Boolean(checkClassFilter))} w={150} />
                    <Select size="xs" clearable searchable placeholder="Type" data={[...new Map(devices.map(device => [device.deviceType, { value: device.deviceType, label: device.deviceTypeInfo.label }])).values()].sort((a,b)=>a.label.localeCompare(b.label))} value={checkTypeFilter} onChange={setCheckTypeFilter} styles={activeFilterStyles(Boolean(checkTypeFilter))} w={160} />
                    <Select size="xs" clearable searchable placeholder="Technology" data={[...new Map(devices.flatMap(device => device.technologies.map(item => [item.code, { value:item.code, label:item.label }] as const))).values()].sort((a,b)=>a.label.localeCompare(b.label))} value={checkTechnologyFilter} onChange={setCheckTechnologyFilter} styles={activeFilterStyles(Boolean(checkTechnologyFilter))} w={170} />
                    <TextInput size="xs" placeholder="Check / type" value={checkNameFilter} onChange={event => setCheckNameFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(checkNameFilter.trim()))} rightSection={<FilterClearAction active={Boolean(checkNameFilter.trim())} onClear={() => setCheckNameFilter("")} />} w={160} />
                    <TextInput size="xs" placeholder="Slot" value={checkSlotFilter} onChange={event => setCheckSlotFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(checkSlotFilter.trim()))} rightSection={<FilterClearAction active={Boolean(checkSlotFilter.trim())} onClear={() => setCheckSlotFilter("")} />} w={150} />
                    <Select size="xs" clearable placeholder="Status" data={["UP","DOWN","UNKNOWN"]} value={checkStatusFilter} onChange={setCheckStatusFilter} styles={activeFilterStyles(Boolean(checkStatusFilter))} w={135} />
                    <Text size="xs" c="dimmed">{filteredChecks.length}/{checks.length}</Text>
                  </Group>
                  <div className="monitoring-table-scroll">
                      <Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
                    <Table.Thead><Table.Tr>
                      <Table.Th style={{ width: 36 }}>
                        <Checkbox
                          aria-label="Select all visible checks"
                          checked={filteredChecks.length > 0 && filteredChecks.every(check => selectedCheckIds.includes(check.id))}
                          indeterminate={filteredChecks.some(check => selectedCheckIds.includes(check.id)) && !filteredChecks.every(check => selectedCheckIds.includes(check.id))}
                          onChange={event => {
                            const visibleIds = filteredChecks.map(check => check.id);
                            setSelectedCheckIds(current => event.currentTarget.checked
                              ? [...new Set([...current, ...visibleIds])]
                              : current.filter(id => !visibleIds.includes(id)));
                          }}
                        />
                      </Table.Th>
                      <SortableTableHeader active={checkSortKey === "device"} direction={checkSortDirection} onClick={() => toggleCheckSort("device")}>Device</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "class"} direction={checkSortDirection} onClick={() => toggleCheckSort("class")}>Class</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "type"} direction={checkSortDirection} onClick={() => toggleCheckSort("type")}>Type</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "technology"} direction={checkSortDirection} onClick={() => toggleCheckSort("technology")}>Technology</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "check"} direction={checkSortDirection} onClick={() => toggleCheckSort("check")}>Check</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "target"} direction={checkSortDirection} onClick={() => toggleCheckSort("target")}>Target</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "agents"} direction={checkSortDirection} onClick={() => toggleCheckSort("agents")}>Slots</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "mode"} direction={checkSortDirection} onClick={() => toggleCheckSort("mode")}>Mode</SortableTableHeader>
                      <SortableTableHeader active={checkSortKey === "status"} direction={checkSortDirection} onClick={() => toggleCheckSort("status")}>Status</SortableTableHeader>
                      <Table.Th style={{ width: 116, textAlign: "right" }}>Actions</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {filteredChecks.map(check => {
                        const status = overallCheckStatus(check);
                        const target = check.targetMode === "CUSTOM" ? check.targetValue : check.targetMode.replaceAll("_", " ");
                        const device = deviceById.get(check.deviceId);
                        return <Table.Tr key={check.id}>
                          <Table.Td>
                            <Checkbox
                              aria-label={`Select ${check.name}`}
                              checked={selectedCheckIds.includes(check.id)}
                              onChange={event => setSelectedCheckIds(current =>
                                event.currentTarget.checked
                                  ? [...new Set([...current, check.id])]
                                  : current.filter(id => id !== check.id)
                              )}
                            />
                          </Table.Td>
                          <Table.Td><Text fw={600} size="sm">{check.deviceName}</Text></Table.Td>
                          <Table.Td>{device ? <Group gap={6} wrap="nowrap"><DeviceGlyph icon={device.deviceClassInfo.icon} color={device.deviceClassInfo.color} /><Text size="sm">{device.deviceClassInfo.label}</Text></Group> : "—"}</Table.Td>
                          <Table.Td>{device ? <Group gap={6} wrap="nowrap"><DeviceGlyph icon={device.deviceTypeInfo.icon} color={device.deviceTypeInfo.color} /><Text size="sm">{device.deviceTypeInfo.label}</Text></Group> : "—"}</Table.Td>
                          <Table.Td>{device && device.technologies.length > 0 ? <Group gap={6} wrap="wrap">{device.technologies.map(item => <Group key={item.code} gap={4} wrap="nowrap"><DeviceGlyph icon={item.icon} color={item.color} /><Text size="xs">{item.label}</Text></Group>)}</Group> : "—"}</Table.Td>
                          <Table.Td><Text size="sm">{check.name}</Text><Text size="xs" c="dimmed">{check.checkType} · {check.intervalSeconds}s</Text></Table.Td>
                          <Table.Td>{(() => {
                            const resolvedTarget = resolveCheckTarget(check, device);
                            return <Stack gap={2}><Code>{target ?? "—"}{check.port ? `:${check.port}` : ""}</Code>{resolvedTarget && <Text size="xs" c="dimmed">→ {resolvedTarget}{check.port ? `:${check.port}` : ""}</Text>}</Stack>;
                          })()}</Table.Td>
                          <Table.Td>
                            <Group gap={4} wrap="wrap">
                              {check.assignments.map(item => (
                                <Badge
                                  key={item.slotId}
                                  size="xs"
                                  variant="light"
                                  color={item.bound ? "teal" : "orange"}
                                  title={item.agentName ?? "No Monitoring Agent bound"}
                                >
                                  {item.slotName}{item.bound ? "" : " · UNBOUND"}
                                </Badge>
                              ))}
                            </Group>
                          </Table.Td>
                          <Table.Td><Badge size="sm" variant="light">{check.executionMode}</Badge></Table.Td>
                          <Table.Td><Badge size="sm" color={STATUS_COLORS[status]}>{status}</Badge></Table.Td>
                          <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end"><EditActionIcon onClick={() => openEditCheck(check)} /><Tooltip label="Copy monitoring check"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy monitoring check" onClick={() => openCopyCheck(check)}>⧉</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setCheckDeleteTarget(check)} /></Group></Table.Td>
                        </Table.Tr>;
                      })}
                      {filteredChecks.length === 0 && <Table.Tr><Table.Td colSpan={11}><Text ta="center" c="dimmed" py="xl">{checks.length === 0 ? "No monitoring checks yet." : "No monitoring checks match the active filters."}</Text></Table.Td></Table.Tr>}
                    </Table.Tbody>
                      </Table>
                  </div>
                </Card>
        </Tabs.Panel>

        <Tabs.Panel value="agents" className="monitoring-tab-panel">
      <Card withBorder className="monitoring-table-card">
                  <Group justify="space-between" mb="sm">
                    <div><Title order={4}>Monitoring agents</Title><Text size="xs" c="dimmed">Independent pull agents authenticate with a SensorSphere-generated token.</Text></div>
                    <Group gap="xs"><Button size="xs" variant="light" color="violet" onClick={() => setSlotManagerOpen(true)}>Manage Slots</Button><Button size="xs" variant="light" color="teal" disabled={bulkMonitoringCandidates.length === 0} onClick={() => setBulkUpdateOpen(true)}>Update All ({bulkMonitoringCandidates.length})</Button><Button size="xs" onClick={openCreateAgent}>Add Monitoring Agent</Button></Group>
                  </Group>
                  <Group gap="xs" mb="sm" wrap="wrap">
                    <ResetFiltersAction active={agentFiltersActive} onReset={() => { setAgentNameFilter(""); setAgentStatusFilter(null); setAgentHostFilter(""); setAgentLabelsFilter(""); setAgentSlotFilter(null); }} />
                    <TextInput size="xs" placeholder="Filter name" value={agentNameFilter} onChange={event => setAgentNameFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentNameFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentNameFilter.trim())} onClear={() => setAgentNameFilter("")} />} w={180} />
                    <Select size="xs" clearable placeholder="Status" data={["ONLINE","OFFLINE","DISABLED"]} value={agentStatusFilter} onChange={setAgentStatusFilter} styles={activeFilterStyles(Boolean(agentStatusFilter))} w={140} />
                    <TextInput size="xs" placeholder="Host / IP" value={agentHostFilter} onChange={event => setAgentHostFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentHostFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentHostFilter.trim())} onClear={() => setAgentHostFilter("")} />} w={180} />
                    <TextInput size="xs" placeholder="Agent labels" value={agentLabelsFilter} onChange={event => setAgentLabelsFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentLabelsFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentLabelsFilter.trim())} onClear={() => setAgentLabelsFilter("")} />} w={220} />
                    <Select
                      size="xs"
                      clearable
                      searchable
                      placeholder="Slot"
                      data={[
                        { value: "__UNBOUND__", label: "Unbound / no Slot" },
                        ...slots.map(slot => ({ value: slot.id, label: slot.name }))
                      ]}
                      value={agentSlotFilter}
                      onChange={setAgentSlotFilter}
                      styles={activeFilterStyles(Boolean(agentSlotFilter))}
                      w={180}
                    />
                    <Text size="xs" c="dimmed">{filteredAgents.length}/{agents.length}</Text>
                  </Group>
                  <div className="monitoring-table-scroll">
                      <Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
                    <Table.Thead><Table.Tr>
                      <SortableTableHeader active={agentSortKey === "name"} direction={agentSortDirection} onClick={() => toggleAgentSort("name")}>Name</SortableTableHeader>
                      <SortableTableHeader active={agentSortKey === "status"} direction={agentSortDirection} onClick={() => toggleAgentSort("status")}>Status</SortableTableHeader>
                      <Table.Th>Slot</Table.Th>
                      <SortableTableHeader active={agentSortKey === "host"} direction={agentSortDirection} onClick={() => toggleAgentSort("host")}>Reported</SortableTableHeader>
                      <SortableTableHeader active={agentSortKey === "version"} direction={agentSortDirection} onClick={() => toggleAgentSort("version")}>Version</SortableTableHeader>
                      <Table.Th>System</Table.Th>
                      <Table.Th>Host Network</Table.Th>
                      <SortableTableHeader active={agentSortKey === "lastSeen"} direction={agentSortDirection} onClick={() => toggleAgentSort("lastSeen")}>Last Seen</SortableTableHeader>
                      <SortableTableHeader active={agentSortKey === "checks"} direction={agentSortDirection} onClick={() => toggleAgentSort("checks")}>Checks count</SortableTableHeader>

                      <SortableTableHeader active={agentSortKey === "agentLabels"} direction={agentSortDirection} onClick={() => toggleAgentSort("agentLabels")}>Agent Labels</SortableTableHeader>
                      <Table.Th style={{ width: 160, textAlign: "right" }}>Actions</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {filteredAgents.map(agent => (
                        <Table.Tr key={agent.id}>
                          <Table.Td><Text fw={600} size="sm">{agent.name}</Text>{agent.managedBySupervisorName ? <Text size="xs" c="dimmed">Supervisor: {agent.managedBySupervisorName}{agent.managedInstance && agent.managedInstance !== "main" ? ` / ${agent.managedInstance}` : ""}</Text> : <Text size="xs" c="orange">[No supervisor]</Text>}</Table.Td>
                          <Table.Td><Badge size="sm" variant="light" color={agent.online ? "green" : agent.enabled ? "gray" : "red"}>{agent.online ? "ONLINE" : agent.enabled ? "OFFLINE" : "DISABLED"}</Badge></Table.Td>
                          <Table.Td>{agent.slotName ? <Badge size="sm" variant="light" color="violet">{agent.slotName}</Badge> : <Badge size="sm" variant="light" color="orange">NO SLOT</Badge>}</Table.Td>
                          <Table.Td><AgentReportedCell reportedName={agent.reportedName} hostname={agent.hostname} /></Table.Td>
                          <Table.Td><Text size="sm">{agent.version ?? "—"}</Text>{["UPDATE_REQUESTED", "REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? <><Badge size="xs" variant="light" color="blue">{agent.updateStatus}</Badge><UpdateLifecycleAge status={agent.updateStatus} timestamp={agent.updateStartedAt} />{agent.desiredVersion && <Text size="xs" c="dimmed">Target {agent.desiredVersion}</Text>}</> : <>{agent.updateStatus !== "FAILED" && <AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents.monitorAgent} />}{agent.updateStatus === "FAILED" && <><Tooltip label={agent.updateError ?? "Monitoring Agent update failed"}><Badge size="xs" variant="light" color="red">FAILED</Badge></Tooltip><UpdateLifecycleAge status="FAILED" timestamp={agent.updateFinishedAt} label="failed" /></>}{agent.lastSuccessfulUpdateAt && <Text size="xs" c="dimmed" title={agent.lastSuccessfulUpdateAt}>Updated {relativeAge(agent.lastSuccessfulUpdateAt)}</Text>}</>}</Table.Td>
                          <Table.Td><AgentSystemCell os={agent.os} osVersion={agent.osVersion} architecture={agent.architecture} /></Table.Td>
                          <Table.Td><HostNetworkCell networks={agent.hostNetworks.length > 0 ? agent.hostNetworks : agent.managedBySupervisorId ? supervisorById.get(agent.managedBySupervisorId)?.hostNetworks : undefined} /></Table.Td>
                          <Table.Td title={agent.lastSeenAt ?? undefined}>{relativeAge(agent.lastSeenAt)}</Table.Td>
                          <Table.Td>{(() => { const count = agent.slotId ? checks.filter(check => check.assignments.some(item => item.slotId === agent.slotId)).length : 0; return <Text size="sm" fw={700} c={count > 0 ? "green.6" : "dimmed"}>{count}</Text>; })()}</Table.Td>

                          <Table.Td>{agent.agentLabels.length > 0 ? <Group gap={4} wrap="wrap">{agent.agentLabels.map(label => <Badge key={label} size="xs" variant="light" color="cyan">{label}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
                          <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end"><Tooltip label={managedRuntimeInstalled(agent) ? "Update Monitoring Agent" : agent.managedBySupervisorId ? "Monitoring Agent runtime is missing; reinstall it from Supervisor Agents" : "No online Supervisor manages this Monitoring Agent"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Monitoring Agent" disabled={!managedRuntimeInstalled(agent)} onClick={() => openMonitoringAgentUpdate(agent)}><AgentUpdateIcon /></ActionIcon></Tooltip><EditActionIcon onClick={() => openEditAgent(agent)} /><Tooltip label="Copy monitoring agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy monitoring agent" onClick={() => openCopyAgent(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Check deployed token"><ActionIcon size="sm" variant="light" color="teal" aria-label="Check deployed token" onClick={() => checkToken.mutate(agent)}><CheckTokenIcon /></ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerateToken.mutate(agent.id)}>↻</ActionIcon></Tooltip><ReinstallCommandActionIcon onClick={() => reinstallToken.mutate(agent)} loading={reinstallToken.isPending && reinstallToken.variables?.id === agent.id} /><DeleteActionIcon onClick={() => setAgentDeleteTarget(agent)} /></Group></Table.Td>
                        </Table.Tr>
                      ))}
                      {filteredAgents.length === 0 && <Table.Tr><Table.Td colSpan={12}><Text ta="center" c="dimmed" py="xl">{agents.length === 0 ? "No monitoring agents. Create an agent before assigning checks." : "No monitoring agents match the active filters."}</Text></Table.Td></Table.Tr>}
                    </Table.Tbody>
                      </Table>
                  </div>
                </Card>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={slotManagerOpen} onClose={() => setSlotManagerOpen(false)} title="Monitoring Slots" size="xl">
        <Stack gap="md">
          <Card withBorder>
            <Stack gap="sm">
              <Text fw={600}>Create Slot</Text>
              <Group align="end">
                <TextInput label="Name" placeholder="LAN" value={newSlotName} onChange={event => setNewSlotName(event.currentTarget.value)} style={{ flex: 1 }} />
                <TextInput label="Description" placeholder="Optional description" value={newSlotDescription} onChange={event => setNewSlotDescription(event.currentTarget.value)} style={{ flex: 2 }} />
                <Button loading={createSlotMutation.isPending} disabled={!newSlotName.trim()} onClick={() => createSlotMutation.mutate()}>Create</Button>
              </Group>
            </Stack>
          </Card>

          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Slot</Table.Th>
                <Table.Th>Monitoring Agent</Table.Th>
                <Table.Th>Checks</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {slots.map(slot => {
                const checkCount = checks.filter(check => check.assignments.some(item => item.slotId === slot.id)).length;
                return (
                  <Table.Tr key={slot.id}>
                    <Table.Td>
                      <TextInput
                        defaultValue={slot.name}
                        aria-label={`Slot name ${slot.name}`}
                        onBlur={event => {
                          const name = event.currentTarget.value.trim();
                          if (name && name !== slot.name) updateSlotMutation.mutate({ slotId: slot.id, input: { name } });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        clearable
                        searchable
                        placeholder="Unbound"
                        value={slot.agentId}
                        data={agents.map(agent => ({
                          value: agent.id,
                          label: agent.slotId && agent.slotId !== slot.id
                            ? `${agent.name} · currently ${agent.slotName ?? "bound"}`
                            : agent.name
                        })).sort((a, b) => a.label.localeCompare(b.label))}
                        onChange={agentId => updateSlotMutation.mutate({ slotId: slot.id, input: { agentId: agentId ?? null } })}
                      />
                    </Table.Td>
                    <Table.Td><Text fw={700}>{checkCount}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={slot.bound ? "green" : "orange"} variant="light">
                        {slot.bound ? "BOUND" : "UNBOUND"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end">
                        <Button
                          size="compact-xs"
                          variant="light"
                          color={slot.enabled ? "gray" : "green"}
                          onClick={() => updateSlotMutation.mutate({ slotId: slot.id, input: { enabled: !slot.enabled } })}
                        >
                          {slot.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="red"
                          disabled={checkCount > 0}
                          title={checkCount > 0 ? "Remove this Slot from all Checks before deleting it" : "Delete Slot"}
                          loading={removeSlotMutation.isPending && removeSlotMutation.variables === slot.id}
                          onClick={() => removeSlotMutation.mutate(slot.id)}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {slots.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}><Text ta="center" c="dimmed" py="md">No Monitoring Slots.</Text></Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Modal>

      <Modal opened={bulkSlotsOpen} onClose={() => !bulkSlotsMutation.isPending && setBulkSlotsOpen(false)} title="Update Monitoring Slots in bulk" centered size="lg">
        <Stack>
          <Text size="sm">{selectedCheckIds.length} Device Check{selectedCheckIds.length === 1 ? "" : "s"} selected.</Text>
          <Select
            label="Operation"
            value={bulkSlotMode}
            allowDeselect={false}
            data={[
              { value: "REPLACE", label: "Replace Slots" },
              { value: "ADD", label: "Add Slots" },
              { value: "REMOVE", label: "Remove Slots" }
            ]}
            onChange={value => value && setBulkSlotMode(value as "ADD" | "REMOVE" | "REPLACE")}
          />
          <MultiSelect
            label="Slots"
            searchable
            data={slots.map(slot => ({
              value: slot.id,
              label: slot.bound ? `${slot.name} → ${slot.agentName ?? "agent"}` : `${slot.name} · UNBOUND`
            })).sort((a, b) => a.label.localeCompare(b.label))}
            value={bulkSlotIds}
            onChange={setBulkSlotIds}
          />
          <Text size="xs" c="dimmed">
            Replace overwrites the Slot assignments of every selected Check. Add preserves existing Slots. Remove removes only the selected Slots.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={bulkSlotsMutation.isPending} onClick={() => setBulkSlotsOpen(false)}>Cancel</Button>
            <Button
              color="violet"
              loading={bulkSlotsMutation.isPending}
              disabled={selectedCheckIds.length === 0 || bulkSlotIds.length === 0}
              onClick={() => bulkSlotsMutation.mutate()}
            >
              Apply to {selectedCheckIds.length} Check{selectedCheckIds.length === 1 ? "" : "s"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={bulkUpdateOpen} onClose={() => !bulkMonitoringUpdateMutation.isPending && setBulkUpdateOpen(false)} title="Update all Monitoring Agents" centered>
        <Stack><Text size="sm">Update {bulkMonitoringCandidates.length} Monitoring Agent{bulkMonitoringCandidates.length === 1 ? "" : "s"} to <strong>{latestMonitoringVersion ?? "—"}</strong>?</Text>{bulkMonitoringCandidates.map(({ agent }) => <Text size="sm" key={agent.id}>{agent.name}: {agent.version ?? "—"} → {latestMonitoringVersion}</Text>)}{bulkMonitoringUpdateMutation.isError && <Text size="sm" c="red">{bulkMonitoringUpdateMutation.error instanceof Error ? bulkMonitoringUpdateMutation.error.message : "Unable to update all Monitoring Agents"}</Text>}<Group justify="flex-end"><Button variant="default" disabled={bulkMonitoringUpdateMutation.isPending} onClick={() => setBulkUpdateOpen(false)}>Cancel</Button><Button color="teal" loading={bulkMonitoringUpdateMutation.isPending} disabled={bulkMonitoringCandidates.length === 0} onClick={() => bulkMonitoringUpdateMutation.mutate(bulkMonitoringCandidates)}>Update All</Button></Group></Stack>
      </Modal>

      <Modal opened={agentUpdateTarget != null} onClose={() => { if (!monitoringAgentUpdateMutation.isPending) { setAgentUpdateTarget(null); setAgentUpdateStatus("IDLE"); setAgentUpdateError(null); } }} title="Update Monitoring Agent" centered>
        <Stack>
          <Text size="sm">Update Monitoring Agent <strong>{agentUpdateTarget?.name}</strong> through its host Supervisor.</Text>
          {agentUpdateTarget && !agentUpdateTarget.managedAssociationId && <Text size="sm" c="orange">This Monitoring Agent has no explicit Supervisor association. Associate its existing installation before updating it.</Text>}
          <Select label="Supervisor Agent" data={(supervisorsQuery.data ?? []).filter(item => item.id === agentUpdateSupervisorId).map(item => ({ value: item.id, label: item.name }))} value={agentUpdateSupervisorId} disabled />
          <TextInput label="Managed instance" value={agentUpdateInstance ?? ""} readOnly />
          <TextInput label="Target version" value={agentUpdateVersion} onChange={event => setAgentUpdateVersion(event.currentTarget.value)} disabled={monitoringAgentUpdateMutation.isPending || agentUpdateStatus === "UPDATED"} />
          <Card withBorder p="sm"><Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={agentUpdateStatus === "UPDATED" ? "green" : agentUpdateStatus === "FAILED" ? "red" : ["UPDATING", "VERIFYING"].includes(agentUpdateStatus) ? "blue" : "teal"}>{agentUpdateStatus === "IDLE" ? "READY" : agentUpdateStatus}</Badge></Group></Card>
          <AgentActionDetails label={`Update Monitoring Agent / ${agentUpdateInstance ?? "main"}`} operation={agentUpdateOperation} />
          {agentUpdateError && <Text size="sm" c="red">{agentUpdateError}</Text>}
          <Group justify="flex-end"><Button variant="default" disabled={monitoringAgentUpdateMutation.isPending} onClick={() => { setAgentUpdateTarget(null); setAgentUpdateStatus("IDLE"); setAgentUpdateError(null); }}>Close</Button><Button color="teal" variant="light" loading={monitoringAgentUpdateMutation.isPending} disabled={!agentUpdateSupervisorId || !agentUpdateInstance || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(agentUpdateVersion.trim()) || monitoringAgentUpdateMutation.isPending} onClick={() => agentUpdateTarget && agentUpdateSupervisorId && agentUpdateInstance && monitoringAgentUpdateMutation.mutate({ supervisorId: agentUpdateSupervisorId, agentId: agentUpdateTarget.id, instance: agentUpdateInstance, version: agentUpdateVersion.trim(), closeOnSuccess: true })}>Update and Close</Button><Button color="teal" loading={monitoringAgentUpdateMutation.isPending} disabled={!agentUpdateSupervisorId || !agentUpdateInstance || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(agentUpdateVersion.trim()) || monitoringAgentUpdateMutation.isPending} onClick={() => agentUpdateTarget && agentUpdateSupervisorId && agentUpdateInstance && monitoringAgentUpdateMutation.mutate({ supervisorId: agentUpdateSupervisorId, agentId: agentUpdateTarget.id, instance: agentUpdateInstance, version: agentUpdateVersion.trim(), closeOnSuccess: false })}>Update</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={agentModalOpen} onClose={() => setAgentModalOpen(false)} title={editingAgent ? "Edit monitoring agent" : "Add monitoring agent"}>
        <Stack>
          <TextInput label="Name" required autoFocus value={agentForm.name} onChange={event => { const value = event.currentTarget.value; setAgentForm(current => ({ ...current, name: value })); }} />
          <NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={agentForm.heartbeatTimeoutSeconds} onChange={value => setAgentForm(current => ({ ...current, heartbeatTimeoutSeconds: Number(value) || 90 }))} />
          <Textarea label="Labels" description="One key=value entry per line." placeholder={'site=home\nnetwork=lan'} minRows={3} value={agentForm.labelsText} onChange={event => { const value = event.currentTarget.value; setAgentForm(current => ({ ...current, labelsText: value })); }} />
          {editingAgent && <Checkbox label="Enabled" checked={agentForm.enabled} onChange={event => { const checked = event.currentTarget.checked; setAgentForm(current => ({ ...current, enabled: checked })); }} />}
          <Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setAgentModalOpen(false)}>Cancel</Button><Button loading={saveAgent.isPending} onClick={() => saveAgent.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>

      {copyNotice && (
        <Notification color="green" title="Copied" onClose={() => setCopyNotice(null)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 10000, width: 320 }}>
          {copyNotice}
        </Notification>
      )}

      <Modal opened={tokenCheckResult !== null} onClose={() => setTokenCheckResult(null)} title="Check Monitoring Agent token" centered>
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

      <Modal opened={tokenInfo !== null} onClose={() => setTokenInfo(null)} title={tokenInfo?.reinstall ? "Monitoring Agent reinstall command" : "Monitoring agent token"} size="lg">
        <Stack>
          <Text size="sm">Copy this token now. SensorSphere stores only its hash and cannot display it again.</Text>
          <TextInput
            label="Token"
            readOnly
            value={tokenInfo?.token ?? ""}
            rightSection={
              <Tooltip label="Copy token">
                <ActionIcon
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
              <Tooltip label="Copy all environment variables">
                <ActionIcon
                  variant="subtle"
                  aria-label="Copy all environment variables"
                  onClick={() => { if (!tokenInfo) return; void writeClipboardText(agentEnvironment).then(() => showCopyNotice("Agent environment copied to clipboard")); }}
                >
                  ⧉
                </ActionIcon>
              </Tooltip>
            </Group>
            <Code block>{agentEnvironment}</Code>
          </Stack>
          <Group justify="flex-end"><Button onClick={() => setTokenInfo(null)}>Close</Button></Group>

          {tokenInfo?.reinstall && <>
            <Text size="xs" fw={600}>Complete reinstall command</Text>
            <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1, whiteSpace: "pre-wrap" }}>{monitoringReinstallCommand}</Code><Tooltip label="Copy reinstall command"><ActionIcon variant="light" color="violet" aria-label="Copy reinstall command" onClick={() => void writeClipboardText(monitoringReinstallCommand).then(() => showCopyNotice("Reinstall command copied to clipboard"))}>⤓</ActionIcon></Tooltip></Group>
            <Text size="xs" c="orange">Generating this command regenerated the agent token. Run the command on the target host to reconnect the agent.</Text>
          </>}
          <Group justify="flex-end"><Button onClick={() => setTokenInfo(null)}>Close</Button></Group>
      </Stack>
      </Modal>

      <Modal opened={checkModalOpen} onClose={closeCheckModal} title={editingCheck ? "Edit monitoring check" : "Add monitoring check"} size="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label="Device"
              required
              searchable
              data={(devicesQuery.data ?? []).map(device => ({ value: device.id, label: device.name })).sort((a, b) => a.label.localeCompare(b.label))}
              value={checkForm.deviceId}
              dropdownOpened={deviceDropdownOpened}
              onDropdownClose={() => setDeviceDropdownOpened(false)}
              onClick={() => setDeviceDropdownOpened(true)}
              onKeyDown={event => {
                if (["ArrowDown", "Enter", " "].includes(event.key)) setDeviceDropdownOpened(true);
                if (event.key === "Escape") setDeviceDropdownOpened(false);
              }}
              onChange={value => {
                setDeviceDropdownOpened(false);
                setCheckForm(current => ({ ...current, deviceId: value, targetValue: current.targetMode === "EXISTING_IDENTITY" ? "" : current.targetValue }));
              }}
            />
            <TextInput label="Check name" required autoFocus value={checkForm.name} onChange={event => { const value = event.currentTarget.value; setCheckForm(current => ({ ...current, name: value })); }} />
            <Select label="Check type" required data={["PING", "TCP", "HTTP", "HTTPS"]} value={checkForm.checkType} onChange={value => value && setCheckForm(current => ({ ...current, checkType: value as MonitoringCheckType, port: value === "PING" ? "" : current.port }))} allowDeselect={false} />
            <Select label="Target" required data={[{ value: "PRIMARY_IP", label: "Primary IP" }, { value: "PRIMARY_FQDN", label: "Primary FQDN/hostname" }, { value: "PRIMARY_ADDRESS", label: "Primary IP or FQDN" }, { value: "EXISTING_IDENTITY", label: "Existing identity / address" }, { value: "CUSTOM", label: "Custom" }]} value={checkForm.targetMode} onChange={value => { setDeviceDropdownOpened(false); if (value) setCheckForm(current => ({ ...current, targetMode: value as CheckTargetSelectionMode, targetValue: value === "EXISTING_IDENTITY" ? "" : current.targetValue })); }} allowDeselect={false} />
            {checkForm.targetMode === "EXISTING_IDENTITY" && <Select label="Existing identity" required searchable disabled={!checkForm.deviceId} description={checkForm.deviceId ? "Uses the selected Device Registry identity. Labelled identities remain dynamic when their address changes." : "Select a device first."} placeholder={checkForm.deviceId ? "Select an IP or FQDN identity" : "Select a device first"} data={identityOptions} value={checkForm.targetValue || null} onChange={value => setCheckForm(current => ({ ...current, targetValue: value ?? "" }))} />}
            {checkForm.targetMode === "CUSTOM" && <Autocomplete label="Custom target" required description="Literal address/hostname or identity template. Available device identities are suggested below." placeholder="192.168.1.10 or {{identity:IP:VPN}}" data={identityOptions} value={checkForm.targetValue} onChange={value => setCheckForm(current => ({ ...current, targetValue: value }))} />}
            {checkForm.checkType !== "PING" && <NumberInput label="Port" min={1} max={65535} value={checkForm.port} onChange={value => setCheckForm(current => ({ ...current, port: value }))} />}
            {(checkForm.checkType === "HTTP" || checkForm.checkType === "HTTPS") && <TextInput label="Path" placeholder="/health" value={checkForm.path} onChange={event => { const value = event.currentTarget.value; setCheckForm(current => ({ ...current, path: value })); }} />}
            <NumberInput label="Interval (seconds)" min={5} value={checkForm.intervalSeconds} onChange={value => setCheckForm(current => ({ ...current, intervalSeconds: value }))} />
            <NumberInput label="Timeout (seconds)" min={1} value={checkForm.timeoutSeconds} onChange={value => setCheckForm(current => ({ ...current, timeoutSeconds: value }))} />
            <NumberInput label="Failures before DOWN" min={1} value={checkForm.failureThreshold} onChange={value => setCheckForm(current => ({ ...current, failureThreshold: value }))} />
            <NumberInput label="Successes before recovery" min={1} value={checkForm.recoveryThreshold} onChange={value => setCheckForm(current => ({ ...current, recoveryThreshold: value }))} />
            <Select label="Execution mode" required data={[{ value: "FAILOVER", label: "Failover (first healthy Slot)" }, { value: "ALL", label: "All bound assigned Slots" }]} value={checkForm.executionMode} onChange={value => value && setCheckForm(current => ({ ...current, executionMode: value as MonitoringExecutionMode }))} allowDeselect={false} />
          </SimpleGrid>
          <MultiSelect label="Monitoring slots" description={checkForm.executionMode === "FAILOVER" ? "Selection order defines slot failover priority. Unbound slots remain assigned but cannot execute checks." : "All bound selected slots execute this check."} required searchable data={slots.filter(slot => slot.enabled).map(slot => ({ value: slot.id, label: slot.bound ? `${slot.name} → ${slot.agentName ?? "agent"}` : `${slot.name} · UNBOUND` })).sort((a, b) => a.label.localeCompare(b.label))} value={checkForm.slotIds} onChange={value => setCheckForm(current => ({ ...current, slotIds: value }))} />
          <Checkbox label="Enabled" checked={checkForm.enabled} onChange={event => { const checked = event.currentTarget.checked; setCheckForm(current => ({ ...current, enabled: checked })); }} />
          {checkError && <Text c="red" size="sm">{checkError}</Text>}
          <Group justify="flex-end"><Button variant="light" color="gray" onClick={closeCheckModal}>Cancel</Button><Button loading={saveCheck.isPending} onClick={() => saveCheck.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={agentDeleteTarget !== null} onClose={() => setAgentDeleteTarget(null)} title="Delete monitoring agent" centered>
        <Stack><Text>Delete monitoring agent <b>{agentDeleteTarget?.name}</b>? Its Monitoring Slot and all Device Check assignments will be preserved. The Slot will become <b>UNBOUND</b> until another Monitoring Agent is assigned.{agentDeleteTarget?.managedBySupervisorId ? " Its local installation will first be removed by the associated Supervisor Agent." : ""}</Text><Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setAgentDeleteTarget(null)}>Cancel</Button><Button color="red" variant="light" loading={removeAgent.isPending} onClick={() => agentDeleteTarget && removeAgent.mutate(agentDeleteTarget)}>Delete</Button></Group></Stack>
      </Modal>

      <Modal opened={checkDeleteTarget !== null} onClose={() => setCheckDeleteTarget(null)} title="Delete monitoring check" centered>
        <Stack><Text>Delete monitoring check <b>{checkDeleteTarget?.name}</b> for <b>{checkDeleteTarget?.deviceName}</b>?</Text><Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setCheckDeleteTarget(null)}>Cancel</Button><Button color="red" variant="light" loading={removeCheck.isPending} onClick={() => checkDeleteTarget && removeCheck.mutate(checkDeleteTarget.id)}>Delete</Button></Group></Stack>
      </Modal>
    </Stack>
  );
}
