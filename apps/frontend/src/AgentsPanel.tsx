import React from "react";
import { ActionIcon, Card, Group, SimpleGrid, Stack, Tabs, Text, Tooltip } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeviceRegistryDevice } from "./types";
import { DeviceAgentsPanel, type DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { getAutonomousSupervisors, SupervisorAgentsPanel } from "./SupervisorAgentsPanel";
import { usePersistentState } from "./preferences/usePersistentState";
import { getDeviceAgents, getMonitoringAgents } from "./api";
import { getAgentVersionAvailability, refreshAgentVersionAvailability, type AgentReleaseKind } from "./AgentVersionAvailability";
import { hasAgentUpdate } from "./AgentBulkUpdate";
import { AgentTypeIcon } from "./AgentTypeIcon";

interface AgentsPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

export function AgentsPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: AgentsPanelProps) {
  const [tab, setTab] = usePersistentState<"device" | "monitoring" | "supervisor">("device-registry.agents.tab", "device");
  const queryClient = useQueryClient();
  const [versionsRefreshing, setVersionsRefreshing] = React.useState(false);
  const [versionsRefreshError, setVersionsRefreshError] = React.useState<string | null>(null);
  const deviceAgentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const monitoringAgentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000, refetchOnMount: "always", refetchOnWindowFocus: true });
  const autonomousSupervisorsQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const deviceAgents = deviceAgentsQuery.data ?? [];
  const monitoringAgents = monitoringAgentsQuery.data ?? [];
  const autonomousSupervisors = autonomousSupervisorsQuery.data ?? [];

  const refreshVersions = async () => {
    setVersionsRefreshing(true);
    setVersionsRefreshError(null);
    try {
      const refreshed = await refreshAgentVersionAvailability();
      queryClient.setQueryData(["agent-version-availability"], refreshed);
    } catch (error) {
      setVersionsRefreshError(error instanceof Error ? error.message : "Unable to refresh agent versions");
    } finally {
      setVersionsRefreshing(false);
    }
  };

  const stats: Array<[string, number, number, number, string, AgentReleaseKind, "device" | "monitoring" | "supervisor"]> = [
    ["Device Agents", deviceAgents.length, deviceAgents.filter(agent => agent.online && agent.enabled).length, deviceAgents.filter(agent => hasAgentUpdate(agent.version, versionsQuery.data?.agents.deviceAgent.latestVersion)).length, "cyan", "deviceAgent", "device"],
    ["Monitoring Agents", monitoringAgents.length, monitoringAgents.filter(agent => agent.online && agent.enabled).length, monitoringAgents.filter(agent => hasAgentUpdate(agent.version, versionsQuery.data?.agents.monitorAgent.latestVersion)).length, "violet", "monitorAgent", "monitoring"],
    ["Supervisor Agents", autonomousSupervisors.length, autonomousSupervisors.filter(agent => agent.online && agent.enabled).length, autonomousSupervisors.filter(agent => hasAgentUpdate(agent.version, versionsQuery.data?.agents.supervisorAgent.latestVersion)).length, "teal", "supervisorAgent", "supervisor"]
  ];

  return (
    <Stack gap="sm" className="agents-workspace">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {stats.map(([label, total, online, toUpdate, color, releaseKind, iconType]) => {
          const release = versionsQuery.data?.agents[releaseKind];
          return <Card key={label} withBorder p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}>
            <Group gap={6}><AgentTypeIcon type={iconType} size={17} /><Text size="sm" fw={700}>{label}</Text></Group>
            <Text fw={700} size="xl" c={color}>{online}<Text component="span" size="sm" c="dimmed" fw={400}> online / {total} total</Text>{toUpdate > 0 && <Text component="span" size="sm" c="orange" fw={700}>  [{toUpdate} to be updated]</Text>}</Text>
            <Text size="xs" c="dimmed">Latest available: {release?.status === "OK" ? release.latestVersion ?? "—" : "unknown"}</Text>
          </Card>;
        })}
      </SimpleGrid>
      <Group justify="flex-end" gap="xs">
        {versionsRefreshError && <Text size="xs" c="red">{versionsRefreshError}</Text>}
        <Text size="xs" c="dimmed">Versions checked {versionsQuery.data?.checkedAt ? new Date(versionsQuery.data.checkedAt).toLocaleTimeString() : "—"}</Text>
        <Tooltip label="Refresh available agent versions from GHCR"><ActionIcon size="sm" variant="light" color="blue" aria-label="Refresh available agent versions" loading={versionsRefreshing} onClick={() => void refreshVersions()}>↻</ActionIcon></Tooltip>
      </Group>
      <Tabs value={tab} onChange={value => value && setTab(value as "device" | "monitoring" | "supervisor")} keepMounted={false} className="agents-workspace-tabs">
      <Tabs.List mb="sm">
        <Tabs.Tab value="device" leftSection={<AgentTypeIcon type="device" />}>Device Agents</Tabs.Tab>
        <Tabs.Tab value="monitoring" leftSection={<AgentTypeIcon type="monitoring" />}>Monitoring Agents</Tabs.Tab>
        <Tabs.Tab value="supervisor" leftSection={<AgentTypeIcon type="supervisor" />}>Supervisor Agents</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="device" className="agents-workspace-scroll-panel">
        <DeviceAgentsPanel
          devices={devices}
          onImportDiscoveredDevice={onImportDiscoveredDevice}
          onUpdateDiscoveredDevice={onUpdateDiscoveredDevice}
          onOpenRegisteredDevice={onOpenRegisteredDevice}
        />
      </Tabs.Panel>
      <Tabs.Panel value="monitoring" className="agents-workspace-monitoring-panel">
        <MonitoringPanel view="agents" />
      </Tabs.Panel>
      <Tabs.Panel value="supervisor" className="agents-workspace-scroll-panel">
        <SupervisorAgentsPanel />
      </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
