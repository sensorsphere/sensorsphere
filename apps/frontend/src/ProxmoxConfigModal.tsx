import React from "react";
import { Button, Card, Checkbox, Code, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  deleteDeviceAgentProxmoxConfig,
  getDeviceAgentProxmoxConfig,
  getDeviceAgents,
  getDeviceDiscovery,
  saveDeviceAgentProxmoxConfig,
  startDeviceDiscovery,
  type ProxmoxEndpointConfigDto
} from "./api";
import type { DeviceAgent } from "./types";

interface ProxmoxConfigModalProps {
  agent: DeviceAgent | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

function emptyEndpoint(index = 0): ProxmoxEndpointConfigDto {
  return {
    id: `proxmox-${index + 1}`,
    product: "PVE",
    url: "",
    tokenId: "",
    tokenSecret: "",
    verifyTls: true
  };
}

function configPayload(endpoints: ProxmoxEndpointConfigDto[]): ProxmoxEndpointConfigDto[] {
  return endpoints.map(endpoint => ({
    id: endpoint.id,
    product: endpoint.product,
    url: endpoint.url,
    tokenId: endpoint.tokenId,
    ...(endpoint.originalId ? { originalId: endpoint.originalId } : {}),
    ...(endpoint.tokenSecret ? { tokenSecret: endpoint.tokenSecret } : {}),
    verifyTls: endpoint.verifyTls
  }));
}

async function waitForDeviceAgentOnline(agentId: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const agent = (await getDeviceAgents()).find(item => item.id === agentId);
    if (agent?.online) return;
    await new Promise(resolve => window.setTimeout(resolve, 500));
  }
  throw new Error("Device Agent did not reconnect after applying the Proxmox configuration");
}

export function ProxmoxConfigModal({ agent, onClose, onChanged }: ProxmoxConfigModalProps) {
  const [endpoints, setEndpoints] = React.useState<ProxmoxEndpointConfigDto[]>([]);
  const [configured, setConfigured] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTestResult(null);
    void getDeviceAgentProxmoxConfig(agent.id)
      .then(config => {
        if (cancelled) return;
        setConfigured(config.configured);
        setEndpoints(
          config.endpoints.length > 0
            ? config.endpoints.map(endpoint => ({ ...endpoint, originalId: endpoint.id, tokenSecret: "" }))
            : [emptyEndpoint()]
        );
      })
      .catch(loadError => {
        if (!cancelled) {
          setConfigured(false);
          setEndpoints([emptyEndpoint()]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load Proxmox configuration");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [agent]);

  const notifyChanged = async () => {
    if (onChanged) await onChanged();
  };

  const save = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const saved = await saveDeviceAgentProxmoxConfig(agent.id, configPayload(endpoints));
      setConfigured(saved.configured);
      setEndpoints(saved.endpoints.map(endpoint => ({ ...endpoint, originalId: endpoint.id, tokenSecret: "" })));
      await notifyChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Proxmox configuration");
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      await deleteDeviceAgentProxmoxConfig(agent.id);
      setConfigured(false);
      setEndpoints([emptyEndpoint()]);
      await notifyChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to delete Proxmox configuration");
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    if (!agent) return;
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const saved = await saveDeviceAgentProxmoxConfig(agent.id, configPayload(endpoints));
      setConfigured(saved.configured);
      setEndpoints(saved.endpoints.map(endpoint => ({ ...endpoint, originalId: endpoint.id, tokenSecret: "" })));
      await waitForDeviceAgentOnline(agent.id);
      let discovery = await startDeviceDiscovery(agent.id, "PROXMOX", 8);
      const deadline = Date.now() + 20_000;
      while (discovery.status === "SENT" && Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve, 500));
        discovery = await getDeviceDiscovery(discovery.commandId);
      }
      if (discovery.status !== "SUCCESS") {
        throw new Error(discovery.error ?? `Proxmox test ${discovery.status.toLowerCase()}`);
      }
      setTestResult(`Connection OK · ${discovery.devices.length} object(s) discovered`);
      await notifyChanged();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Proxmox connection test failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={Boolean(agent)}
      onClose={() => !loading && onClose()}
      title={`Proxmox configuration${agent ? ` — ${agent.name}` : ""}`}
      size="lg"
      centered
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Stored on the Device Agent host in <Code>config/proxmox.yml</Code>. Secrets stay on the host and are never returned to SensorSphere.
        </Text>
        {!configured && (
          <Text size="xs" c="orange">
            No Proxmox endpoint is configured yet. Create the first endpoint below, then use Test connection to save it, restart the Device Agent and run the first Proxmox discovery.
          </Text>
        )}
        {endpoints.map((endpoint, index) => (
          <Card key={`${endpoint.id}-${index}`} withBorder p="sm">
            <Stack gap="xs">
              <Group grow>
                <TextInput
                  label="Endpoint id"
                  value={endpoint.id}
                  onChange={event => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.currentTarget.value } : item))}
                />
                <Select
                  label="Product"
                  value={endpoint.product}
                  data={["PVE", "PBS"]}
                  onChange={value => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, product: value === "PBS" ? "PBS" : "PVE" } : item))}
                />
              </Group>
              <TextInput
                label="URL"
                placeholder="https://pve.example.net:8006"
                value={endpoint.url}
                onChange={event => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.currentTarget.value } : item))}
              />
              <TextInput
                label="Token ID"
                placeholder="user@realm!token"
                value={endpoint.tokenId}
                onChange={event => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, tokenId: event.currentTarget.value } : item))}
              />
              <TextInput
                type="password"
                label="Token secret"
                description={endpoint.tokenSecretConfigured ? "Leave empty to keep the current secret." : "Required for a new endpoint."}
                value={endpoint.tokenSecret ?? ""}
                onChange={event => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, tokenSecret: event.currentTarget.value } : item))}
              />
              <Group justify="space-between">
                <Checkbox
                  label="Verify TLS certificate"
                  checked={endpoint.verifyTls}
                  onChange={event => setEndpoints(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, verifyTls: event.currentTarget.checked } : item))}
                />
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  onClick={() => setEndpoints(current => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove endpoint
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
        <Button
          variant="light"
          size="xs"
          onClick={() => setEndpoints(current => [...current, emptyEndpoint(current.length)])}
        >
          Add Proxmox server
        </Button>
        {error && <Text c="red" size="sm">{error}</Text>}
        {testResult && <Text c="green" size="sm">{testResult}</Text>}
        <Group justify="space-between">
          <Button
            variant="light"
            color="red"
            disabled={!configured || loading}
            onClick={remove}
          >
            Delete configuration
          </Button>
          <Group>
            <Button variant="default" disabled={loading} onClick={onClose}>Close</Button>
            <Button variant="light" loading={loading} disabled={endpoints.length === 0} onClick={testConnection}>Test connection</Button>
            <Button loading={loading} disabled={endpoints.length === 0} onClick={save}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
