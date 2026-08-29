import React from "react";

import { activeFilterStyles } from "./filterStyles";
import { BadgeSelect } from "./BadgeSelect";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
  TextInput,
  Title
} from "@mantine/core";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import { NavigationIcon } from "./NavigationIcon";

import {
  LocationIcon,
  getLocationIconName
} from "./LocationIcon";

import {
  createGateway,
  createGatewayType,
  deleteGateway,
  deleteGatewayType,
  getGateways,
  getGatewayTypes,
  getLocations,
  updateGateway,
  updateGatewayType
} from "./api";

import type {
  CreateGatewayInput,
  Gateway,
  GatewayType,
  UpdateGatewayInput
} from "./types";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import {
  ResetFiltersAction
} from "./ResetFiltersAction";
import { LocationFilterField, LocationSelect, locationIdsForScope, matchesLocationFilter } from "./LocationFilterControls";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { GatewayTypeBadge } from "./GatewayTypeBadge";

function GatewayIpAddress({
  ipAddress
}: {
  ipAddress: string | null;
}) {
  if (!ipAddress) {
    return <Text size="sm">—</Text>;
  }

  const target =
    `ss_${ipAddress}`;

  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm">
        {ipAddress}
      </Text>
      <Tooltip label="Open gateway web interface">
        <ActionIcon
          component="a"
          href={`http://${ipAddress}`}
          target={target}
          variant="subtle"
          color="blue"
          size="sm"
          aria-label={`Open ${ipAddress} web interface`}
        >
          ↗
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

interface GatewayTypeFormState {
  id: string | null;
  key: string;
  name: string;
  description: string;
  color: string;
}

const emptyGatewayTypeForm = (): GatewayTypeFormState => ({
  id: null,
  key: "",
  name: "",
  description: "",
  color: "#7950f2"
});

const gatewayTypeToForm = (type: GatewayType): GatewayTypeFormState => ({
  id: type.id,
  key: type.key,
  name: type.name,
  description: type.description ?? "",
  color: type.color || "#7950f2"
});

interface GatewayFormState {
  gatewayId: string;
  name: string;
  gatewayTypeId: string;
  version: string;
  ipAddress: string;
  macAddress: string;
  wifiSsid: string;
  boardId: string;
  buildDate: string;
  locationId: string;
  enabled: boolean;
}

const emptyForm = (): GatewayFormState => ({
  gatewayId: "",
  name: "",
  gatewayTypeId: "",
  version: "",
  ipAddress: "",
  macAddress: "",
  wifiSsid: "",
  boardId: "",
  buildDate: "",
  locationId: "",
  enabled: true
});

function gatewayToForm(
  gateway: Gateway
): GatewayFormState {
  return {
    gatewayId: gateway.gatewayId,
    name: gateway.name,
    gatewayTypeId: gateway.type.id,
    version: gateway.version ?? "",
    ipAddress: gateway.ipAddress ?? "",
    macAddress: gateway.macAddress ?? "",
    wifiSsid: gateway.wifiSsid ?? "",
    boardId: gateway.boardId ?? "",
    buildDate: gateway.buildDate ?? "",
    locationId: gateway.location?.id ?? "",
    enabled: gateway.enabled
  };
}

function emptyToNull(
  value: string
): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function ageSeconds(
  value: string | null
): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function relativeAgo(
  value: string | null
): string {
  const seconds = ageSeconds(value);
  if (seconds === null) return "Never";
  if (seconds < 10) return "a few seconds ago";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function lastSeenLabel(
  value: string | null
): string {
  return value
    ? `${relativeAgo(value)} · ${new Date(value).toLocaleString()}`
    : "Never";
}

function isOnline(
  value: string | null
): boolean {
  const seconds = ageSeconds(value);
  return seconds !== null && seconds <= 120;
}

function qualityLabel(rssi: number): string {
  if (rssi >= -65) return "Excellent";
  if (rssi >= -75) return "Good";
  if (rssi >= -85) return "Fair";
  return "Weak";
}

function qualityColor(rssi: number): string {
  if (rssi >= -65) return "green";
  if (rssi >= -75) return "teal";
  if (rssi >= -85) return "yellow";
  return "red";
}

export function GatewayCatalog() {
  const queryClient = useQueryClient();

  const [tableSortKey, setTableSortKey] = usePersistentState<string>("gateways.tableSortKey", "name");
  const [tableSortDirection, setTableSortDirection] = usePersistentState<SortDirection>("gateways.tableSortDirection", "asc");

  const [viewMode, setViewMode] =
    usePersistentState<"cards" | "compact">(
      "gateways.viewMode",
      "cards",
      value =>
        value === "cards" ||
        value === "compact"
    );

  const [nameSearch, setNameSearch] =
    usePersistentState<string>(
      "gateways.nameSearch",
      "",
      value => typeof value === "string"
    );

  const [typeFilter, setTypeFilter] =
    usePersistentState<string | null>(
      "gateways.typeId",
      null,
      value => value === null || typeof value === "string"
    );

  const [enabledFilter, setEnabledFilter] =
    usePersistentState<"all" | "enabled" | "disabled">(
      "gateways.enabled",
      "all",
      value =>
        value === "all" ||
        value === "enabled" ||
        value === "disabled"
    );

  const [locationFilter, setLocationFilter] = usePersistentState<string | null>(
    "gateways.locationId", null, (value): value is string | null => value === null || typeof value === "string"
  );
  const [includeLocationDescendants, setIncludeLocationDescendants] = usePersistentState<boolean>(
    "filters.locationIncludeDescendants", true, (value): value is boolean => typeof value === "boolean"
  );
  const [ssidFilter, setSsidFilter] = usePersistentState<string | null>(
    "gateways.ssid", null, (value): value is string | null => value === null || typeof value === "string"
  );
  const [statusFilter, setStatusFilter] = usePersistentState<"all" | "online" | "offline">(
    "gateways.status", "all", (value): value is "all" | "online" | "offline" => value === "all" || value === "online" || value === "offline"
  );

  const [editingGateway, setEditingGateway] =
    React.useState<Gateway | null>(null);
  const [creating, setCreating] =
    React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<Gateway | null>(null);
  const [form, setForm] =
    React.useState<GatewayFormState>(emptyForm);
  const [gatewayTypesOpen, setGatewayTypesOpen] = React.useState(false);
  const [gatewayTypeForm, setGatewayTypeForm] = React.useState<GatewayTypeFormState>(emptyGatewayTypeForm);
  const [gatewayTypeDeleteTarget, setGatewayTypeDeleteTarget] = React.useState<GatewayType | null>(null);

  const gatewaysQuery = useQuery({
    queryKey: ["gateways"],
    queryFn: getGateways,
    refetchInterval: 30_000
  });

  const gatewayTypesQuery = useQuery({
    queryKey: ["gateway-types"],
    queryFn: getGatewayTypes
  });

  const saveGatewayTypeMutation = useMutation({
    mutationFn: async () => {
      const input = {
        key: gatewayTypeForm.key.trim().toLowerCase(),
        name: gatewayTypeForm.name.trim(),
        description: emptyToNull(gatewayTypeForm.description),
        color: gatewayTypeForm.color
      };
      return gatewayTypeForm.id
        ? updateGatewayType(gatewayTypeForm.id, input)
        : createGatewayType(input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gateway-types"] }),
        queryClient.invalidateQueries({ queryKey: ["gateways"] }),
        queryClient.invalidateQueries({ queryKey: ["sensors"] })
      ]);
      setGatewayTypeForm(emptyGatewayTypeForm());
    }
  });

  const deleteGatewayTypeMutation = useMutation({
    mutationFn: (id: string) => deleteGatewayType(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gateway-types"] });
      setGatewayTypeDeleteTarget(null);
      setGatewayTypeForm(emptyGatewayTypeForm());
    }
  });

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: getLocations
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const editable: UpdateGatewayInput = {
        name: form.name.trim(),
        gatewayTypeId: form.gatewayTypeId,
        version: emptyToNull(form.version),
        ipAddress: emptyToNull(form.ipAddress),
        macAddress: emptyToNull(form.macAddress),
        wifiSsid: emptyToNull(form.wifiSsid),
        boardId: emptyToNull(form.boardId),
        buildDate: emptyToNull(form.buildDate),
        locationId: form.locationId || null,
        enabled: form.enabled
      };

      return editingGateway
        ? updateGateway(editingGateway.id, editable)
        : createGateway({
            ...editable,
            gatewayId: form.gatewayId.trim(),
            gatewayTypeId: form.gatewayTypeId,
            name: form.name.trim()
          } as CreateGatewayInput);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gateways"] }),
        queryClient.invalidateQueries({ queryKey: ["sensors"] })
      ]);
      setEditingGateway(null);
      setCreating(false);
      setForm(emptyForm());
    }
  });

  React.useEffect(
    () => {
      if (
        (!creating && editingGateway === null)
      ) {
        return;
      }

      const handleKeyDown =
        (event: KeyboardEvent) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();

            const canSave =
              form.gatewayId.trim().length > 0 &&
              form.name.trim().length > 0 &&
              form.gatewayTypeId.length > 0;

            if (
              canSave &&
              !saveMutation.isPending
            ) {
              saveMutation.mutate();
            }
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () =>
        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
    },
    [
      creating,
      editingGateway,
      form,
      saveMutation.isPending
    ]
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGateway(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gateways"] }),
        queryClient.invalidateQueries({ queryKey: ["sensors"] })
      ]);
      setDeleteTarget(null);
    }
  });

  React.useEffect(
    () => {
      const gatewayId =
        window.sessionStorage.getItem(
          "dashboard.edit.gateway"
        );

      if (!gatewayId) {
        return;
      }

      const gateway =
        gatewaysQuery.data?.find(
          current =>
            current.id === gatewayId
        );

      if (!gateway) {
        return;
      }

      window.sessionStorage.removeItem(
        "dashboard.edit.gateway"
      );

      setEditingGateway(gateway);
      setForm(gatewayToForm(gateway));
      setCreating(false);
    },
    [
      gatewaysQuery.data
    ]
  );

  if (
    gatewaysQuery.isLoading ||
    gatewayTypesQuery.isLoading ||
    locationsQuery.isLoading
  ) {
    return <Text>Loading gateways...</Text>;
  }

  if (
    gatewaysQuery.isError ||
    gatewayTypesQuery.isError ||
    locationsQuery.isError
  ) {
    return <Text c="red">Unable to load gateways.</Text>;
  }

  const gateways = gatewaysQuery.data ?? [];
  const gatewayTypes = gatewayTypesQuery.data ?? [];
  const gatewayTypeOptions = gatewayTypes.map(type => ({
    value: type.id,
    label: type.name
  }));
  const locationsById =
    new Map(
      (locationsQuery.data ?? []).map(
        location => [
          location.id,
          location
        ]
      )
    );
  const locations = locationsQuery.data ?? [];
  const locationScopeIds = locationIdsForScope(locations, locationFilter, includeLocationDescendants);
  const ssidOptions = Array.from(new Set(gateways.map(gateway => gateway.wifiSsid).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right));
  const normalizedSearch = nameSearch.trim().toLowerCase();
  const typeOptions = gatewayTypes.map(type => ({
    value: type.id,
    label: type.name
  }));

  const onlineGateways = gateways.filter(
    gateway => isOnline(gateway.lastSeenAt)
  ).length;

  const offlineGateways = gateways.length - onlineGateways;

  const filteredGateways = gateways
    .filter(gateway =>
      (
        !normalizedSearch ||
        gateway.name.toLowerCase().includes(normalizedSearch) ||
        gateway.type.name.toLowerCase().includes(normalizedSearch) ||
        gateway.gatewayId.toLowerCase().includes(normalizedSearch) ||
        (gateway.macAddress ?? "").toLowerCase().includes(normalizedSearch) ||
        (gateway.wifiSsid ?? "").toLowerCase().includes(normalizedSearch) ||
        (gateway.boardId ?? "").toLowerCase().includes(normalizedSearch) ||
        (gateway.ipAddress ?? "").toLowerCase().includes(normalizedSearch)
      ) &&
      (typeFilter === null || gateway.type.id === typeFilter) &&
      matchesLocationFilter(
        gateway.location?.id,
        locationFilter,
        locationScopeIds
      ) &&
      (ssidFilter === null || gateway.wifiSsid === ssidFilter) &&
      (statusFilter === "all" || (statusFilter === "online" ? isOnline(gateway.lastSeenAt) : !isOnline(gateway.lastSeenAt))) &&
      (
        enabledFilter === "all" ||
        (enabledFilter === "enabled"
          ? gateway.enabled
          : !gateway.enabled)
      )
    );

  const sortedTableGateways = [...filteredGateways].sort((left, right) => {
    const value = (gateway: Gateway) => {
      switch (tableSortKey) {
        case "gatewayId": return gateway.gatewayId;
        case "type": return gateway.type.name;
        case "version": return gateway.version;
        case "mac": return gateway.macAddress;
        case "ssid": return gateway.wifiSsid;
        case "ip": return gateway.ipAddress;
        case "location": return gateway.location?.name;
        case "status": return isOnline(gateway.lastSeenAt);
        case "wifiRssi": return gateway.wifiRssi;
        case "enabled": return gateway.enabled;
        case "sensors": return gateway.sensorCount;
        case "assets": return gateway.assetCount;
        case "lastSeen": return gateway.lastSeenAt ? new Date(gateway.lastSeenAt).getTime() : null;
        default: return gateway.name;
      }
    };
    return compareTableValues(value(left), value(right), tableSortDirection);
  });

  const toggleTableSort = (key: string): void => {
    if (tableSortKey === key) {
      setTableSortDirection(tableSortDirection === "asc" ? "desc" : "asc");
    } else {
      setTableSortKey(key);
      setTableSortDirection("asc");
    }
  };

  const filtersActive =
    nameSearch.trim().length > 0 ||
    typeFilter !== null ||
    locationFilter !== null ||
    ssidFilter !== null ||
    statusFilter !== "all" ||
    enabledFilter !== "all";

  const openCreate = (): void => {
    setEditingGateway(null);
    setForm(emptyForm());
    setCreating(true);
  };

  const openEdit = (gateway: Gateway): void => {
    setEditingGateway(gateway);
    setForm(gatewayToForm(gateway));
    setCreating(false);
  };

  const closeEditor = (): void => {
    setEditingGateway(null);
    setCreating(false);
    setForm(emptyForm());
  };

  return (
    <>
      <Stack gap="md">
        <div className="page-sticky-controls page-sticky-controls-gap-md">
        <Group justify="space-between">
          <div>
            <Group gap="xs">
              <NavigationIcon page="gateways" size={24} />
              <Title order={2}>Gateways</Title>
            </Group>
            <Text c="dimmed">Registered SensorSphere gateways</Text>
          </div>

          <Group gap="xs">
            <Badge color="green" variant="light">
              {onlineGateways} Online
            </Badge>
            <Badge color="red" variant="light">
              {offlineGateways} Offline
            </Badge>
            <Badge variant="light">
              {filteredGateways.length} / {gateways.length} gateways
            </Badge>
            <Button size="xs" color="gray" variant="light" onClick={() => setGatewayTypesOpen(true)}>Manage types</Button>
            <Button size="xs" color="green" variant="light" onClick={openCreate}>Add gateway</Button>
            <SegmentedControl
              value={viewMode}
              onChange={value =>
                setViewMode(value as "cards" | "compact")
              }
              data={[
                { value: "cards", label: "Cards" },
                { value: "compact", label: "Compact" }
              ]}
            />
          </Group>
        </Group>

        <Group align="flex-end" wrap="nowrap">
          <ResetFiltersAction
            active={filtersActive}
            onReset={() => {
              setNameSearch("");
              setTypeFilter(null);
              setLocationFilter(null);
              setSsidFilter(null);
              setStatusFilter("all");
              setEnabledFilter("all");
            }}
          />
          <SimpleGrid cols={{ base: 1, sm: 3, xl: 7 }} spacing="sm" style={{ flex: 1 }}>
          <TextInput
            label="Search"
            placeholder="Name, gateway ID, type, MAC, SSID or IP"
            value={nameSearch}
            onChange={event => setNameSearch(event.currentTarget.value)}
            styles={activeFilterStyles(nameSearch.trim().length > 0)}
          />
          <Select
            label="Type"
            clearable
            searchable
            placeholder="All"
            value={typeFilter}
            onChange={setTypeFilter}
            data={typeOptions}
            renderOption={({ option }) => {
              const type = gatewayTypes.find(current => current.id === option.value);
              return type ? <GatewayTypeBadge type={type} size="sm" /> : option.label;
            }}
            styles={activeFilterStyles(typeFilter !== null)}
          />
          <div style={{ gridColumn: "span 2" }}>
            <LocationFilterField
              locations={locations}
              value={locationFilter}
              onChange={setLocationFilter}
              includeDescendants={includeLocationDescendants}
              onIncludeDescendantsChange={setIncludeLocationDescendants}
              placeholder="All locations"
              includeUnassigned
              styles={activeFilterStyles(locationFilter !== null)}
            />
          </div>
          <Select
            label="SSID"
            clearable
            searchable
            placeholder="All SSIDs"
            value={ssidFilter}
            onChange={setSsidFilter}
            data={ssidOptions}
            styles={activeFilterStyles(ssidFilter !== null)}
          />
          <BadgeSelect
            badgeColor={value => value === "online" ? "green" : value === "offline" ? "red" : "gray"}
            label="Status"
            value={statusFilter}
            onChange={value => value && setStatusFilter(value as "all" | "online" | "offline")}
            data={[{ value: "all", label: "All" }, { value: "online", label: "Online" }, { value: "offline", label: "Offline" }]}
            styles={activeFilterStyles(statusFilter !== "all")}
          />
          <BadgeSelect
            badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "orange" : "gray"}
            label="Enabled"
            value={enabledFilter}
            onChange={value =>
              value && setEnabledFilter(
                value as "all" | "enabled" | "disabled"
              )
            }
            data={[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" }
            ]}
            styles={activeFilterStyles(enabledFilter !== "all")}
          />
          </SimpleGrid>
        </Group>
        </div>

        {viewMode === "cards" ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {filteredGateways.map(gateway => (
              <Card key={gateway.id} withBorder radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700} size="lg">{gateway.name}</Text>
                      <GatewayTypeBadge type={gateway.type} size="sm" />
                    </div>
                    <Group gap={4}>
                      <Badge
                        color={isOnline(gateway.lastSeenAt) ? "green" : "red"}
                        variant="light"
                      >
                        {isOnline(gateway.lastSeenAt) ? "ONLINE" : "OFFLINE"}
                      </Badge>
                      <Badge color={gateway.enabled ? "blue" : "orange"} variant="light">
                        {gateway.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Group>
                  </Group>

                  <SimpleGrid cols={2} spacing="xs">
                    <div>
                      <Text size="xs" c="dimmed">Gateway ID</Text>
                      <Text size="sm" fw={600}>{gateway.gatewayId}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">MAC address</Text>
                      <Text size="sm">{gateway.macAddress ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Version</Text>
                      <Text size="sm">{gateway.version ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">IP address</Text>
                      <GatewayIpAddress ipAddress={gateway.ipAddress} />
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">WiFi SSID</Text>
                      <Text size="sm">{gateway.wifiSsid ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">WiFi RSSI</Text>
                      {gateway.wifiRssi === null ? (
                        <Text size="sm">—</Text>
                      ) : (
                        <Badge
                          size="sm"
                          variant="light"
                          color={qualityColor(gateway.wifiRssi)}
                        >
                          {gateway.wifiRssi.toFixed(0)} dBm · {qualityLabel(gateway.wifiRssi)}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Board</Text>
                      <Text size="sm">{gateway.boardId ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Build date</Text>
                      <Text size="sm">{gateway.buildDate ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Location</Text>
                      {gateway.location ? (
                        <Group gap={5} wrap="nowrap">
                          <LocationIcon
                            name={
                              getLocationIconName(
                                locationsById.get(gateway.location.id)
                              )
                            }
                            size={16}
                          />
                          <Text size="sm">{gateway.location.name}</Text>
                        </Group>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Sensors</Text>
                      <Text size="sm">{gateway.sensorCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Assets</Text>
                      <Text size="sm">{gateway.assetCount}</Text>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Text size="xs" c="dimmed">Last seen</Text>
                      <Text size="sm">{lastSeenLabel(gateway.lastSeenAt)}</Text>
                    </div>
                  </SimpleGrid>

                  <Group justify="flex-end">
                    <Button size="xs" color="blue" variant="light" onClick={() => openEdit(gateway)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      onClick={() => setDeleteTarget(gateway)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        ) : (
          <Table.ScrollContainer minWidth={1200}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  {[
                    ["name", "Name"], ["gatewayId", "Gateway ID"], ["type", "Type"], ["version", "Version"],
                    ["mac", "MAC"], ["ssid", "SSID"], ["ip", "IP"], ["location", "Location"],
                    ["status", "Status"], ["wifiRssi", "WiFi RSSI"], ["enabled", "Enabled"],
                    ["sensors", "Sensors"], ["assets", "Assets"], ["lastSeen", "Last seen"]
                  ].map(([key, label]) => (
                    <SortableTableHeader key={key} active={tableSortKey === key} direction={tableSortDirection} onClick={() => toggleTableSort(key)}>
                      {label}
                    </SortableTableHeader>
                  ))}
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedTableGateways.map(gateway => (
                  <Table.Tr key={gateway.id}>
                    <Table.Td fw={600}>{gateway.name}</Table.Td>
                    <Table.Td>{gateway.gatewayId}</Table.Td>
                    <Table.Td><GatewayTypeBadge type={gateway.type} size="sm" /></Table.Td>
                    <Table.Td>{gateway.version ?? "—"}</Table.Td>
                    <Table.Td>{gateway.macAddress ?? "—"}</Table.Td>
                    <Table.Td>{gateway.wifiSsid ?? "—"}</Table.Td>
                    <Table.Td><GatewayIpAddress ipAddress={gateway.ipAddress} /></Table.Td>
                    <Table.Td>
                      {gateway.location ? (
                        <Group gap={5} wrap="nowrap">
                          <LocationIcon
                            name={
                              getLocationIconName(
                                locationsById.get(gateway.location.id)
                              )
                            }
                            size={16}
                          />
                          <Text size="sm">{gateway.location.name}</Text>
                        </Group>
                      ) : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        color={isOnline(gateway.lastSeenAt) ? "green" : "red"}
                        variant="light"
                      >
                        {isOnline(gateway.lastSeenAt) ? "ONLINE" : "OFFLINE"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {gateway.wifiRssi === null ? "—" : (
                        <Badge
                          size="sm"
                          variant="light"
                          color={qualityColor(gateway.wifiRssi)}
                        >
                          {gateway.wifiRssi.toFixed(0)} dBm · {qualityLabel(gateway.wifiRssi)}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        color={gateway.enabled ? "blue" : "orange"}
                        variant="light"
                      >
                        {gateway.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{gateway.sensorCount}</Table.Td>
                    <Table.Td>{gateway.assetCount}</Table.Td>
                    <Table.Td>{lastSeenLabel(gateway.lastSeenAt)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          color="blue"
                          variant="light"
                          onClick={() => openEdit(gateway)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() => setDeleteTarget(gateway)}
                        >
                          Delete
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>

      <Modal
        opened={gatewayTypesOpen}
        onClose={() => { setGatewayTypesOpen(false); setGatewayTypeForm(emptyGatewayTypeForm()); }}
        title="Gateway types"
        size="lg"
        centered
      >
        <Stack>
          <TextInput
            label="Key"
            description="Stable identifier, for example ble_gateway"
            value={gatewayTypeForm.key}
            onChange={event => setGatewayTypeForm({ ...gatewayTypeForm, key: event.currentTarget.value })}
          />
          <TextInput
            label="Name"
            value={gatewayTypeForm.name}
            onChange={event => setGatewayTypeForm({ ...gatewayTypeForm, name: event.currentTarget.value })}
          />
          <TextInput
            label="Description"
            value={gatewayTypeForm.description}
            onChange={event => setGatewayTypeForm({ ...gatewayTypeForm, description: event.currentTarget.value })}
          />
          <ColorInput
            label="Color"
            format="hex"
            swatches={[
              "#868e96", "#fa5252", "#e64980", "#be4bdb", "#7950f2",
              "#4c6ef5", "#228be6", "#15aabf", "#12b886", "#40c057",
              "#82c91e", "#fab005", "#fd7e14"
            ]}
            value={gatewayTypeForm.color}
            onChange={color => setGatewayTypeForm({ ...gatewayTypeForm, color })}
          />
          <Group justify="space-between">
            {gatewayTypeForm.id ? (
              <Button color="gray" variant="light" onClick={() => setGatewayTypeForm(emptyGatewayTypeForm())}>New type</Button>
            ) : <span />}
            <Button
              color={gatewayTypeForm.id ? "blue" : "green"}
              variant="light"
              loading={saveGatewayTypeMutation.isPending}
              disabled={!gatewayTypeForm.key.trim() || !gatewayTypeForm.name.trim() || !gatewayTypeForm.color.trim()}
              onClick={() => saveGatewayTypeMutation.mutate()}
            >
              {gatewayTypeForm.id ? "Save" : "Add type"}
            </Button>
          </Group>
          {saveGatewayTypeMutation.isError && (
            <Text c="red" size="sm">{saveGatewayTypeMutation.error instanceof Error ? saveGatewayTypeMutation.error.message : "Unable to save gateway type"}</Text>
          )}
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>Key</Table.Th><Table.Th>Description</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {gatewayTypes.map(type => (
                <Table.Tr key={type.id}>
                  <Table.Td><GatewayTypeBadge type={type} /></Table.Td>
                  <Table.Td>{type.key}</Table.Td>
                  <Table.Td>{type.description ?? "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Button size="compact-xs" color="blue" variant="light" onClick={() => setGatewayTypeForm(gatewayTypeToForm(type))}>Edit</Button>
                      <Button size="compact-xs" color="red" variant="light" onClick={() => setGatewayTypeDeleteTarget(type)}>Delete</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Modal>

      <Modal
        opened={gatewayTypeDeleteTarget !== null}
        onClose={() => setGatewayTypeDeleteTarget(null)}
        title="Delete gateway type"
        centered
      >
        <Stack>
          <Text>Delete gateway type <b>{gatewayTypeDeleteTarget?.name}</b>? A type assigned to gateways cannot be deleted.</Text>
          {deleteGatewayTypeMutation.isError && (
            <Text c="red">{deleteGatewayTypeMutation.error instanceof Error ? deleteGatewayTypeMutation.error.message : "Unable to delete gateway type"}</Text>
          )}
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setGatewayTypeDeleteTarget(null)}>Cancel</Button>
            <Button color="red" variant="light" loading={deleteGatewayTypeMutation.isPending} onClick={() => gatewayTypeDeleteTarget && deleteGatewayTypeMutation.mutate(gatewayTypeDeleteTarget.id)}>Delete</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={creating || editingGateway !== null}
        onClose={closeEditor}
        title={editingGateway ? `Edit ${editingGateway.name}` : "Add gateway"}
        centered
      >
        <Stack>
          <TextInput
            label="Gateway ID"
            required
            description="Stable identifier used in MQTT topics, for example ble-gateway-01"
            value={form.gatewayId}
            disabled={editingGateway !== null}
            onChange={event => setForm({ ...form, gatewayId: event.currentTarget.value })}
          />
          <TextInput
            label="Name"
            required
            description={editingGateway?.nameManuallySet ? "Manually managed name" : "Automatically follows MQTT friendly_name until edited manually"}
            value={form.name}
            onChange={event => setForm({ ...form, name: event.currentTarget.value })}
          />
          <Select
            label="Type"
            required
            value={form.gatewayTypeId || null}
            onChange={value => setForm({ ...form, gatewayTypeId: value ?? "" })}
            data={gatewayTypeOptions}
            renderOption={({ option }) => {
              const type = gatewayTypes.find(current => current.id === option.value);
              return type ? <GatewayTypeBadge type={type} size="sm" /> : option.label;
            }}
          />
          <TextInput
            label="Version"
            value={form.version}
            onChange={event => setForm({ ...form, version: event.currentTarget.value })}
          />
          <TextInput
            label="IP address"
            placeholder="192.168.1.10"
            value={form.ipAddress}
            onChange={event => setForm({ ...form, ipAddress: event.currentTarget.value })}
          />
          <TextInput
            label="MAC address"
            value={form.macAddress}
            onChange={event => setForm({ ...form, macAddress: event.currentTarget.value })}
          />
          <TextInput
            label="WiFi SSID"
            value={form.wifiSsid}
            onChange={event => setForm({ ...form, wifiSsid: event.currentTarget.value })}
          />
          <TextInput
            label="Board ID"
            value={form.boardId}
            onChange={event => setForm({ ...form, boardId: event.currentTarget.value })}
          />
          <TextInput
            label="Build date"
            value={form.buildDate}
            onChange={event => setForm({ ...form, buildDate: event.currentTarget.value })}
          />
          <LocationSelect
            label="Location"
            placeholder="No location"
            clearable
            searchable
            value={form.locationId || null}
            locations={locations}
            onChange={value => setForm({ ...form, locationId: value ?? "" })}
          />
          <Checkbox
            label="Enabled"
            checked={form.enabled}
            onChange={event => setForm({ ...form, enabled: event.currentTarget.checked })}
          />

          {saveMutation.isError && (
            <Text c="red">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "Unable to save gateway."}
            </Text>
          )}

          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={closeEditor}>Cancel</Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.gatewayId.trim() || !form.name.trim() || !form.gatewayTypeId}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete gateway"
        centered
      >
        <Stack>
          <Text>
            Delete gateway {deleteTarget?.name}? Sensors and assets currently assigned
            to it will be left unassigned.
          </Text>
          {deleteMutation.isError && (
            <Text c="red">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "Unable to delete gateway."}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              variant="light"
              loading={deleteMutation.isPending}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
