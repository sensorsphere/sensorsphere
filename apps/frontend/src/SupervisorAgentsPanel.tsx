import React from "react";
import { ActionIcon, Badge, Button, Card, Code, Group, Modal, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability } from "./AgentVersionAvailability";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { createMonitoringAgent, deleteMonitoringAgent } from "./api";


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

async function requestAutonomousSupervisorUpdate(id: string, version: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Unable to request Supervisor Agent update (${response.status})`);
}

interface SupervisorManagedOperation {
  commandId: string;
  supervisorId: string;
  operation: "LIST" | "DEPLOY" | "UPDATE" | "REMOVE";
  status: "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
  result: unknown;
  error: string | null;
}

async function createDeviceAgentIdentity(name: string): Promise<{ agent: { id: string }; token: string }> {
  const response = await fetch("/api/v1/device-control/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to create Device Agent identity (${response.status})`);
  return payload;
}

async function deleteDeviceAgentIdentity(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/agents/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`Unable to roll back Device Agent identity (${response.status})`);
}

async function requestSupervisorManagedOperation(id: string, input: Record<string, unknown>): Promise<SupervisorManagedOperation> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/managed-agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to request managed-agent operation (${response.status})`);
  return payload;
}

async function waitSupervisorManagedOperation(commandId: string): Promise<SupervisorManagedOperation> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const response = await fetch(`/api/v1/device-control/supervisor-managed-agents/${commandId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Unable to read managed-agent operation (${response.status})`);
    if (["SUCCESS", "FAILED", "TIMEOUT"].includes(payload.status)) return payload;
  }
  throw new Error("Managed-agent operation timed out");
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

function DeployAgentIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M9 9v6M6 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 8h3m-1.5-1.5V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
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

export function SupervisorAgentsPanel() {
  const queryClient = useQueryClient();
  const autonomousQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
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
  const [autonomousUpdateTarget, setAutonomousUpdateTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [deployTarget, setDeployTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [deployAgentType, setDeployAgentType] = React.useState<"device-agent" | "monitor-agent">("device-agent");
  const [deployAgentName, setDeployAgentName] = React.useState("");
  const [deployVersion, setDeployVersion] = React.useState("");
  const [deployStatus, setDeployStatus] = React.useState<"IDLE" | "CREATING" | "DEPLOYING" | "SUCCESS" | "FAILED">("IDLE");
  const [deployError, setDeployError] = React.useState<string | null>(null);

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

  const deployDeviceAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, version }: { supervisor: AutonomousSupervisorAgent; name: string; version: string }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      const identity = await createDeviceAgentIdentity(name);
      try {
        setDeployStatus("DEPLOYING");
        const operation = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "DEPLOY",
          agentType: "device-agent",
          agentId: identity.agent.id,
          instance: "main",
          version,
          environment: {
            SENSORSPHERE_URL: window.location.origin,
            SENSORSPHERE_DEVICE_AGENT_TOKEN: identity.token,
            AGENT_NAME: name
          }
        });
        const completed = await waitSupervisorManagedOperation(operation.commandId);
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Device Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        await deleteDeviceAgentIdentity(identity.agent.id).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async () => { setDeployStatus("SUCCESS"); await Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }), queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] })]); },
    onError: error => { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Device Agent"); }
  });

  const deployMonitoringAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, version }: { supervisor: AutonomousSupervisorAgent; name: string; version: string }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      const identity = await createMonitoringAgent({ name });
      try {
        setDeployStatus("DEPLOYING");
        const operation = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "DEPLOY",
          agentType: "monitor-agent",
          agentId: identity.agent.id,
          instance: "main",
          version,
          environment: {
            SENSORSPHERE_URL: window.location.origin,
            SENSORSPHERE_AGENT_TOKEN: identity.token,
            AGENT_NAME: name
          }
        });
        const completed = await waitSupervisorManagedOperation(operation.commandId);
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Monitoring Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        await deleteMonitoringAgent(identity.agent.id).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async () => { setDeployStatus("SUCCESS"); await Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }), queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"] })]); },
    onError: error => { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Monitoring Agent"); }
  });

  const autonomousUpdateMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: string }) => requestAutonomousSupervisorUpdate(id, version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] });
    }
  });

  const autonomous = autonomousQuery.data ?? [];
  const trackedAutonomousUpdateTarget = autonomousUpdateTarget
    ? autonomous.find(agent => agent.id === autonomousUpdateTarget.id) ?? autonomousUpdateTarget
    : null;

  React.useEffect(() => {
    if (!autonomousUpdateTarget || !autonomousUpdateMutation.isSuccess) return;
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [autonomousUpdateTarget, autonomousUpdateMutation.isSuccess, queryClient]);

  const latestSupervisorVersion = versionsQuery.data?.agents.supervisorAgent.latestVersion ?? "latest";
  const latestMonitoringAgentVersion = versionsQuery.data?.agents.monitoringAgent.latestVersion ?? "latest";
  const latestDeviceAgentVersion = versionsQuery.data?.agents.deviceAgent.latestVersion ?? "latest";
  const supervisorInstallCommand = createdToken && tokenSupervisorName ? ` SENSORSPHERE_URL=${window.location.origin} \
SENSORSPHERE_AGENT_TOKEN='${createdToken}' \
SUPERVISOR_NAME="$(hostname)" \
VERSION=${latestSupervisorVersion} \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-supervisor-agent/master/scripts/install.sh)"` : "";
  const managedAgentsDetails = (agent: AutonomousSupervisorAgent) => {
    if (!agent.managedAgents.length) return <Text size="xs">No managed agents reported.</Text>;
    return <Stack gap={3}>
      {agent.managedAgents.map((entry, index) => {
        const type = typeof entry.agent_type === "string" ? entry.agent_type : "agent";
        const instance = typeof entry.instance === "string" ? entry.instance : "main";
        const version = typeof entry.configured_version === "string" ? entry.configured_version : "—";
        const state = typeof entry.container_state === "string" ? entry.container_state : "unknown";
        return <Text size="xs" key={`${type}-${instance}-${index}`}>{type}/{instance} · {version} · {state}</Text>;
      })}
    </Stack>;
  };
  const updateLifecycle = (agent: AutonomousSupervisorAgent) => {
    if (agent.updateStatus === "FAILED") return { label: "FAILED", color: "red" };
    if (["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)) return { label: agent.updateStatus, color: "blue" };
    if (agent.updateStatus === "UPDATED") return { label: "UPDATED", color: "green" };
    if (!agent.selfUpdateSupported) return { label: "NO SELF-UPDATE", color: "gray" };
    return { label: "READY", color: "teal" };
  };


  const copyAndMark = async (kind: "token" | "command", value: string) => {
    await copyText(value);
    setCopiedField(kind);
    window.setTimeout(() => setCopiedField(current => current === kind ? null : current), 1500);
  };

  return <Stack gap="md" className="agent-admin-panel">
    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Supervisor Agents</Text><Text size="xs" c="dimmed">Direct outbound Supervisor → SensorSphere connections.</Text></div><Button size="xs" onClick={() => { setCreateOpened(true); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); setCreateName(""); }}>Add Supervisor Agent</Button></Group>
      <div className="monitoring-table-scroll">
        <Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th><Table.Th>Reported</Table.Th><Table.Th>Version</Table.Th><Table.Th>System</Table.Th><Table.Th style={{ width: 110 }}>Last Seen</Table.Th><Table.Th>Managed agents</Table.Th><Table.Th>Agent Labels</Table.Th><Table.Th style={{ width: 170, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{autonomous.map(agent => {
            const lifecycle = updateLifecycle(agent);
            return <Table.Tr key={agent.id}>
              <Table.Td><Text fw={600} size="sm">{agent.name}</Text></Table.Td>
              <Table.Td><Badge size="sm" variant="light" color={!agent.enabled ? "red" : agent.online ? "green" : "gray"}>{!agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE"}</Badge></Table.Td>
              <Table.Td><Text size="sm">{agent.reportedName ?? "—"}{agent.hostname ? ` [${agent.hostname}]` : ""}</Text></Table.Td>
              <Table.Td><Text size="sm">{agent.version ?? "—"}</Text><AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents.supervisorAgent} /><Tooltip label={agent.updateError ?? `Supervisor update lifecycle: ${lifecycle.label}`}><Badge size="xs" variant="light" color={lifecycle.color}>{lifecycle.label}</Badge></Tooltip>{["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) && agent.configuredVersion && agent.configuredVersion !== agent.version && <Text size="xs" c="dimmed">Target {agent.configuredVersion}</Text>}</Table.Td>
              <Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td>
              <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{relativeAge(agent.lastSeenAt)}</Text></Table.Td>
              <Table.Td><Tooltip multiline withArrow label={managedAgentsDetails(agent)}><Badge size="xs" variant="light" style={{ cursor: "help" }}>{agent.managedAgents.length}</Badge></Tooltip></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">—</Text></Table.Td>
              <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end"><Tooltip label={!agent.online ? "Supervisor Agent must be online" : agent.managedAgents.some(entry => entry.agent_type === "device-agent" && entry.instance === "main" && entry.installed !== false) ? "Device Agent already managed on this host" : "Deploy Device Agent"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Deploy Device Agent" disabled={!agent.online || agent.managedAgents.some(entry => entry.agent_type === "device-agent" && entry.instance === "main" && entry.installed !== false)} onClick={() => { setDeployTarget(agent); setDeployAgentType("device-agent"); setDeployAgentName(agent.name); setDeployVersion(latestDeviceAgentVersion !== "latest" ? latestDeviceAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); deployDeviceAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip><Tooltip label={!agent.online ? "Supervisor Agent must be online" : agent.managedAgents.some(entry => entry.agent_type === "monitor-agent" && entry.instance === "main" && entry.installed !== false) ? "Monitoring Agent already managed on this host" : "Deploy Monitoring Agent"}><ActionIcon size="sm" variant="light" color="blue" aria-label="Deploy Monitoring Agent" disabled={!agent.online || agent.managedAgents.some(entry => entry.agent_type === "monitor-agent" && entry.instance === "main" && entry.installed !== false)} onClick={() => { setDeployTarget(agent); setDeployAgentType("monitor-agent"); setDeployAgentName(`${agent.name}-monitor`); setDeployVersion(latestMonitoringAgentVersion !== "latest" ? latestMonitoringAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); deployMonitoringAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip><Tooltip label={agent.selfUpdateSupported ? "Update Supervisor Agent" : "Supervisor self-update unavailable"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.selfUpdateSupported || ["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)} onClick={() => { setAutonomousUpdateTarget(agent); setUpdateVersion(latestSupervisorVersion !== "latest" ? latestSupervisorVersion : agent.version ?? ""); autonomousUpdateMutation.reset(); }}><SupervisorUpdateIcon /></ActionIcon></Tooltip><EditActionIcon onClick={() => { setEditTarget(agent); setEditName(agent.name); setEditEnabled(agent.enabled); setEditHeartbeatTimeout(agent.heartbeatTimeoutSeconds); editMutation.reset(); }} /><Tooltip label="Copy supervisor agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy supervisor agent" onClick={() => copyMutation.mutate(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerateMutation.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td>
            </Table.Tr>;
          })}{autonomous.length === 0 && <Table.Tr><Table.Td colSpan={9}><Text ta="center" c="dimmed" py="xl">No Supervisor Agents registered yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
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

    <Modal opened={deployTarget != null} onClose={() => { if (!deployDeviceAgentMutation.isPending && !deployMonitoringAgentMutation.isPending) { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); } }} title={deployAgentType === "device-agent" ? "Deploy Device Agent" : "Deploy Monitoring Agent"} centered>
      <Stack>
        <Text size="sm">Deploy a {deployAgentType === "device-agent" ? "Device" : "Monitoring"} Agent directly through Supervisor Agent <strong>{deployTarget?.name}</strong>.</Text>
        <TextInput label={deployAgentType === "device-agent" ? "Device Agent name" : "Monitoring Agent name"} value={deployAgentName} onChange={event => setDeployAgentName(event.currentTarget.value)} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        <TextInput label="Version" value={deployVersion} placeholder={deployAgentType === "device-agent" ? latestDeviceAgentVersion : latestMonitoringAgentVersion} onChange={event => setDeployVersion(event.currentTarget.value)} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        <Card withBorder p="sm"><Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={deployStatus === "SUCCESS" ? "green" : deployStatus === "FAILED" ? "red" : deployStatus === "IDLE" ? "gray" : "blue"}>{deployStatus}</Badge></Group></Card>
        {deployError && <Text size="sm" c="red">{deployError}</Text>}
        <Group justify="flex-end"><Button variant="default" disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} onClick={() => { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); }}>{deployStatus === "SUCCESS" ? "Close" : "Cancel"}</Button>{deployStatus !== "SUCCESS" && <Button color={deployAgentType === "device-agent" ? "cyan" : "blue"} loading={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} disabled={!deployAgentName.trim() || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(deployVersion.trim())} onClick={() => deployTarget && (deployAgentType === "device-agent" ? deployDeviceAgentMutation : deployMonitoringAgentMutation).mutate({ supervisor: deployTarget, name: deployAgentName.trim(), version: deployVersion.trim() })}>Deploy</Button>}</Group>
      </Stack>
    </Modal>

    <Modal opened={autonomousUpdateTarget != null} onClose={() => { setAutonomousUpdateTarget(null); setUpdateVersion(""); autonomousUpdateMutation.reset(); }} title="Update Supervisor Agent" centered>
      <Stack>
        <Text size="sm">Update Supervisor Agent <strong>{trackedAutonomousUpdateTarget?.name}</strong>.</Text>
        <TextInput label="Target version" placeholder={latestSupervisorVersion} value={updateVersion} onChange={event => setUpdateVersion(event.currentTarget.value)} disabled={autonomousUpdateMutation.isSuccess} autoFocus />
        {trackedAutonomousUpdateTarget && <Card withBorder p="sm">
          <Stack gap={6}>
            <Group justify="space-between"><Text size="xs" c="dimmed">Current version</Text><Text size="sm" fw={600}>{trackedAutonomousUpdateTarget.version ?? "—"}</Text></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Target version</Text><Text size="sm" fw={600}>{updateVersion || "—"}</Text></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={updateLifecycle(trackedAutonomousUpdateTarget).color}>{autonomousUpdateMutation.isPending ? "REQUESTING" : updateLifecycle(trackedAutonomousUpdateTarget).label}</Badge></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Last seen</Text><Text size="sm" title={trackedAutonomousUpdateTarget.lastSeenAt ?? undefined}>{relativeAge(trackedAutonomousUpdateTarget.lastSeenAt)}</Text></Group>
            {trackedAutonomousUpdateTarget.updateError && <Text size="sm" c="red">{trackedAutonomousUpdateTarget.updateError}</Text>}
          </Stack>
        </Card>}
        {autonomousUpdateMutation.isError && <Text c="red" size="sm">{autonomousUpdateMutation.error instanceof Error ? autonomousUpdateMutation.error.message : "Unable to request Supervisor Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => { setAutonomousUpdateTarget(null); setUpdateVersion(""); autonomousUpdateMutation.reset(); }}>{autonomousUpdateMutation.isSuccess ? "Close" : "Cancel"}</Button>{!autonomousUpdateMutation.isSuccess && <Button color="teal" loading={autonomousUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim())} onClick={() => autonomousUpdateTarget && autonomousUpdateMutation.mutate({ id: autonomousUpdateTarget.id, version: updateVersion.trim() })}>Update</Button>}</Group>
      </Stack>
    </Modal>
  </Stack>;
}
