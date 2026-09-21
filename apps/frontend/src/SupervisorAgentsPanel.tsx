import React from "react";
import { ActionIcon, Badge, Button, Card, Code, Group, Modal, NumberInput, Select, Stack, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDeviceAgents, requestSupervisorAgentUpdate, runManagedAgentOperation } from "./api";
import type { DeviceAgent, ManagedAgentStatus } from "./types";
import { FilterClearAction } from "./FilterClearAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability } from "./AgentVersionAvailability";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";


export interface AutonomousSupervisorAgent {
  id: string; name: string; enabled: boolean; reportedName: string | null; version: string | null; hostname: string | null;
  os: string | null; osVersion: string | null; architecture: string | null; managedAgents: Array<Record<string, unknown>>;
  configuredVersion: string | null; containerState: string | null; selfUpdateSupported: boolean; updateStatus: string; updateError: string | null;
  lastSeenAt: string | null; heartbeatTimeoutSeconds: number; online: boolean; createdAt: string; updatedAt: string;
}

export async function getAutonomousSupervisors(): Promise<AutonomousSupervisorAgent[]> {
  const response = await fetch("/api/v1/device-control/supervisors");
  if (!response.ok) throw new Error(`Unable to load Supervisor Agents (${response.status})`);
  return response.json();
}

