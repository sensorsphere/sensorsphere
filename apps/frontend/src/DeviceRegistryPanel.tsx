import React from "react";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  createDeviceHealthProfile,
  createDeviceRegistryDevice,
  deleteDeviceHealthProfile,
  deleteDeviceRegistryDevice,
  getAssets,
  getDeviceHealthProfiles,
  getDeviceIdentityLabelReferences,
  getDeviceRegistryDevices,
  getDeviceClassReferences,
  getDeviceTechnologyReferences,
  getDeviceTypeReferences,
  getGateways,
  getLocations,
  getSensors,
  updateDeviceHealthProfile,
  updateDeviceRegistryDevice
} from "./api";

import type {
  CreateDeviceHealthProfileInput,
  CreateDeviceRegistryDeviceInput,
  DeviceHealthProfile,
  DeviceHealthStatus,
  DeviceRegistryClass,
  DeviceRegistryDevice,
  DeviceAccessLink,
  DeviceIdentity
} from "./types";

import { EditActionIcon, DeleteActionIcon } from "./TableActionIcons";
import { DeviceGlyph } from "./DeviceGlyph";
import { DeviceTaxonomyPanel } from "./DeviceTaxonomyPanel";
import { DeviceAccessLinksEditor, openDeviceAccessUrl, resolveDeviceAccessUrl } from "./DeviceAccessLinksEditor";
import { DeviceIdentitiesEditor, primaryIdentity } from "./DeviceIdentitiesEditor";
import { LocationIcon, getLocationIconName } from "./LocationIcon";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { MonitoringPanel } from "./MonitoringPanel";


type DeviceSortKey = "name" | "address" | "class" | "type" | "technology" | "location" | "parent" | "battery" | "lastSeen" | "health";

function deviceAddress(device: DeviceRegistryDevice): string {
  return primaryIdentity(device.identities, "IP")?.value
    ?? device.ipAddress
    ?? primaryIdentity(device.identities, "FQDN")?.value
    ?? device.fqdn
    ?? primaryIdentity(device.identities, "MAC")?.value
    ?? device.macAddress
    ?? primaryIdentity(device.identities, "IEEE")?.value
    ?? device.ieeeAddress
    ?? "";
}

function deviceAddressSearchText(device: DeviceRegistryDevice): string {
  return [
    device.ipAddress ?? "",
    device.fqdn ?? "",
    device.macAddress ?? "",
    device.ieeeAddress ?? "",
    ...device.identities
      .filter(identity => ["IP", "FQDN", "HOSTNAME", "MAC", "IEEE"].includes(identity.identityType.toUpperCase()))
      .map(identity => `${identity.identityType} ${identity.label ?? ""} ${identity.value}`)
  ].join(" ").toLowerCase();
}

function copyDeviceToForm(device: DeviceRegistryDevice): DeviceFormState {
  const form = deviceToForm(device);
  return {
    ...form,
    name: `${device.name} (copy)`,
    identities: device.identities.map(({ id: _id, ...identity }) => ({ ...identity })),
    accessLinks: device.accessLinks.map(({ id: _id, ...link }) => ({ ...link })),
    sensorIds: [],
    assetIds: [],
    gatewayIds: [],
    lastSeenAt: "",
    batteryPercent: "",
    rssi: ""
  };
}

const HEALTH_COLORS: Record<DeviceHealthStatus, string> = {
  ONLINE: "green",
  WARNING: "yellow",
  OFFLINE: "red",
  UNKNOWN: "gray",
  DISABLED: "gray"
};

function compactDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

interface DeviceFormState {
  name: string;
  deviceClass: DeviceRegistryClass;
  deviceType: string;
  technologies: string[];
  identities: DeviceIdentity[];
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  description: string;
  locationId: string | null;
  parentDeviceId: string | null;
  healthProfileId: string | null;
  enabled: boolean;
  lastSeenAt: string;
  batteryPercent: number | string;
  rssi: number | string;
  sensorIds: string[];
  assetIds: string[];
  gatewayIds: string[];
  accessLinks: DeviceAccessLink[];
}

function emptyDeviceForm(): DeviceFormState {
  return {
    name: "",
    deviceClass: "IOT",
    deviceType: "",
    technologies: [],
    identities: [],
    manufacturer: "",
    model: "",
    firmwareVersion: "",
    description: "",
    locationId: null,
    parentDeviceId: null,
    healthProfileId: null,
    enabled: true,
    lastSeenAt: "",
    batteryPercent: "",
    rssi: "",
    sensorIds: [],
    assetIds: [],
    gatewayIds: [],
    accessLinks: []
  };
}

