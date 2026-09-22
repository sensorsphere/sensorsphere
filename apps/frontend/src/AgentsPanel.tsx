import React from "react";
import { Card, SimpleGrid, Stack, Tabs, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { DeviceRegistryDevice } from "./types";
import { DeviceAgentsPanel, type DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { getAutonomousSupervisors, SupervisorAgentsPanel } from "./SupervisorAgentsPanel";
import { usePersistentState } from "./preferences/usePersistentState";
import { getDeviceAgents, getMonitoringAgents } from "./api";
import { getAgentVersionAvailability, type AgentReleaseKind } from "./AgentVersionAvailability";
import { AgentTypeIcon } from "./AgentTypeIcon";

interface AgentsPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

export function AgentsPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: AgentsPanelProps) {
  const [tab, setTab] = usePersistentState<"device" | "monitoring" | "supervisor">("device-registry.agents.tab", "device");
  const deviceAgentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const monitoringAgentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const autonomousSupervisorsQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const deviceAgents = deviceAgentsQuery.data ?? [];
  const monitoringAgents = monitoringAgentsQuery.data ?? [];
  const autonomousSupervisors = autonomousSupervisorsQuery.data ?? [];

  const stats: Array<[string, number, number, string, AgentReleaseKind]> = [
    ["Device Agents", deviceAgents.length, deviceAgents.filter(agent => agent.online && agent.enabled).length, "blue", "deviceAgent"],
    ["Monitoring Agents", monitoringAgents.length, monitoringAgents.filter(agent => agent.online && agent.enabled).length, "violet", "monitorAgent"],
    ["Supervisor Agents", autonomousSupervisors.length, autonomousSupervisors.filter(agent => agent.online && agent.enabled).length, "teal", "supervisorAgent"]
  ];

  return (
    <Stack gap="sm" className="agents-workspace">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {stats.map(([label, total, online, color, releaseKind]) => {
          const release = versionsQuery.data?.agents[releaseKind];
          return <Card key={label} withBorder p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={700} size="xl" c={color}>{online}<Text component="span" size="sm" c="dimmed" fw={400}> online / {total} total</Text></Text>
            <Text size="xs" c="dimmed">Latest available: {release?.status === "OK" ? release.latestVersion ?? "—" : "unknown"}</Text>
          </Card>;
        })}
      </SimpleGrid>
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