async function createAutonomousSupervisor(name: string): Promise<{ supervisor: AutonomousSupervisorAgent; token: string }> {
  const response = await fetch("/api/v1/device-control/supervisors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to create Supervisor Agent (${response.status})`);
  return payload;
}

async function updateAutonomousSupervisor(id: string, input: { name?: string; enabled?: boolean; heartbeatTimeoutSeconds?: number }): Promise<AutonomousSupervisorAgent> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to update Supervisor Agent (${response.status})`);
  return payload;
}

async function regenerateAutonomousSupervisorToken(id: string): Promise<{ supervisor: AutonomousSupervisorAgent; token: string }> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/regenerate-token`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to regenerate Supervisor token (${response.status})`);
  return payload;
}

async function deleteAutonomousSupervisor(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Unable to delete Supervisor Agent (${response.status})`);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function SupervisorUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.7 6.5 9.2 3.7-1.5 6.5-5 6.5-9.2V6L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.3 2.3M12 9l2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ManagedAgentsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="9" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 10v2h10v-2M12 12v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function relativeAge(value: string | null): string {
  if (!value) return "Never";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return value;
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function supervisorStatus(agent: DeviceAgent): { label: string; color: string } {
  if (!agent.online || !agent.supervisorAvailable) return { label: "OFFLINE", color: "gray" };
  if (agent.supervisorUpdateStatus === "FAILED") return { label: "FAILED", color: "red" };
  if (["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus)) return { label: agent.supervisorUpdateStatus, color: "blue" };
  if (agent.supervisorUpdateStatus === "UPDATED") return { label: "UPDATED", color: "green" };
  return { label: "ONLINE", color: "green" };
}

export function SupervisorAgentsPanel() {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const autonomousQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const [nameFilter, setNameFilter] = React.useState("");
  const [createOpened, setCreateOpened] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [tokenTitle, setTokenTitle] = React.useState("Supervisor Agent token");
  const [tokenSupervisorName, setTokenSupervisorName] = React.useState("");
  const [copiedField, setCopiedField] = React.useState<"token" | "command" | null>(null);
  const [editTarget, setEditTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editEnabled, setEditEnabled] = React.useState(true);
  const [editHeartbeatTimeout, setEditHeartbeatTimeout] = React.useState(60);
  const [deleteTarget, setDeleteTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [updateTarget, setUpdateTarget] = React.useState<DeviceAgent | null>(null);
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [managedTarget, setManagedTarget] = React.useState<DeviceAgent | null>(null);
  const [managedStatuses, setManagedStatuses] = React.useState<ManagedAgentStatus[]>([]);
  const [managedAgentType, setManagedAgentType] = React.useState<"device-agent" | "monitor-agent">("monitor-agent");
  const [managedInstance, setManagedInstance] = React.useState("main");
  const [managedVersion, setManagedVersion] = React.useState("");
  const [managedEnvironment, setManagedEnvironment] = React.useState("{}");

  const createMutation = useMutation({
    mutationFn: (name: string) => createAutonomousSupervisor(name),
    onSuccess: async result => { setTokenTitle("New Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const editMutation = useMutation({
    mutationFn: () => editTarget ? updateAutonomousSupervisor(editTarget.id, { name: editName.trim(), enabled: editEnabled, heartbeatTimeoutSeconds: editHeartbeatTimeout }) : Promise.reject(new Error("No Supervisor Agent selected")),
    onSuccess: async () => { setEditTarget(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const copyMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => createAutonomousSupervisor(`${agent.name} (copy)`),
    onSuccess: async result => { setTokenTitle("Copied Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const regenerateMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => regenerateAutonomousSupervisorToken(agent.id),
    onSuccess: async result => { setTokenTitle("Regenerated Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const deleteMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => deleteAutonomousSupervisor(agent.id),
    onSuccess: async () => { setDeleteTarget(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] });

  const updateMutation = useMutation({
    mutationFn: ({ agentId, version }: { agentId: string; version: string }) => requestSupervisorAgentUpdate(agentId, version),
    onSuccess: async () => { setUpdateTarget(null); setUpdateVersion(""); await refresh(); }
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
      if (variables.operation === "LIST") setManagedStatuses(Array.isArray(result.result) ? result.result as ManagedAgentStatus[] : []);
      else if (managedTarget) {
        const refreshed = await runManagedAgentOperation(managedTarget.id, { operation: "LIST" });
        setManagedStatuses(Array.isArray(refreshed.result) ? refreshed.result as ManagedAgentStatus[] : []);
        setManagedVersion("");
      }
    }
  });

  const allAgents = agentsQuery.data ?? [];
  const autonomous = autonomousQuery.data ?? [];
  const autonomousHosts = React.useMemo(() => new Set(autonomous.map(agent => (agent.hostname ?? agent.name).trim().toLowerCase())), [autonomous]);
  // Legacy Supervisors are still reported through Device Agent heartbeat data during the migration. Group by host so
  // multiple Device Agent instances on the same host do not create duplicate Supervisor rows.
  const supervisors = React.useMemo(() => {
    const byHost = new Map<string, DeviceAgent>();
    for (const agent of allAgents) {
      const key = (agent.hostname ?? agent.name).trim().toLowerCase();
      if (autonomousHosts.has(key)) continue;
      const current = byHost.get(key);
      if (!current || (!current.online && agent.online) || (!current.supervisorAvailable && agent.supervisorAvailable)) byHost.set(key, agent);
    }
    return [...byHost.values()].sort((a, b) => (a.hostname ?? a.name).localeCompare(b.hostname ?? b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [allAgents, autonomousHosts]);

  const filtered = supervisors.filter(agent => {
    const status = supervisorStatus(agent).label;
    const text = `${agent.hostname ?? ""} ${agent.name} ${agent.supervisorVersion ?? ""} ${agent.os ?? ""} ${agent.architecture ?? ""}`.toLowerCase();
    return (!nameFilter.trim() || text.includes(nameFilter.trim().toLowerCase())) && (!statusFilter || status === statusFilter);
  });

  const openManaged = async (agent: DeviceAgent) => {
    setManagedTarget(agent);
    setManagedStatuses([]);
    managedMutation.reset();
    try {
      const result = await runManagedAgentOperation(agent.id, { operation: "LIST" });
      setManagedStatuses(Array.isArray(result.result) ? result.result as ManagedAgentStatus[] : []);
    } catch {
      // The mutation UI will surface errors on explicit refresh/actions.
    }
  };

  const filtersActive = Boolean(nameFilter.trim() || statusFilter);
  const latestSupervisorVersion = versionsQuery.data?.agents.supervisorAgent.latestVersion ?? "latest";
  const supervisorInstallCommand = createdToken && tokenSupervisorName ? ` SENSORSPHERE_URL=${window.location.origin} \
SENSORSPHERE_AGENT_TOKEN='${createdToken}' \
SUPERVISOR_NAME='${tokenSupervisorName}' \
VERSION=${latestSupervisorVersion} \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-supervisor-agent/master/scripts/install.sh)"` : "";
  const copyAndMark = async (kind: "token" | "command", value: string) => {
    await copyText(value);
    setCopiedField(kind);
    window.setTimeout(() => setCopiedField(current => current === kind ? null : current), 1500);
  };

  return <Stack gap="md" className="agent-admin-panel">
    <Card withBorder>
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Autonomous Supervisor Agents</Text><Text size="xs" c="dimmed">Direct outbound Supervisor → SensorSphere connections. No Device Agent relay required.</Text></div><Button size="xs" onClick={() => { setCreateOpened(true); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); setCreateName(""); }}>Add Supervisor Agent</Button></Group>
      <Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Host</Table.Th><Table.Th>Status</Table.Th><Table.Th>Version</Table.Th><Table.Th>System</Table.Th><Table.Th>Managed agents</Table.Th><Table.Th>Last seen</Table.Th><Table.Th style={{ width: 140, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{autonomous.map(agent => <Table.Tr key={agent.id}><Table.Td><Text fw={600} size="sm">{agent.hostname ?? agent.reportedName ?? agent.name}</Text><Text size="xs" c="dimmed">{agent.name}</Text></Table.Td><Table.Td><Badge size="sm" variant="light" color={agent.online ? "green" : "gray"}>{agent.online ? "ONLINE" : "OFFLINE"}</Badge></Table.Td><Table.Td><Text size="sm">{agent.version ?? "—"}</Text><AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents.supervisorAgent} /></Table.Td><Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td><Table.Td><Badge size="xs" variant="light">{agent.managedAgents.length}</Badge></Table.Td><Table.Td><Text size="sm">{relativeAge(agent.lastSeenAt)}</Text></Table.Td><Table.Td><Group gap={4} wrap="nowrap" justify="flex-end"><EditActionIcon onClick={() => { setEditTarget(agent); setEditName(agent.name); setEditEnabled(agent.enabled); setEditHeartbeatTimeout(agent.heartbeatTimeoutSeconds); editMutation.reset(); }} /><Tooltip label="Copy supervisor agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy supervisor agent" onClick={() => copyMutation.mutate(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate supervisor token" onClick={() => regenerateMutation.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td></Table.Tr>)}{autonomous.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">No autonomous Supervisor Agents registered yet.</Text></Table.Td></Table.Tr>}</Table.Tbody></Table>
    </Card>

    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm">
        <div><Text fw={600}>Legacy relayed Supervisors</Text><Text size="xs" c="dimmed">Backward-compatible Supervisor state reported through Device Agents. Hosts with a direct Supervisor connection are hidden here.</Text></div>
        <Text size="xs" c="dimmed">{filtered.length}/{supervisors.length}</Text>
      </Group>
      <Group gap="xs" mb="sm" wrap="wrap">
        <ResetFiltersAction active={filtersActive} onReset={() => { setNameFilter(""); setStatusFilter(null); }} />
        <TextInput size="xs" placeholder="Host / name / version" value={nameFilter} onChange={event => setNameFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(nameFilter.trim()))} rightSection={<FilterClearAction active={Boolean(nameFilter.trim())} onClear={() => setNameFilter("")} />} w={210} />
        <Select size="xs" clearable placeholder="Status" data={["ONLINE", "OFFLINE", "UPDATING", "VERIFYING", "UPDATED", "FAILED"]} value={statusFilter} onChange={setStatusFilter} styles={activeFilterStyles(Boolean(statusFilter))} w={150} />
      </Group>
      <div className="monitoring-table-scroll">
        <Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
          <Table.Thead><Table.Tr><Table.Th>Host</Table.Th><Table.Th>Status</Table.Th><Table.Th>Version</Table.Th><Table.Th>Container</Table.Th><Table.Th>System</Table.Th><Table.Th>Last seen</Table.Th><Table.Th>Reported through</Table.Th><Table.Th style={{ width: 110, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {filtered.map(agent => {
              const status = supervisorStatus(agent);
              return <Table.Tr key={(agent.hostname ?? agent.name).toLowerCase()}>
                <Table.Td><Text fw={600} size="sm">{agent.hostname ?? agent.name}</Text></Table.Td>
                <Table.Td><Tooltip label={agent.supervisorUpdateError ?? undefined}><Badge size="sm" variant="light" color={status.color}>{status.label}</Badge></Tooltip></Table.Td>
                <Table.Td><Text size="sm">{agent.supervisorVersion ?? "—"}</Text><AgentVersionFreshnessBadge installedVersion={agent.supervisorVersion} release={versionsQuery.data?.agents.supervisorAgent} />{agent.supervisorDesiredVersion && agent.supervisorDesiredVersion !== agent.supervisorVersion && <Text size="xs" c="dimmed">Target {agent.supervisorDesiredVersion}</Text>}</Table.Td>
                <Table.Td><Badge size="xs" variant="light" color={agent.supervisorContainerState === "running" ? "green" : "gray"}>{agent.supervisorContainerState ?? "—"}</Badge></Table.Td>
                <Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td>
                <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{relativeAge(agent.lastSeenAt)}</Text></Table.Td>
                <Table.Td><Text size="sm">{agent.name}</Text></Table.Td>
                <Table.Td><Group gap={6} wrap="nowrap" justify="flex-end">
                  <Tooltip label={!agent.online ? "Device Agent heartbeat route is offline" : !agent.supervisorAvailable ? "Supervisor Agent is unavailable" : !agent.supervisorSelfUpdateSupported ? "Supervisor Agent does not support self-update" : "Update Supervisor Agent"}>
                    <ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.supervisorAvailable || !agent.supervisorSelfUpdateSupported || ["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisorUpdateStatus)} onClick={() => { setUpdateTarget(agent); setUpdateVersion(agent.supervisorDesiredVersion ?? versionsQuery.data?.agents.supervisorAgent.latestVersion ?? agent.supervisorVersion ?? ""); }}><SupervisorUpdateIcon /></ActionIcon>
                  </Tooltip>
                  <Tooltip label={agent.supervisorAvailable ? "Managed agents" : "Supervisor Agent is unavailable"}><ActionIcon size="sm" variant="light" color="indigo" aria-label="Managed agents" disabled={!agent.online || !agent.supervisorAvailable} onClick={() => void openManaged(agent)}><ManagedAgentsIcon /></ActionIcon></Tooltip>
                </Group></Table.Td>
              </Table.Tr>;
            })}
            {filtered.length === 0 && <Table.Tr><Table.Td colSpan={8}><Text ta="center" c="dimmed" py="xl">{supervisors.length === 0 ? "No Supervisor Agents reported yet." : "No Supervisor Agents match the active filters."}</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </div>
    </Card>


    <Modal opened={editTarget != null} onClose={() => setEditTarget(null)} title="Edit Supervisor Agent" centered>
      <Stack><TextInput label="Name" value={editName} onChange={event => setEditName(event.currentTarget.value)} /><Select label="Enabled" value={editEnabled ? "yes" : "no"} onChange={value => setEditEnabled(value !== "no")} data={[{ value: "yes", label: "Enabled" }, { value: "no", label: "Disabled" }]} /><NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={editHeartbeatTimeout} onChange={value => setEditHeartbeatTimeout(Number(value) || 60)} />{editMutation.isError && <Text c="red" size="sm">{editMutation.error instanceof Error ? editMutation.error.message : "Unable to update Supervisor Agent"}</Text>}<Group justify="flex-end"><Button variant="default" onClick={() => setEditTarget(null)}>Cancel</Button><Button loading={editMutation.isPending} disabled={!editName.trim()} onClick={() => editMutation.mutate()}>Save</Button></Group></Stack>
    </Modal>

    <Modal opened={deleteTarget != null} onClose={() => setDeleteTarget(null)} title="Delete Supervisor Agent" centered>
      <Stack><Text size="sm">Delete Supervisor Agent <strong>{deleteTarget?.name}</strong>? The running host will lose its SensorSphere identity until configured with another token.</Text>{deleteMutation.isError && <Text c="red" size="sm">{deleteMutation.error instanceof Error ? deleteMutation.error.message : "Unable to delete Supervisor Agent"}</Text>}<Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>Delete</Button></Group></Stack>
    </Modal>

    <Modal opened={createdToken != null && !createOpened} onClose={() => { setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }} title={tokenTitle} size="lg" centered>
      <Stack>
        <Text size="sm">Token shown once. Copy the token alone for an existing installation, or copy the complete reinstall command.</Text>
        <div>
          <Text size="xs" fw={600} mb={4}>Token</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1 }}>{createdToken}</Code><Tooltip label={copiedField === "token" ? "Copied" : "Copy token"}><ActionIcon aria-label="Copy Supervisor Agent token" variant="light" color="blue" onClick={() => createdToken && void copyAndMark("token", createdToken)}><CopyIcon /></ActionIcon></Tooltip></Group>
        </div>
        <div>
          <Text size="xs" fw={600} mb={4}>Complete install / reinstall command</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1, whiteSpace: "pre-wrap" }}>{supervisorInstallCommand}</Code><Tooltip label={copiedField === "command" ? "Copied" : "Copy command"}><ActionIcon aria-label="Copy Supervisor Agent install command" variant="light" color="green" onClick={() => void copyAndMark("command", supervisorInstallCommand)}><CopyIcon /></ActionIcon></Tooltip></Group>
          <Text size="xs" c="dimmed" mt={4}>The leading space is intentional so shells configured with HISTCONTROL=ignorespace do not save the command containing the token in history.</Text>
        </div>
        <Group justify="flex-end"><Button onClick={() => { setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={createOpened} onClose={() => { setCreateOpened(false); setCreatedToken(null); createMutation.reset(); }} title="Add autonomous Supervisor Agent" centered>
      <Stack>
        {!createdToken ? <>
          <Text size="sm" c="dimmed">Create a Supervisor identity and one-time token. Configure the token on the target host together with SENSORSPHERE_URL.</Text>
          <TextInput label="Name" placeholder="homefcs-iot-ap" value={createName} onChange={event => setCreateName(event.currentTarget.value)} autoFocus />
          {createMutation.isError && <Text c="red" size="sm">{createMutation.error instanceof Error ? createMutation.error.message : "Unable to create Supervisor Agent"}</Text>}
          <Group justify="flex-end"><Button variant="default" onClick={() => setCreateOpened(false)}>Cancel</Button><Button loading={createMutation.isPending} disabled={!createName.trim()} onClick={() => createMutation.mutate(createName.trim())}>Create</Button></Group>
        </> : <>
          <Text size="sm">The Supervisor identity is ready. Copy this complete command and paste it on the target host.</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1, whiteSpace: "pre-wrap" }}>{supervisorInstallCommand}</Code><Tooltip label={copiedField === "command" ? "Copied" : "Copy command"}><ActionIcon aria-label="Copy Supervisor Agent install command" variant="light" color="green" onClick={() => void copyAndMark("command", supervisorInstallCommand)}><CopyIcon /></ActionIcon></Tooltip></Group>
          <Text size="xs" c="dimmed">The command starts with a space intentionally so shells configured with HISTCONTROL=ignorespace do not retain the token in history. Latest Supervisor version: {latestSupervisorVersion}.</Text>
          <Group justify="flex-end"><Button onClick={() => { setCreateOpened(false); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }}>Close</Button></Group>
        </>}
      </Stack>
    </Modal>

    <Modal opened={updateTarget != null} onClose={() => { setUpdateTarget(null); setUpdateVersion(""); updateMutation.reset(); }} title="Update Supervisor Agent" centered>
      <Stack>
        <Text size="sm">Update the Supervisor Agent on <strong>{updateTarget?.hostname ?? updateTarget?.name}</strong>{updateTarget?.supervisorVersion ? ` from ${updateTarget.supervisorVersion}` : ""}.</Text>
        <TextInput label="Target version" placeholder="0.4.1" value={updateVersion} onChange={event => setUpdateVersion(event.currentTarget.value)} autoFocus />
        {updateMutation.isError && <Text c="red" size="sm">{updateMutation.error instanceof Error ? updateMutation.error.message : "Unable to request Supervisor Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => setUpdateTarget(null)}>Cancel</Button><Button color="teal" loading={updateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim())} onClick={() => updateTarget && updateMutation.mutate({ agentId: updateTarget.id, version: updateVersion.trim() })}>Update</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={managedTarget != null} onClose={() => { setManagedTarget(null); setManagedStatuses([]); managedMutation.reset(); }} title={`Managed Agents${managedTarget ? ` — ${managedTarget.hostname ?? managedTarget.name}` : ""}`} size="xl" centered>
      <Stack>
        <Group justify="space-between"><Text size="sm" c="dimmed">Agents installed and controlled by this Supervisor Agent.</Text><Button size="xs" variant="light" loading={managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "LIST" })}>Refresh</Button></Group>
        {managedMutation.isError && <Text c="red" size="sm">{managedMutation.error instanceof Error ? managedMutation.error.message : "Managed Agent operation failed"}</Text>}
        <Table striped withTableBorder>
          <Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>Instance</Table.Th><Table.Th>Version</Table.Th><Table.Th>State</Table.Th><Table.Th style={{ textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {managedStatuses.map(status => <Table.Tr key={`${status.agent_type}/${status.instance}`}><Table.Td>{status.agent_type}</Table.Td><Table.Td><Text ff="monospace" size="sm">{status.instance}</Text></Table.Td><Table.Td>{status.configured_version ?? "—"}</Table.Td><Table.Td><Badge size="xs" variant="light" color={status.container_state === "running" ? "green" : "gray"}>{status.container_state}</Badge></Table.Td><Table.Td><Group gap={4} justify="flex-end"><Button size="compact-xs" variant="light" onClick={() => setManagedVersion(status.configured_version ?? "")}>Select</Button><Button size="compact-xs" color="violet" variant="light" disabled={!managedVersion.trim() || managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "UPDATE", status })}>Update</Button><Button size="compact-xs" color="red" variant="light" disabled={(status.agent_type === "device-agent" && status.instance === "main") || managedMutation.isPending} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "REMOVE", status })}>Remove</Button></Group></Table.Td></Table.Tr>)}
            {!managedStatuses.length && !managedMutation.isPending && <Table.Tr><Table.Td colSpan={5}><Text ta="center" c="dimmed">No managed agents reported.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
        <Card withBorder><Stack gap="xs"><Text fw={600} size="sm">Deploy managed agent</Text><Group grow align="flex-end"><Select label="Agent type" value={managedAgentType} onChange={value => setManagedAgentType((value as "device-agent" | "monitor-agent") ?? "monitor-agent")} data={[{ value: "monitor-agent", label: "Monitoring Agent" }, { value: "device-agent", label: "Device Agent" }]} /><TextInput label="Instance" value={managedInstance} onChange={event => setManagedInstance(event.currentTarget.value)} /><TextInput label="Version" value={managedVersion} onChange={event => setManagedVersion(event.currentTarget.value)} /></Group><Textarea label="Environment (JSON)" minRows={4} autosize value={managedEnvironment} onChange={event => setManagedEnvironment(event.currentTarget.value)} /><Group justify="flex-end"><Button loading={managedMutation.isPending} disabled={!managedInstance.trim() || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(managedVersion.trim())} onClick={() => managedTarget && managedMutation.mutate({ agent: managedTarget, operation: "DEPLOY" })}>Deploy</Button></Group></Stack></Card>
        <Group justify="flex-end"><Button variant="default" onClick={() => setManagedTarget(null)}>Close</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