function deviceToForm(device: DeviceRegistryDevice): DeviceFormState {
  return {
    name: device.name,
    deviceClass: device.deviceClass,
    deviceType: device.deviceType,
    technologies: device.technologies.map(item => item.code),
    identities: device.identities,
    manufacturer: device.manufacturer ?? "",
    model: device.model ?? "",
    firmwareVersion: device.firmwareVersion ?? "",
    description: device.description ?? "",
    locationId: device.location?.id ?? null,
    parentDeviceId: device.parentDevice?.id ?? null,
    healthProfileId: device.healthProfile?.id ?? null,
    enabled: device.enabled,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.slice(0, 16) : "",
    batteryPercent: device.batteryPercent ?? "",
    rssi: device.rssi ?? "",
    sensorIds: device.links.filter(link => link.targetType === "sensor").map(link => link.targetId),
    assetIds: device.links.filter(link => link.targetType === "asset").map(link => link.targetId),
    gatewayIds: device.links.filter(link => link.targetType === "gateway").map(link => link.targetId),
    accessLinks: device.accessLinks
  };
}

function deviceFormPayload(form: DeviceFormState): CreateDeviceRegistryDeviceInput {
  return {
    name: form.name.trim(),
    deviceClass: form.deviceClass,
    deviceType: form.deviceType.trim(),
    technology: form.technologies[0] ?? null,
    technologies: form.technologies,
    macAddress: primaryIdentity(form.identities, "MAC")?.value ?? null,
    ipAddress: primaryIdentity(form.identities, "IP")?.value ?? null,
    ieeeAddress: primaryIdentity(form.identities, "IEEE")?.value ?? null,
    fqdn: primaryIdentity(form.identities, "FQDN")?.value ?? null,
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    firmwareVersion: form.firmwareVersion.trim() || null,
    description: form.description.trim() || null,
    locationId: form.locationId,
    parentDeviceId: form.parentDeviceId,
    healthProfileId: form.healthProfileId,
    enabled: form.enabled,
    lastSeenAt: form.lastSeenAt ? new Date(form.lastSeenAt).toISOString() : null,
    batteryPercent: form.batteryPercent === "" ? null : Number(form.batteryPercent),
    rssi: form.rssi === "" ? null : Number(form.rssi),
    identities: form.identities.map(({ id: _id, ...identity }) => identity),
    links: [
      ...form.sensorIds.map(targetId => ({ targetType: "sensor" as const, targetId })),
      ...form.assetIds.map(targetId => ({ targetType: "asset" as const, targetId })),
      ...form.gatewayIds.map(targetId => ({ targetType: "gateway" as const, targetId }))
    ],
    accessLinks: form.accessLinks.map(({ id: _id, ...link }) => link)
  };
}

interface HealthProfileFormState {
  name: string;
  description: string;
  warningAfterSeconds: number | string;
  offlineAfterSeconds: number | string;
  batteryWarningPercent: number | string;
  batteryCriticalPercent: number | string;
  rssiWarning: number | string;
  rssiCritical: number | string;
}

const emptyHealthProfileForm = (): HealthProfileFormState => ({
  name: "",
  description: "",
  warningAfterSeconds: "",
  offlineAfterSeconds: "",
  batteryWarningPercent: "",
  batteryCriticalPercent: "",
  rssiWarning: "",
  rssiCritical: ""
});

function profileToForm(profile: DeviceHealthProfile): HealthProfileFormState {
  return {
    name: profile.name,
    description: profile.description ?? "",
    warningAfterSeconds: profile.warningAfterSeconds ?? "",
    offlineAfterSeconds: profile.offlineAfterSeconds ?? "",
    batteryWarningPercent: profile.batteryWarningPercent ?? "",
    batteryCriticalPercent: profile.batteryCriticalPercent ?? "",
    rssiWarning: profile.rssiWarning ?? "",
    rssiCritical: profile.rssiCritical ?? ""
  };
}

function profilePayload(form: HealthProfileFormState): CreateDeviceHealthProfileInput {
  const numberOrNull = (value: number | string) => value === "" ? null : Number(value);
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    warningAfterSeconds: numberOrNull(form.warningAfterSeconds),
    offlineAfterSeconds: numberOrNull(form.offlineAfterSeconds),
    batteryWarningPercent: numberOrNull(form.batteryWarningPercent),
    batteryCriticalPercent: numberOrNull(form.batteryCriticalPercent),
    rssiWarning: numberOrNull(form.rssiWarning),
    rssiCritical: numberOrNull(form.rssiCritical)
  };
}

function TaxonomyOption({ icon, color, label, suffix }: { icon: string; color: string; label: string; suffix?: string }) {
  return <Group gap={7} wrap="nowrap"><DeviceGlyph icon={icon} color={color} /><Text size="sm">{label}{suffix ? ` · ${suffix}` : ""}</Text></Group>;
}

