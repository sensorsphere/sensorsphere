import React from "react";
import { Badge, Button, Card, Checkbox, Group, Modal, NumberInput, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceAgent, deleteDeviceAgent, getDeviceAgents, regenerateDeviceAgentToken, updateDeviceAgent } from "./api";
import type { DeviceAgent } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";

interface AgentFormState {
  name: string;
  enabled: boolean;
  labelsText: string;
  heartbeatTimeoutSeconds: number;
}

const emptyForm = (): AgentFormState => ({ name: "", enabled: true, labelsText: "", heartbeatTimeoutSeconds: 60 });

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

export function DeviceAgentsPanel() {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const [opened, setOpened] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceAgent | null>(null);
  const [form, setForm] = React.useState<AgentFormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ name: string; token: string } | null>(null);

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

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpened(true); };
  const openEdit = (agent: DeviceAgent) => { setEditing(agent); setForm({ name: agent.name, enabled: agent.enabled, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };

  return <Stack gap="md">
    <Group justify="space-between"><div><Text fw={600}>Device Agents</Text><Text size="xs" c="dimmed">Outbound WebSocket agents used for discovery and interactive device control.</Text></div><Button onClick={openCreate}>Add Device Agent</Button></Group>
    <Card withBorder padding={0}>
      <div style={{ overflow: "auto", maxHeight: 420 }}><Table striped highlightOnHover stickyHeader style={{ minWidth: 850 }}>
        <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th><Table.Th>Reported</Table.Th><Table.Th>Version</Table.Th><Table.Th>Capabilities</Table.Th><Table.Th>Labels</Table.Th><Table.Th style={{ textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{(agentsQuery.data ?? []).map(agent => <Table.Tr key={agent.id}>
          <Table.Td><Text size="sm" fw={600}>{agent.name}</Text><Text size="xs" c="dimmed">{agent.hostname ?? "—"}</Text></Table.Td>
          <Table.Td><Badge color={agent.online ? "green" : agent.enabled ? "gray" : "red"} variant="light">{agent.online ? "ONLINE" : agent.enabled ? "OFFLINE" : "DISABLED"}</Badge></Table.Td>
          <Table.Td><Text size="sm">{agent.reportedName ?? "—"}</Text></Table.Td>
          <Table.Td><Text size="sm">{agent.version ?? "—"}</Text></Table.Td>
          <Table.Td><Group gap={4}>{agent.capabilities.length ? agent.capabilities.map(item => <Tooltip key={item.provider} label={item.actions.join(", ") || "No actions reported"}><Badge variant="outline">{item.provider}</Badge></Tooltip>) : <Text size="sm" c="dimmed">—</Text>}</Group></Table.Td>
          <Table.Td><Text size="xs">{[...agent.agentLabels, ...Object.entries(agent.labels).map(([key,value]) => value === "true" ? key : `${key}=${value}`)].join(", ") || "—"}</Text></Table.Td>
          <Table.Td><Group gap={4} justify="flex-end"><Button size="compact-xs" variant="light" onClick={() => regenerate.mutate(agent)}>Token</Button><EditActionIcon onClick={() => openEdit(agent)} /><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td>
        </Table.Tr>)}{(agentsQuery.data ?? []).length === 0 && <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">No Device Agents yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
      </Table></div>
    </Card>

    <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "Edit Device Agent" : "Add Device Agent"} centered>
      <Stack><TextInput autoFocus label="Name" required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.currentTarget.value }))} />
        <TextInput label="Managed labels" description="Comma separated. key=value or simple labels." value={form.labelsText} onChange={event => setForm(current => ({ ...current, labelsText: event.currentTarget.value }))} />
        <NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={form.heartbeatTimeoutSeconds} onChange={value => setForm(current => ({ ...current, heartbeatTimeoutSeconds: Number(value) || 60 }))} />
        {editing && <Checkbox label="Enabled" checked={form.enabled} onChange={event => setForm(current => ({ ...current, enabled: event.currentTarget.checked }))} />}
        <Group justify="flex-end"><Button variant="default" onClick={() => setOpened(false)}>Cancel</Button><Button disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Device Agent?" centered>
      <Stack><Text>Delete <strong>{deleteTarget?.name}</strong>? Devices assigned to it will keep their provider but lose the control-agent association.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Delete</Button></Group></Stack>
    </Modal>

    <Modal opened={!!tokenInfo} onClose={() => setTokenInfo(null)} title="Device Agent token" centered>
      <Stack><Text size="sm">This token is shown only now. Configure it as <strong>SENSORSPHERE_DEVICE_AGENT_TOKEN</strong> on {tokenInfo?.name}.</Text><TextInput readOnly value={tokenInfo?.token ?? ""} styles={{ input: { fontFamily: "monospace" } }} /><Button color="green" onClick={() => tokenInfo && navigator.clipboard?.writeText(tokenInfo.token)}>Copy token</Button></Stack>
    </Modal>
  </Stack>;
}
