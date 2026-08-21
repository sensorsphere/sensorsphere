import React from "react";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
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
  createGateway,
  deleteGateway,
  getGateways,
  updateGateway
} from "./api";

import type {
  CreateGatewayInput,
  Gateway,
  UpdateGatewayInput
} from "./types";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import {
  ResetFiltersAction
} from "./ResetFiltersAction";

interface GatewayFormState {
  name: string;
  type: string;
  version: string;
  ipAddress: string;
  enabled: boolean;
}

const emptyForm = (): GatewayFormState => ({
  name: "",
  type: "",
  version: "",
  ipAddress: "",
  enabled: true
});

function gatewayToForm(
  gateway: Gateway
): GatewayFormState {
  return {
    name: gateway.name,
    type: gateway.type,
    version: gateway.version ?? "",
    ipAddress: gateway.ipAddress ?? "",
    enabled: gateway.enabled
  };
}

function emptyToNull(
  value: string
): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function lastSeenLabel(
  value: string | null
): string {
  return value
    ? new Date(value).toLocaleString()
    : "Never";
}

export function GatewayCatalog() {
  const queryClient = useQueryClient();

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
      "gateways.type",
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

  const [editingGateway, setEditingGateway] =
    React.useState<Gateway | null>(null);
  const [creating, setCreating] =
    React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<Gateway | null>(null);
  const [form, setForm] =
    React.useState<GatewayFormState>(emptyForm);

  const gatewaysQuery = useQuery({
    queryKey: ["gateways"],
    queryFn: getGateways,
    refetchInterval: 30_000
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input: CreateGatewayInput | UpdateGatewayInput = {
        name: form.name.trim(),
        type: form.type.trim(),
        version: emptyToNull(form.version),
        ipAddress: emptyToNull(form.ipAddress),
        enabled: form.enabled
      };

      return editingGateway
        ? updateGateway(editingGateway.id, input)
        : createGateway(input as CreateGatewayInput);
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

  if (gatewaysQuery.isLoading) {
    return <Text>Loading gateways...</Text>;
  }

  if (gatewaysQuery.isError) {
    return <Text c="red">Unable to load gateways.</Text>;
  }

  const gateways = gatewaysQuery.data ?? [];
  const normalizedSearch = nameSearch.trim().toLowerCase();
  const typeOptions = Array.from(
    new Set(gateways.map(gateway => gateway.type))
  ).sort((a, b) => a.localeCompare(b));

  const filteredGateways = gateways
    .filter(gateway =>
      (
        !normalizedSearch ||
        gateway.name.toLowerCase().includes(normalizedSearch) ||
        gateway.type.toLowerCase().includes(normalizedSearch) ||
        (gateway.ipAddress ?? "").toLowerCase().includes(normalizedSearch)
      ) &&
      (typeFilter === null || gateway.type === typeFilter) &&
      (
        enabledFilter === "all" ||
        (enabledFilter === "enabled"
          ? gateway.enabled
          : !gateway.enabled)
      )
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  const filtersActive =
    nameSearch.trim().length > 0 ||
    typeFilter !== null ||
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
        <Group justify="space-between">
          <div>
            <Group gap="xs">
              <NavigationIcon page="gateways" size={24} />
              <Title order={2}>Gateways</Title>
            </Group>
            <Text c="dimmed">Registered SensorSphere gateways</Text>
          </div>

          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={value =>
                setViewMode(value as "cards" | "compact")
              }
              data={[
                { value: "cards", label: "Card" },
                { value: "compact", label: "Compact" }
              ]}
            />
            <Badge variant="light">
              {filteredGateways.length} / {gateways.length} gateways
            </Badge>
            <ResetFiltersAction
              active={filtersActive}
              onReset={() => {
                setNameSearch("");
                setTypeFilter(null);
                setEnabledFilter("all");
              }}
            />
            <Button onClick={openCreate}>Add gateway</Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="Search"
            placeholder="Name, type or IP"
            value={nameSearch}
            onChange={event => setNameSearch(event.currentTarget.value)}
          />
          <Select
            label="Type"
            clearable
            searchable
            placeholder="All"
            value={typeFilter}
            onChange={setTypeFilter}
            data={typeOptions}
          />
          <Select
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
          />
        </SimpleGrid>

        {viewMode === "cards" ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {filteredGateways.map(gateway => (
              <Card key={gateway.id} withBorder radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700} size="lg">{gateway.name}</Text>
                      <Text size="xs" c="dimmed">{gateway.type}</Text>
                    </div>
                    <Badge color={gateway.enabled ? "green" : "gray"}>
                      {gateway.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </Group>

                  <SimpleGrid cols={2} spacing="xs">
                    <div>
                      <Text size="xs" c="dimmed">Version</Text>
                      <Text size="sm">{gateway.version ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">IP address</Text>
                      <Text size="sm">{gateway.ipAddress ?? "—"}</Text>
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
                    <Button variant="light" onClick={() => openEdit(gateway)}>
                      Edit
                    </Button>
                    <Button
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
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>Enabled</Table.Th>
                  <Table.Th>Sensors</Table.Th>
                  <Table.Th>Assets</Table.Th>
                  <Table.Th>Last seen</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredGateways.map(gateway => (
                  <Table.Tr key={gateway.id}>
                    <Table.Td fw={600}>{gateway.name}</Table.Td>
                    <Table.Td>{gateway.type}</Table.Td>
                    <Table.Td>{gateway.version ?? "—"}</Table.Td>
                    <Table.Td>{gateway.ipAddress ?? "—"}</Table.Td>
                    <Table.Td>{gateway.enabled ? "Yes" : "No"}</Table.Td>
                    <Table.Td>{gateway.sensorCount}</Table.Td>
                    <Table.Td>{gateway.assetCount}</Table.Td>
                    <Table.Td>{lastSeenLabel(gateway.lastSeenAt)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-sm"
                          variant="light"
                          onClick={() => openEdit(gateway)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="compact-sm"
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
        opened={creating || editingGateway !== null}
        onClose={closeEditor}
        title={editingGateway ? `Edit ${editingGateway.name}` : "Add gateway"}
        centered
      >
        <Stack>
          <TextInput
            label="Name"
            required
            value={form.name}
            onChange={event => setForm({ ...form, name: event.currentTarget.value })}
          />
          <TextInput
            label="Type"
            required
            placeholder="ESP32 BLE, MQTT, ..."
            value={form.type}
            onChange={event => setForm({ ...form, type: event.currentTarget.value })}
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
            <Button variant="default" onClick={closeEditor}>Cancel</Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name.trim() || !form.type.trim()}
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
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
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