export function DeviceRegistryPanel({ openDeviceId, openAccessLinkId, onDeviceOpened, onDeviceSaved }: { openDeviceId?: string | null; openAccessLinkId?: string | null; onDeviceOpened?: () => void; onDeviceSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = usePersistentState<string | null>("device-registry.tab", "devices");
  const [nameFilter, setNameFilter] = usePersistentState("device-registry.filter.name", "");
  const [addressFilter, setAddressFilter] = usePersistentState("device-registry.filter.address", "");
  const [sortKey, setSortKey] = usePersistentState<DeviceSortKey>("device-registry.sort.key", "name");
  const [sortDirection, setSortDirection] = usePersistentState<SortDirection>("device-registry.sort.direction", "asc");
  const [classFilter, setClassFilter] = usePersistentState<string | null>("device-registry.filter.class", null);
  const [typeFilter, setTypeFilter] = usePersistentState<string | null>("device-registry.filter.type", null);
  const [technologyFilter, setTechnologyFilter] = usePersistentState<string | null>("device-registry.filter.technology", null);
  const [healthFilter, setHealthFilter] = usePersistentState<string | null>("device-registry.filter.health", null);
  const [editingDevice, setEditingDevice] = React.useState<DeviceRegistryDevice | null>(null);
  const [deviceModalOpen, setDeviceModalOpen] = React.useState(false);
  const [deleteDeviceTarget, setDeleteDeviceTarget] = React.useState<DeviceRegistryDevice | null>(null);
  const [deviceForm, setDeviceForm] = React.useState<DeviceFormState>(emptyDeviceForm());
  const [editingProfile, setEditingProfile] = React.useState<DeviceHealthProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState<HealthProfileFormState>(emptyHealthProfileForm());
  const [error, setError] = React.useState<string | null>(null);
  const [accessLinkToOpen, setAccessLinkToOpen] = React.useState<string | null>(null);

  const devicesQuery = useQuery({ queryKey: ["device-registry", "devices"], queryFn: getDeviceRegistryDevices });
  const deviceClassesQuery = useQuery({ queryKey: ["device-registry", "classes"], queryFn: getDeviceClassReferences });
  const profilesQuery = useQuery({ queryKey: ["device-registry", "health-profiles"], queryFn: getDeviceHealthProfiles });
  const deviceTypesQuery = useQuery({ queryKey: ["device-registry", "device-types"], queryFn: getDeviceTypeReferences });
  const technologiesQuery = useQuery({ queryKey: ["device-registry", "technologies"], queryFn: getDeviceTechnologyReferences });
  const identityLabelsQuery = useQuery({ queryKey: ["device-registry", "identity-labels"], queryFn: getDeviceIdentityLabelReferences });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: getLocations });
  const sensorsQuery = useQuery({ queryKey: ["sensors"], queryFn: getSensors });
  const assetsQuery = useQuery({ queryKey: ["assets"], queryFn: getAssets });
  const gatewaysQuery = useQuery({ queryKey: ["gateways"], queryFn: getGateways });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["device-registry", "devices"] }),
      queryClient.invalidateQueries({ queryKey: ["device-registry", "health-profiles"] })
    ]);
  };

  const saveDevice = useMutation({
    mutationFn: async () => editingDevice
      ? updateDeviceRegistryDevice(editingDevice.id, deviceFormPayload(deviceForm))
      : createDeviceRegistryDevice(deviceFormPayload(deviceForm)),
    onSuccess: async () => {
      setDeviceModalOpen(false);
      setEditingDevice(null);
      setError(null);
      await refresh();
      onDeviceSaved?.();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to save device")
  });

  const removeDevice = useMutation({
    mutationFn: deleteDeviceRegistryDevice,
    onSuccess: async () => {
      setDeleteDeviceTarget(null);
      setError(null);
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete device")
  });

  const saveProfile = useMutation({
    mutationFn: async () => editingProfile
      ? updateDeviceHealthProfile(editingProfile.id, profilePayload(profileForm))
      : createDeviceHealthProfile(profilePayload(profileForm)),
    onSuccess: async () => {
      setProfileModalOpen(false);
      setEditingProfile(null);
      setError(null);
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to save health profile")
  });

  const removeProfile = useMutation({
    mutationFn: deleteDeviceHealthProfile,
    onSuccess: refresh,
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete health profile")
  });

  const devices = devicesQuery.data ?? [];
  const filteredDevices = devices.filter(device => {
    const nameNeedle = nameFilter.trim().toLowerCase();
    const addressNeedle = addressFilter.trim().toLowerCase();
    const matchesName = !nameNeedle || device.name.toLowerCase().includes(nameNeedle);
    const matchesAddress = !addressNeedle || deviceAddressSearchText(device).includes(addressNeedle);
    return matchesName && matchesAddress &&
      (!classFilter || device.deviceClass === classFilter) &&
      (!typeFilter || device.deviceType === typeFilter) &&
      (!technologyFilter || device.technologies.some(item => item.code === technologyFilter)) &&
      (!healthFilter || device.health.status === healthFilter);
  }).sort((left, right) => {
    const leftValue = sortKey === "name" ? left.name
      : sortKey === "address" ? deviceAddress(left)
      : sortKey === "class" ? left.deviceClassInfo.label
      : sortKey === "type" ? left.deviceTypeInfo.label
      : sortKey === "technology" ? left.technologies.map(item => item.label).join(", ")
      : sortKey === "location" ? left.location?.name ?? null
      : sortKey === "parent" ? left.parentDevice?.name ?? null
      : sortKey === "battery" ? left.batteryPercent
      : sortKey === "lastSeen" ? (left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : null)
      : left.health.status;
    const rightValue = sortKey === "name" ? right.name
      : sortKey === "address" ? deviceAddress(right)
      : sortKey === "class" ? right.deviceClassInfo.label
      : sortKey === "type" ? right.deviceTypeInfo.label
      : sortKey === "technology" ? right.technologies.map(item => item.label).join(", ")
      : sortKey === "location" ? right.location?.name ?? null
      : sortKey === "parent" ? right.parentDevice?.name ?? null
      : sortKey === "battery" ? right.batteryPercent
      : sortKey === "lastSeen" ? (right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : null)
      : right.health.status;
    return compareTableValues(leftValue, rightValue, sortDirection);
  });

  const toggleSort = (key: DeviceSortKey) => {
    if (sortKey === key) {
      setSortDirection(current => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const healthCounts = devices.reduce<Record<DeviceHealthStatus, number>>((acc, device) => {
    acc[device.health.status] += 1;
    return acc;
  }, { ONLINE: 0, WARNING: 0, OFFLINE: 0, UNKNOWN: 0, DISABLED: 0 });

  const openCreateDevice = () => {
    setEditingDevice(null);
    setDeviceForm(emptyDeviceForm());
    setError(null);
    setDeviceModalOpen(true);
  };

  const openEditDevice = (device: DeviceRegistryDevice) => {
    setEditingDevice(device);
    setDeviceForm(deviceToForm(device));
    setError(null);
    setDeviceModalOpen(true);
  };

  const openCopyDevice = (device: DeviceRegistryDevice) => {
    setEditingDevice(null);
    setDeviceForm(copyDeviceToForm(device));
    setError(null);
    setDeviceModalOpen(true);
  };

  React.useEffect(() => {
    if (!openDeviceId) return;
    const device = devices.find(item => item.id === openDeviceId);
    if (!device) return;
    setAccessLinkToOpen(openAccessLinkId ?? null);
    openEditDevice(device);
    onDeviceOpened?.();
  }, [openDeviceId, openAccessLinkId, devices]);

  const openCreateProfile = () => {
    setEditingProfile(null);
    setProfileForm(emptyHealthProfileForm());
    setError(null);
    setProfileModalOpen(true);
  };

  const openEditProfile = (profile: DeviceHealthProfile) => {
    setEditingProfile(profile);
    setProfileForm(profileToForm(profile));
    setError(null);
    setProfileModalOpen(true);
  };

  return (
    <Stack gap="md" className="device-registry-panel">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Device Registry</Title>
          <Text c="dimmed" size="sm">Technical inventory and health for IoT, network, compute and virtual devices.</Text>
        </div>
      </Group>

      <Tabs value={tab} onChange={setTab} className="device-registry-tabs">
        <Tabs.List>
          <Tabs.Tab value="devices">Devices</Tabs.Tab>
          <Tabs.Tab value="monitoring">Monitoring</Tabs.Tab>
          <Tabs.Tab value="discovery">Discovery</Tabs.Tab>
          <Tabs.Tab value="health-profiles">Health Profiles</Tabs.Tab>
          <Tabs.Tab value="taxonomy">Taxonomy</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="devices" pt="md" className="device-registry-devices-panel">
          <Stack gap="sm" className="device-registry-devices-stack">
            <Group justify="flex-end"><Button size="compact-sm" onClick={openCreateDevice}>+ Add device</Button></Group>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
              <Card
                withBorder
                radius="md"
                padding="lg"
                style={{ cursor: "pointer", borderLeft: "4px solid var(--mantine-color-blue-6)" }}
                onClick={() => setHealthFilter(null)}
              >
                <Badge size="xs" color="blue" variant="light">Total devices</Badge>
                <Text fw={700} size="xl" c="blue.6">{devices.length}</Text>
                <Text size="xs" c="dimmed">Registered devices</Text>
              </Card>
              {([
                ["ONLINE", "green", "Healthy devices"],
                ["WARNING", "yellow", "Require attention"],
                ["OFFLINE", "red", "Currently offline"],
                ["UNKNOWN", "gray", "Health unknown"],
                ["DISABLED", "gray", "Health disabled"]
              ] as const).map(([status, color, description]) => (
                <Card
                  key={status}
                  withBorder
                  radius="md"
                  padding="lg"
                  style={{ cursor: "pointer", borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
                  onClick={() => setHealthFilter(status)}
                >
                  <Badge size="xs" color={color} variant="light">{status}</Badge>
                  <Text fw={700} size="xl" c={`${color}.6`}>{healthCounts[status]}</Text>
                  <Text size="xs" c="dimmed">{description}</Text>
                </Card>
              ))}
            </SimpleGrid>

            <Group gap="sm" align="center" wrap="nowrap">
              <ResetFiltersAction
                active={Boolean(nameFilter.trim() || addressFilter.trim() || classFilter || typeFilter || technologyFilter || healthFilter)}
                onReset={() => {
                  setNameFilter("");
                  setAddressFilter("");
                  setClassFilter(null);
                  setTypeFilter(null);
                  setTechnologyFilter(null);
                  setHealthFilter(null);
                }}
              />
              <TextInput placeholder="Name" value={nameFilter} onChange={event => setNameFilter(event.currentTarget.value)} style={{ flex: 1, minWidth: 180 }} />
              <TextInput placeholder="Address" value={addressFilter} onChange={event => setAddressFilter(event.currentTarget.value)} style={{ flex: 1, minWidth: 180 }} />
              <Select placeholder="All classes" clearable value={classFilter} onChange={setClassFilter} data={(deviceClassesQuery.data ?? []).map(item => ({ value: item.code, label: item.label }))} leftSection={classFilter ? <DeviceGlyph icon={(deviceClassesQuery.data ?? []).find(item => item.code === classFilter)?.icon ?? "device"} color={(deviceClassesQuery.data ?? []).find(item => item.code === classFilter)?.color} /> : undefined} renderOption={({ option }) => { const item = (deviceClassesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} /> : option.label; }} w={180} />
              <Select placeholder="All types" searchable clearable value={typeFilter} onChange={setTypeFilter} data={(deviceTypesQuery.data ?? []).map(type => ({ value: type.code, label: type.label }))} leftSection={typeFilter ? <DeviceGlyph icon={(deviceTypesQuery.data ?? []).find(item => item.code === typeFilter)?.icon ?? "device"} color={(deviceTypesQuery.data ?? []).find(item => item.code === typeFilter)?.color} /> : undefined} renderOption={({ option }) => { const item = (deviceTypesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} /> : option.label; }} w={190} />
              <Select placeholder="All technologies" searchable clearable value={technologyFilter} onChange={setTechnologyFilter} data={(technologiesQuery.data ?? []).map(technology => ({ value: technology.code, label: technology.label }))} leftSection={technologyFilter ? <DeviceGlyph icon={(technologiesQuery.data ?? []).find(item => item.code === technologyFilter)?.icon ?? "link"} color={(technologiesQuery.data ?? []).find(item => item.code === technologyFilter)?.color} /> : undefined} renderOption={({ option }) => { const item = (technologiesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} /> : option.label; }} w={205} />
              <Select placeholder="All health" clearable value={healthFilter} onChange={setHealthFilter} data={Object.keys(HEALTH_COLORS)} w={150} />
            </Group>

            <Card withBorder padding={0} className="device-registry-table-card">
              <div className="device-registry-table-scroll">
                <Table striped highlightOnHover stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <SortableTableHeader active={sortKey === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>Name</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "address"} direction={sortDirection} onClick={() => toggleSort("address")}>Address</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "class"} direction={sortDirection} onClick={() => toggleSort("class")}>Class</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>Type</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "technology"} direction={sortDirection} onClick={() => toggleSort("technology")}>Technology</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "location"} direction={sortDirection} onClick={() => toggleSort("location")}>Location</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "parent"} direction={sortDirection} onClick={() => toggleSort("parent")}>Parent</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "battery"} direction={sortDirection} onClick={() => toggleSort("battery")}>Battery</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "lastSeen"} direction={sortDirection} onClick={() => toggleSort("lastSeen")}>Last seen</SortableTableHeader>
                      <SortableTableHeader active={sortKey === "health"} direction={sortDirection} onClick={() => toggleSort("health")}>Health</SortableTableHeader>
                      <Table.Th>Access</Table.Th>
                      <Table.Th style={{ width: 116, textAlign: "right" }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredDevices.map(device => (
                      <Table.Tr key={device.id}>
                        <Table.Td>
                          <Stack gap={0}>
                            <Text size="sm" fw={600}>{device.name}</Text>
                            <Text size="xs" c="dimmed">{device.manufacturer || device.model ? [device.manufacturer, device.model].filter(Boolean).join(" · ") : device.identities[0]?.value ?? ""}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td><Text size="sm" ff="monospace">{deviceAddress(device) || "—"}</Text></Table.Td>
                        <Table.Td><Group gap={6} wrap="nowrap"><DeviceGlyph icon={device.deviceClassInfo.icon} color={device.deviceClassInfo.color} /><Text size="sm">{device.deviceClassInfo.label}</Text></Group></Table.Td>
                        <Table.Td><Group gap={6} wrap="nowrap"><DeviceGlyph icon={device.deviceTypeInfo.icon} color={device.deviceTypeInfo.color} /><Text size="sm">{device.deviceTypeInfo.label}</Text></Group></Table.Td>
                        <Table.Td>
                          {device.technologies.length ? (
                            <Group gap={4} wrap="wrap">
                              {device.technologies.map(item => (
                                <Group key={item.code} gap={4} wrap="nowrap">
                                  <DeviceGlyph icon={item.icon} color={item.color} />
                                  <Text size="sm">{item.label}</Text>
                                </Group>
                              ))}
                            </Group>
                          ) : "—"}
                        </Table.Td>
                        <Table.Td>{device.location ? <Group gap={6} wrap="nowrap"><LocationIcon name={getLocationIconName(device.location)} size={16} /><Text size="sm">{device.location.name}</Text></Group> : "—"}</Table.Td>
                        <Table.Td>{device.parentDevice?.name ?? "—"}</Table.Td>
                        <Table.Td>{device.batteryPercent == null ? "—" : `${device.batteryPercent}%`}</Table.Td>
                        <Table.Td title={device.lastSeenAt ?? undefined}>{compactDate(device.lastSeenAt)}</Table.Td>
                        <Table.Td>
                          <Tooltip label={device.health.reasons.length ? device.health.reasons.join(" · ") : "Healthy"}>
                            <Badge color={HEALTH_COLORS[device.health.status]} variant="light">{device.health.status}</Badge>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={2} wrap="nowrap">
                            {device.accessLinks.filter(link => link.enabled).slice(0, 3).map((link, index) => {
                              const resolved = resolveDeviceAccessUrl(link, { deviceName: device.name, macAddress: primaryIdentity(device.identities, "MAC")?.value ?? "", ipAddress: primaryIdentity(device.identities, "IP")?.value ?? "", ieeeAddress: primaryIdentity(device.identities, "IEEE")?.value ?? "", fqdn: primaryIdentity(device.identities, "FQDN")?.value ?? "", manufacturer: device.manufacturer ?? "", model: device.model ?? "", deviceClass: device.deviceClass, deviceType: device.deviceType, location: device.location?.name ?? "", identities: device.identities });
                              return <Tooltip key={`${link.name}-${index}`} label={resolved.unresolved.length ? `${link.name} · missing ${resolved.unresolved.join(", ")}` : link.name}><ActionIcon variant="subtle" disabled={resolved.unresolved.length > 0} onClick={() => openDeviceAccessUrl(resolved.url, `ss_device_${device.id}_${index}`)} aria-label={`Open ${link.name}`}><DeviceGlyph icon={link.icon} color={link.color} /></ActionIcon></Tooltip>;
                            })}
                            {device.accessLinks.length === 0 && <Text size="xs" c="dimmed">—</Text>}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap" justify="flex-end">
                            <EditActionIcon onClick={() => openEditDevice(device)} />
                            <Tooltip label="Copy device"><ActionIcon size="sm" variant="light" color="green" aria-label={`Copy ${device.name}`} onClick={() => openCopyDevice(device)}>⧉</ActionIcon></Tooltip>
                            <DeleteActionIcon onClick={() => { setError(null); setDeleteDeviceTarget(device); }} />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {filteredDevices.length === 0 && (
                      <Table.Tr><Table.Td colSpan={12}><Text c="dimmed" ta="center" py="xl">No devices match the current filters.</Text></Table.Td></Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </div>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="monitoring" pt="md">
          <MonitoringPanel />
        </Tabs.Panel>

        <Tabs.Panel value="discovery" pt="md">
          <Card withBorder>
            <Stack gap="xs">
              <Title order={4}>Discovery providers</Title>
              <Text c="dimmed">No discovery provider is enabled in the foundation release. Zigbee2MQTT, SensorSphere BLE, ESPHome and Proxmox adapters can be added independently without changing the registry core.</Text>
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="health-profiles" pt="md">
          <Stack gap="sm">
            <Group justify="flex-end"><Button size="compact-sm" onClick={openCreateProfile}>+ Add health profile</Button></Group>
            <Card withBorder padding={0}>
              <Table striped highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Last seen warning</Table.Th><Table.Th>Offline</Table.Th><Table.Th>Battery W/C</Table.Th><Table.Th>RSSI W/C</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {(profilesQuery.data ?? []).map(profile => (
                    <Table.Tr key={profile.id}>
                      <Table.Td><Text fw={600} size="sm">{profile.name}</Text><Text size="xs" c="dimmed">{profile.description ?? ""}</Text></Table.Td>
                      <Table.Td>{profile.warningAfterSeconds ?? "—"}</Table.Td>
                      <Table.Td>{profile.offlineAfterSeconds ?? "—"}</Table.Td>
                      <Table.Td>{profile.batteryWarningPercent ?? "—"} / {profile.batteryCriticalPercent ?? "—"}</Table.Td>
                      <Table.Td>{profile.rssiWarning ?? "—"} / {profile.rssiCritical ?? "—"}</Table.Td>
                      <Table.Td><Group gap={4}><EditActionIcon onClick={() => openEditProfile(profile)} /><DeleteActionIcon onClick={() => {
                        if (window.confirm(`Delete health profile "${profile.name}"? Devices using it will keep working with UNKNOWN/default health rules.`)) removeProfile.mutate(profile.id);
                      }} /></Group></Table.Td>
                    </Table.Tr>
                  ))}
                  {(profilesQuery.data ?? []).length === 0 && <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="xl">No health profiles yet. Create only the profiles you actually need.</Text></Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="taxonomy" pt="md">
          <DeviceTaxonomyPanel />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={deleteDeviceTarget !== null}
        onClose={() => !removeDevice.isPending && setDeleteDeviceTarget(null)}
        title="Delete device"
        centered
      >
        <Stack>
          <Text>
            Delete device <b>{deleteDeviceTarget?.name}</b>? Its Device Registry identities, access links and optional SensorSphere links will also be removed.
          </Text>
          {removeDevice.isError && (
            <Text c="red">
              {removeDevice.error instanceof Error ? removeDevice.error.message : "Unable to delete device."}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="light" color="gray" disabled={removeDevice.isPending} onClick={() => setDeleteDeviceTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              variant="light"
              loading={removeDevice.isPending}
              onClick={() => deleteDeviceTarget && removeDevice.mutate(deleteDeviceTarget.id)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} title={editingDevice ? "Edit device" : "Add device"} size="xl">
        <Stack gap="md">
          {error && <Text c="red" size="sm">{error}</Text>}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Name" required value={deviceForm.name} onChange={event => setDeviceForm(current => ({ ...current, name: event.currentTarget.value }))} autoFocus />
            <Select label="Class" required data={[...(deviceClassesQuery.data ?? [])].sort((a, b) => a.label.localeCompare(b.label)).map(item => ({ value: item.code, label: item.label }))} value={deviceForm.deviceClass || null} onChange={value => value && setDeviceForm(current => ({ ...current, deviceClass: value, deviceType: "" }))} allowDeselect={false} leftSection={<DeviceGlyph icon={(deviceClassesQuery.data ?? []).find(item => item.code === deviceForm.deviceClass)?.icon ?? "device"} color={(deviceClassesQuery.data ?? []).find(item => item.code === deviceForm.deviceClass)?.color} />} renderOption={({ option }) => { const item = (deviceClassesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} /> : option.label; }} />
            <Select
              label="Type" required searchable value={deviceForm.deviceType || null}
              onChange={value => setDeviceForm(current => ({ ...current, deviceType: value ?? "" }))}
              data={[...(deviceTypesQuery.data ?? [])].filter(type => type.deviceClass === deviceForm.deviceClass || type.deviceClass === "OTHER").sort((a, b) => a.label.localeCompare(b.label)).map(type => ({ value: type.code, label: `${type.label} · ${type.category}` }))}
              leftSection={deviceForm.deviceType ? <DeviceGlyph icon={(deviceTypesQuery.data ?? []).find(item => item.code === deviceForm.deviceType)?.icon ?? "device"} color={(deviceTypesQuery.data ?? []).find(item => item.code === deviceForm.deviceType)?.color} /> : undefined}
              renderOption={({ option }) => { const item = (deviceTypesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} suffix={item.category} /> : option.label; }}
              placeholder="Select a device type"
            />
            <MultiSelect
              label="Technologies" searchable clearable value={deviceForm.technologies}
              onChange={value => setDeviceForm(current => ({ ...current, technologies: value }))}
              data={[...(technologiesQuery.data ?? [])].sort((a, b) => a.label.localeCompare(b.label)).map(technology => ({ value: technology.code, label: `${technology.label} · ${technology.category}` }))}
              renderOption={({ option }) => { const item = (technologiesQuery.data ?? []).find(ref => ref.code === option.value); return item ? <TaxonomyOption icon={item.icon} color={item.color} label={item.label} suffix={item.category} /> : option.label; }}
              placeholder="Select one or more technologies"
            />
            <TextInput label="Manufacturer" value={deviceForm.manufacturer} onChange={event => setDeviceForm(current => ({ ...current, manufacturer: event.currentTarget.value }))} />
            <TextInput label="Model" value={deviceForm.model} onChange={event => setDeviceForm(current => ({ ...current, model: event.currentTarget.value }))} />
            <TextInput label="Firmware / version" value={deviceForm.firmwareVersion} onChange={event => setDeviceForm(current => ({ ...current, firmwareVersion: event.currentTarget.value }))} />
            <Select
              label="Location" searchable clearable value={deviceForm.locationId}
              onChange={value => setDeviceForm(current => ({ ...current, locationId: value }))}
              data={(locationsQuery.data ?? []).map(location => ({ value: location.id, label: location.name }))}
              leftSection={deviceForm.locationId ? <LocationIcon name={getLocationIconName((locationsQuery.data ?? []).find(location => location.id === deviceForm.locationId))} size={16} /> : undefined}
              renderOption={({ option }) => { const location = (locationsQuery.data ?? []).find(item => item.id === option.value); return <Group gap="xs" wrap="nowrap"><LocationIcon name={getLocationIconName(location)} size={16} /><Text size="sm">{option.label}</Text></Group>; }}
            />
            <Select label="Parent device" searchable clearable value={deviceForm.parentDeviceId} onChange={value => setDeviceForm(current => ({ ...current, parentDeviceId: value }))} data={devices.filter(device => device.id !== editingDevice?.id).map(device => ({ value: device.id, label: device.name }))} />
            <Select label="Health profile" searchable clearable value={deviceForm.healthProfileId} onChange={value => setDeviceForm(current => ({ ...current, healthProfileId: value }))} data={(profilesQuery.data ?? []).map(profile => ({ value: profile.id, label: profile.name }))} />
            <TextInput type="datetime-local" label="Last seen" value={deviceForm.lastSeenAt} onChange={event => setDeviceForm(current => ({ ...current, lastSeenAt: event.currentTarget.value }))} />
            <NumberInput label="Battery %" min={0} max={100} value={deviceForm.batteryPercent} onChange={value => setDeviceForm(current => ({ ...current, batteryPercent: value }))} />
            <NumberInput label="RSSI dBm" value={deviceForm.rssi} onChange={value => setDeviceForm(current => ({ ...current, rssi: value }))} />
          </SimpleGrid>
          <Checkbox label="Enabled" checked={deviceForm.enabled} onChange={event => setDeviceForm(current => ({ ...current, enabled: event.currentTarget.checked }))} />
          <Textarea label="Description" minRows={2} value={deviceForm.description} onChange={event => setDeviceForm(current => ({ ...current, description: event.currentTarget.value }))} />
          <DeviceIdentitiesEditor value={deviceForm.identities} onChange={identities => setDeviceForm(current => ({ ...current, identities }))} devices={devices} identityLabels={identityLabelsQuery.data ?? []} currentDeviceId={editingDevice?.id} onViewDevice={device => { setDeviceModalOpen(false); openEditDevice(device); }} />
          <DeviceAccessLinksEditor value={deviceForm.accessLinks} onChange={accessLinks => setDeviceForm(current => ({ ...current, accessLinks }))} context={{ deviceName: deviceForm.name, macAddress: primaryIdentity(deviceForm.identities, "MAC")?.value ?? "", ipAddress: primaryIdentity(deviceForm.identities, "IP")?.value ?? "", ieeeAddress: primaryIdentity(deviceForm.identities, "IEEE")?.value ?? "", fqdn: primaryIdentity(deviceForm.identities, "FQDN")?.value ?? "", manufacturer: deviceForm.manufacturer, model: deviceForm.model, deviceClass: deviceForm.deviceClass, deviceType: deviceForm.deviceType, location: (locationsQuery.data ?? []).find(location => location.id === deviceForm.locationId)?.name ?? "", identities: deviceForm.identities }} openAccessLinkId={accessLinkToOpen} onAccessLinkOpened={() => setAccessLinkToOpen(null)} />
          <Stack gap="xs">
            <Text fw={600} size="sm">SensorSphere links</Text>
            <Text size="xs" c="dimmed">Optional loose links. The Device Registry remains usable if none are selected.</Text>
            <MultiSelect label="Sensors" searchable clearable value={deviceForm.sensorIds} onChange={value => setDeviceForm(current => ({ ...current, sensorIds: value }))} data={(sensorsQuery.data ?? []).map(sensor => ({ value: sensor.id, label: sensor.name ? `${sensor.name} (${sensor.uid})` : sensor.uid }))} />
            <MultiSelect label="Assets" searchable clearable value={deviceForm.assetIds} onChange={value => setDeviceForm(current => ({ ...current, assetIds: value }))} data={(assetsQuery.data ?? []).map(asset => ({ value: asset.id, label: asset.sensor?.name ?? asset.externalId }))} />
            <MultiSelect label="Gateways" searchable clearable value={deviceForm.gatewayIds} onChange={value => setDeviceForm(current => ({ ...current, gatewayIds: value }))} data={(gatewaysQuery.data ?? []).map(gateway => ({ value: gateway.id, label: `${gateway.name} (${gateway.gatewayId})` }))} />
          </Stack>
          <Group justify="flex-end"><Button variant="default" onClick={() => setDeviceModalOpen(false)}>Cancel</Button><Button disabled={!deviceForm.name.trim() || !deviceForm.deviceType.trim()} loading={saveDevice.isPending} onClick={() => saveDevice.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={profileModalOpen} onClose={() => setProfileModalOpen(false)} title={editingProfile ? "Edit health profile" : "Add health profile"} size="lg">
        <Stack gap="md">
          {error && <Text c="red" size="sm">{error}</Text>}
          <TextInput label="Name" required autoFocus value={profileForm.name} onChange={event => setProfileForm(current => ({ ...current, name: event.currentTarget.value }))} />
          <Textarea label="Description" value={profileForm.description} onChange={event => setProfileForm(current => ({ ...current, description: event.currentTarget.value }))} />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput label="Last seen warning (seconds)" min={1} value={profileForm.warningAfterSeconds} onChange={value => setProfileForm(current => ({ ...current, warningAfterSeconds: value }))} />
            <NumberInput label="Offline after (seconds)" min={1} value={profileForm.offlineAfterSeconds} onChange={value => setProfileForm(current => ({ ...current, offlineAfterSeconds: value }))} />
            <NumberInput label="Battery warning %" min={0} max={100} value={profileForm.batteryWarningPercent} onChange={value => setProfileForm(current => ({ ...current, batteryWarningPercent: value }))} />
            <NumberInput label="Battery critical %" min={0} max={100} value={profileForm.batteryCriticalPercent} onChange={value => setProfileForm(current => ({ ...current, batteryCriticalPercent: value }))} />
            <NumberInput label="RSSI warning dBm" value={profileForm.rssiWarning} onChange={value => setProfileForm(current => ({ ...current, rssiWarning: value }))} />
            <NumberInput label="RSSI critical dBm" value={profileForm.rssiCritical} onChange={value => setProfileForm(current => ({ ...current, rssiCritical: value }))} />
          </SimpleGrid>
          <Group justify="flex-end"><Button variant="default" onClick={() => setProfileModalOpen(false)}>Cancel</Button><Button disabled={!profileForm.name.trim()} loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
