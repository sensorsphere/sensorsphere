import React from "react";

import { NavigationIcon } from "./NavigationIcon";

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
  Textarea,
  Title
} from "@mantine/core";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  getAssets,
  getGateways,
  getLocations,
  getSensors,
  updateAssetLocation,
  updateSensor
} from "./api";

import type {
  Asset,
  Sensor,
  UpdateSensor
} from "./types";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import {
  MetricQualityEditor
} from "./MetricQualityEditor";

import {
  LocationIcon,
  getLocationIconName
} from "./LocationIcon";

import {
  ResetFiltersAction
} from "./ResetFiltersAction";

interface SensorFormState {
  name: string;
  description: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  locationId: string;
  gatewayId: string;
  backupGatewayId: string;
  enabled: boolean;
}

function sensorToForm(
  sensor: Sensor,
  asset: Asset | undefined
): SensorFormState {

  return {
    name:
      sensor.name ?? "",

    description:
      sensor.description ?? "",

    manufacturer:
      sensor.manufacturer ?? "",

    model:
      sensor.model ?? "",

    firmwareVersion:
      sensor.firmwareVersion ?? "",

    locationId:
      asset?.location?.id ?? "",

    gatewayId:
      sensor.gateway?.id ?? "",

    backupGatewayId:
      sensor.backupGateway?.id ?? "",

    enabled:
      sensor.enabled
  };
}

function emptyToNull(
  value: string
): string | null {

  const normalized =
    value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

export function SensorCatalog() {

  const queryClient =
    useQueryClient();

  const [selectedSensor, setSelectedSensor] =
    React.useState<Sensor | null>(
      null
    );

  const [form, setForm] =
    React.useState<SensorFormState | null>(
      null
    );

  const [manufacturerFilter, setManufacturerFilter] =
    usePersistentState<string | null>(
      "sensors.manufacturer",
      null,
      value =>
        value === null ||
        typeof value === "string"
    );

  const [modelFilter, setModelFilter] =
    usePersistentState<string | null>(
      "sensors.model",
      null,
      value =>
        value === null ||
        typeof value === "string"
    );

  const [locationFilter, setLocationFilter] =
    usePersistentState<string | null>(
      "sensors.location",
      null,
      value =>
        value === null ||
        typeof value === "string"
    );

  const [gatewayFilter, setGatewayFilter] =
    usePersistentState<string | null>(
      "sensors.gateway",
      null,
      value =>
        value === null ||
        typeof value === "string"
    );

  const [enabledFilter, setEnabledFilter] =
    usePersistentState<
      "all" | "enabled" | "disabled"
    >(
      "sensors.enabled",
      "all",
      value =>
        value === "all" ||
        value === "enabled" ||
        value === "disabled"
    );

  const [statusFilter, setStatusFilter] =
    usePersistentState<
      "all" | "online" | "warning" | "offline"
    >(
      "sensors.status",
      "all",
      value =>
        value === "all" ||
        value === "online" ||
        value === "warning" ||
        value === "offline"
    );

  const [nameSearch, setNameSearch] =
    usePersistentState<string>(
      "sensors.nameSearch",
      "",
      value =>
        typeof value === "string"
    );

  const [viewMode, setViewMode] =
    usePersistentState<"cards" | "compact">(
      "sensors.viewMode",
      "cards",
      value =>
        value === "cards" ||
        value === "compact"
    );

  const sensorsQuery =
    useQuery({
      queryKey:
        ["sensors"],

      queryFn:
        getSensors,

      refetchInterval:
        30_000
    });

  const assetsQuery =
    useQuery({
      queryKey:
        ["assets"],

      queryFn:
        getAssets,

      refetchInterval:
        30_000
    });

  const locationsQuery =
    useQuery({
      queryKey:
        ["locations"],

      queryFn:
        getLocations,

      refetchInterval:
        30_000
    });

  const gatewaysQuery =
    useQuery({
      queryKey:
        ["gateways"],

      queryFn:
        getGateways,

      refetchInterval:
        30_000
    });

  const updateMutation =
    useMutation({
      mutationFn:
        async ({
          id,
          input,
          assetId,
          locationId
        }: {
          id: string;
          input: UpdateSensor;
          assetId: string | null;
          locationId: string | null;
        }) => {

          const updatedSensor =
            await updateSensor(
              id,
              input
            );

          if (assetId) {
            await updateAssetLocation(
              assetId,
              locationId
            );
          }

          return updatedSensor;
        },

      onSuccess:
        async updatedSensor => {

    queryClient.setQueryData<Asset[]>(
      ["assets"],
      currentAssets =>
        currentAssets?.map(
          asset =>
            asset.sensor?.uid ===
            updatedSensor.uid
              ? {
                  ...asset,
                  sensor: {
                    ...asset.sensor,
                    name:
                      updatedSensor.name
                  }
                }
              : asset
        )
    );

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey:
          ["sensors"]
      }),
      queryClient.invalidateQueries({
        queryKey:
          ["assets"]
      })
    ]);

    setSelectedSensor(
      null
    );

    setForm(
      null
    );
  }
    });

  const openEditor =
    (
      sensor: Sensor
    ): void => {

      setSelectedSensor(
        sensor
      );

      const asset =
        assetsQuery.data?.find(
          currentAsset =>
            currentAsset.sensor?.uid ===
            sensor.uid
        );

      setForm(
        sensorToForm(
          sensor,
          asset
        )
      );
    };

  const save =
    (): void => {

      if (
        !selectedSensor ||
        !form
      ) {
        return;
      }

      const asset =
        assets.find(
          currentAsset =>
            currentAsset.sensor?.uid ===
            selectedSensor.uid
        );

      updateMutation.mutate({
        id:
          selectedSensor.id,

        assetId:
          asset?.id ?? null,

        locationId:
          form.locationId || null,

        input: {
          name:
            emptyToNull(
              form.name
            ),

          description:
            emptyToNull(
              form.description
            ),

          manufacturer:
            emptyToNull(
              form.manufacturer
            ),

          model:
            emptyToNull(
              form.model
            ),

          firmwareVersion:
            emptyToNull(
              form.firmwareVersion
            ),

          gatewayId:
            form.gatewayId || null,

          backupGatewayId:
            form.backupGatewayId || null,

          enabled:
            form.enabled
        }
      });
    };

  React.useEffect(
    () => {
      if (
        !selectedSensor ||
        !form
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

            if (!updateMutation.isPending) {
              save();
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
      selectedSensor,
      form,
      updateMutation.isPending
    ]
  );

  if (
    sensorsQuery.isLoading ||
    assetsQuery.isLoading ||
    locationsQuery.isLoading ||
    gatewaysQuery.isLoading
  ) {
    return (
      <Text>
        Loading sensor catalog...
      </Text>
    );
  }

  if (
    sensorsQuery.isError ||
    assetsQuery.isError ||
    locationsQuery.isError ||
    gatewaysQuery.isError
  ) {
    return (
      <Text c="red">
        Unable to load sensor catalog.
      </Text>
    );
  }

  const sensors =
    sensorsQuery.data ?? [];

  const assets =
    assetsQuery.data ?? [];

  const locations =
    locationsQuery.data ?? [];

  const locationOptions =
    [...locations]
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name,
            undefined,
            { sensitivity: "base" }
          )
      )
      .map(
        location => ({
          value: location.id,
          label: location.name
        })
      );

  const manufacturerOptions =
    Array.from(
      new Set(
        sensors
          .map(sensor => sensor.manufacturer)
          .filter(
            (value): value is string =>
              Boolean(value)
          )
      )
    )
      .sort((a, b) =>
        a.localeCompare(
          b,
          undefined,
          { sensitivity: "base" }
        )
      );

  const modelOptions =
    Array.from(
      new Set(
        sensors
          .map(sensor => sensor.model)
          .filter(
            (value): value is string =>
              Boolean(value)
          )
      )
    )
      .sort((a, b) =>
        a.localeCompare(
          b,
          undefined,
          { sensitivity: "base" }
        )
      );

  const gateways =
    gatewaysQuery.data ?? [];

  const gatewayOptions =
    gateways
      .slice()
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { sensitivity: "base" }
        )
      )
      .map(gateway => ({
        value: gateway.id,
        label: `${gateway.name} · ${gateway.gatewayId} · ${gateway.location?.name ?? "[No location]"}`
      }));

  const gatewayFilterOptions =
    gateways
      .slice()
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { sensitivity: "base" }
        )
      )
      .map(gateway => gateway.name);

  const assetsBySensorUid =
    new Map(
      assets
        .filter(asset => asset.sensor?.uid)
        .map(asset => [
          asset.sensor!.uid,
          asset
        ])
    );

  const normalizedNameSearch =
    nameSearch
      .trim()
      .toLowerCase();

  const filteredSensors =
    [...sensors]
      .filter(sensor => {

        const asset =
          assetsBySensorUid.get(
            sensor.uid
          );

        const status =
          asset?.health.status
          ?? "offline";

        const matchesName =
          normalizedNameSearch.length === 0 ||
          (
            sensor.name
            ?? sensor.uid
          )
            .toLowerCase()
            .includes(
              normalizedNameSearch
            ) ||
          sensor.uid
            .toLowerCase()
            .includes(
              normalizedNameSearch
            );

        return (
          matchesName &&
          (
            manufacturerFilter === null ||
            sensor.manufacturer === manufacturerFilter
          ) &&
          (
            modelFilter === null ||
            sensor.model === modelFilter
          ) &&
          (
            locationFilter === null ||
            asset?.location?.id === locationFilter
          ) &&
          (
            gatewayFilter === null ||
            sensor.gateway?.name === gatewayFilter
          ) &&
          (
            enabledFilter === "all" ||
            (
              enabledFilter === "enabled"
                ? sensor.enabled
                : !sensor.enabled
            )
          ) &&
          (
            statusFilter === "all" ||
            status === statusFilter
          )
        );
      })
      .sort(
        (a, b) =>
          (a.name ?? a.uid)
            .localeCompare(
              b.name ?? b.uid,
              undefined,
              { sensitivity: "base" }
            )
      );

  const filtersActive =
    nameSearch.trim().length > 0 ||
    manufacturerFilter !== null ||
    modelFilter !== null ||
    locationFilter !== null ||
    gatewayFilter !== null ||
    enabledFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters =
    (): void => {
      setNameSearch("");
      setManufacturerFilter(null);
      setModelFilter(null);
      setLocationFilter(null);
      setGatewayFilter(null);
      setEnabledFilter("all");
      setStatusFilter("all");
    };

  return (
    <>
      <Stack gap="md">

        <Group
          justify="space-between"
        >
          <div>
            <Group gap="xs">
                <NavigationIcon page="sensors" size={24} />
                <Title order={2}>
                  Sensors
                </Title>
              </Group>

            <Text c="dimmed">
              Registered SensorSphere devices
            </Text>
          </div>

          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={value =>
                setViewMode(
                  value as "cards" | "compact"
                )
              }
              data={[
                { value: "cards", label: "Card" },
                { value: "compact", label: "Compact" }
              ]}
            />

            <Badge
              variant="light"
            >
              {filteredSensors.length} / {sensors.length} sensors
            </Badge>

            <ResetFiltersAction
              active={filtersActive}
              onReset={clearFilters}
            />
          </Group>
        </Group>

        <SimpleGrid
          cols={{
            base: 1,
            xs: 2,
            md: 4,
            lg: 7
          }}
          spacing="sm"
        >
          <TextInput
            label="Search by name"
            placeholder="Name or UID"
            value={nameSearch}
            onChange={
              event =>
                setNameSearch(
                  event.currentTarget.value
                )
            }
          />

          <Select
            label="Manufacturer"
            clearable
            searchable
            placeholder="All"
            value={manufacturerFilter}
            onChange={setManufacturerFilter}
            data={manufacturerOptions}
          />

          <Select
            label="Model"
            clearable
            searchable
            placeholder="All"
            value={modelFilter}
            onChange={setModelFilter}
            data={modelOptions}
          />

          <Select
            label="Location"
            clearable
            searchable
            placeholder="All"
            value={locationFilter}
            onChange={setLocationFilter}
            data={locationOptions}
          />

          <Select
            label="Gateway"
            clearable
            searchable
            placeholder="All"
            value={gatewayFilter}
            onChange={setGatewayFilter}
            data={gatewayFilterOptions}
          />

          <Select
            label="Enabled"
            value={enabledFilter}
            onChange={value =>
              value &&
              setEnabledFilter(
                value as
                  "all" | "enabled" | "disabled"
              )
            }
            data={[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" }
            ]}
          />

          <Select
            label="Status"
            value={statusFilter}
            onChange={value =>
              value &&
              setStatusFilter(
                value as
                  "all" | "online" | "warning" | "offline"
              )
            }
            data={[
              { value: "all", label: "All" },
              { value: "online", label: "Online" },
              { value: "warning", label: "Warning" },
              { value: "offline", label: "Offline" }
            ]}
          />
        </SimpleGrid>

        {viewMode === "cards" ? (
        <SimpleGrid
          cols={{
            base: 1,
            md: 2
          }}
        >

          {filteredSensors.map(
            sensor => {

              const asset =
                assetsBySensorUid.get(
                  sensor.uid
                );

              return (
              <Card
                key={sensor.id}
                withBorder
                radius="md"
                padding="lg"
              >

                <Stack gap="sm">

                  <Group
                    justify="space-between"
                    align="flex-start"
                  >

                    <div>
                      <Text
                        fw={700}
                        size="lg"
                      >
                        {
                          sensor.name
                          ?? sensor.uid
                        }
                      </Text>

                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        {sensor.uid}
                      </Text>
                    </div>

                    <Badge
                      color={
                        asset?.health.status ===
                        "online"
                          ? "green"
                          : asset?.health.status ===
                            "warning"
                            ? "yellow"
                            : "red"
                      }
                    >
                      {
                        asset?.health.status ===
                        "online"
                          ? "Online"
                          : asset?.health.status ===
                            "warning"
                            ? "Warning"
                            : "Offline"
                      }
                    </Badge>

                  </Group>

                  <SimpleGrid
                    cols={2}
                    spacing="xs"
                  >

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Manufacturer
                      </Text>

                      <Text size="sm">
                        {
                          sensor.manufacturer
                          ?? "—"
                        }
                      </Text>
                    </div>

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Model
                      </Text>

                      <Text size="sm">
                        {
                          sensor.model
                          ?? "—"
                        }
                      </Text>
                    </div>

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Location
                      </Text>

                      <Group gap={4}>
                        <LocationIcon
                          name={
                            getLocationIconName(
                              asset?.location
                            )
                          }
                          size={21}
                        />

                        <Text size="sm">
                          {
                            asset?.location?.name
                            ?? "—"
                          }
                        </Text>
                      </Group>
                    </div>

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Gateway
                      </Text>

                      <Text size="sm">
                        {
                          sensor.gateway?.name
                          ?? "—"
                        }
                      </Text>
                    </div>

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Measurements today
                      </Text>

                      <Text size="sm">
                        {
                          sensor.measurementsToday
                        }
                      </Text>
                    </div>

                    <div>
                      <Text
                        size="xs"
                        c="dimmed"
                      >
                        Enabled
                      </Text>

                      <Text size="sm">
                        {
                          sensor.enabled
                            ? "Yes"
                            : "No"
                        }
                      </Text>
                    </div>

                  </SimpleGrid>

                  <Group
                    justify="flex-end"
                  >
                    <Button
                      variant="light"
                      onClick={
                        () =>
                          openEditor(
                            sensor
                          )
                      }
                    >
                      Edit
                    </Button>
                  </Group>

                </Stack>

              </Card>

              );
            }
          )}

        </SimpleGrid>
        ) : (
          <Table.ScrollContainer minWidth={980}>
            <Table
              striped
              highlightOnHover
              verticalSpacing="xs"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>UID</Table.Th>
                  <Table.Th>Manufacturer</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Gateway</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Enabled</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredSensors.map(sensor => {
                  const asset =
                    assetsBySensorUid.get(sensor.uid);
                  const status =
                    asset?.health.status ?? "offline";

                  return (
                    <Table.Tr key={sensor.id}>
                      <Table.Td fw={600}>
                        {sensor.name ?? sensor.uid}
                      </Table.Td>
                      <Table.Td>{sensor.uid}</Table.Td>
                      <Table.Td>{sensor.manufacturer ?? "—"}</Table.Td>
                      <Table.Td>{sensor.model ?? "—"}</Table.Td>
                      <Table.Td>{asset?.location?.name ?? "—"}</Table.Td>
                      <Table.Td>{sensor.gateway?.name ?? "—"}</Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={
                            status === "online"
                              ? "green"
                              : status === "warning"
                                ? "yellow"
                                : "red"
                          }
                        >
                          {status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{sensor.enabled ? "Yes" : "No"}</Table.Td>
                      <Table.Td>
                        <Button
                          size="compact-sm"
                          variant="light"
                          onClick={() => openEditor(sensor)}
                        >
                          Edit
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

      </Stack>

      <Modal
        opened={
          selectedSensor
          !== null
        }

        onClose={
          () => {
            setSelectedSensor(
              null
            );

            setForm(
              null
            );
          }
        }

        title={
          selectedSensor
            ? `Edit ${selectedSensor.name ?? selectedSensor.uid}`
            : "Edit sensor"
        }

        centered
        size="xl"
      >

        {form && (

          <Stack>

            <TextInput
              label="Name"
              value={form.name}
              onChange={
                event =>
                  setForm({
                    ...form,
                    name:
                      event.currentTarget.value
                  })
              }
            />

            <Textarea
              label="Description"
              value={form.description}
              minRows={3}
              onChange={
                event =>
                  setForm({
                    ...form,
                    description:
                      event.currentTarget.value
                  })
              }
            />

            <TextInput
              label="Manufacturer"
              value={form.manufacturer}
              onChange={
                event =>
                  setForm({
                    ...form,
                    manufacturer:
                      event.currentTarget.value
                  })
              }
            />

            <TextInput
              label="Model"
              value={form.model}
              onChange={
                event =>
                  setForm({
                    ...form,
                    model:
                      event.currentTarget.value
                  })
              }
            />

            <TextInput
              label="Firmware version"
              value={form.firmwareVersion}
              onChange={
                event =>
                  setForm({
                    ...form,
                    firmwareVersion:
                      event.currentTarget.value
                  })
              }
            />

            <Select
              label="Location"
              searchable
              clearable
              placeholder="Unassigned"
              value={
                form.locationId || null
              }
              data={locationOptions}
              onChange={
                value =>
                  setForm({
                    ...form,
                    locationId:
                      value ?? ""
                  })
              }
            />

            <Select
              label="Primary gateway"
              searchable
              clearable
              placeholder="Unassigned"
              value={
                form.gatewayId || null
              }
              data={gatewayOptions.filter(option =>
                option.value !== form.backupGatewayId
              )}
              onChange={
                value =>
                  setForm({
                    ...form,
                    gatewayId:
                      value ?? ""
                  })
              }
            />

            <Select
              label="Backup gateway"
              searchable
              clearable
              placeholder="No backup"
              value={
                form.backupGatewayId || null
              }
              data={gatewayOptions.filter(option =>
                option.value !== form.gatewayId
              )}
              onChange={
                value =>
                  setForm({
                    ...form,
                    backupGatewayId:
                      value ?? ""
                  })
              }
            />

            <Checkbox
              label="Enabled"
              checked={form.enabled}
              onChange={
                event =>
                  setForm({
                    ...form,
                    enabled:
                      event.currentTarget.checked
                  })
              }
            />

            <MetricQualityEditor
              asset={
                assets.find(
                  asset =>
                    asset.sensor?.uid ===
                    selectedSensor?.uid
                )
              }
            />

            {updateMutation.isError && (
              <Text c="red">
                {
                  updateMutation.error
                    instanceof Error
                    ? updateMutation.error.message
                    : "Unable to update sensor."
                }
              </Text>
            )}

            <Group
              justify="flex-end"
            >

              <Button
                variant="default"
                onClick={
                  () => {
                    setSelectedSensor(
                      null
                    );

                    setForm(
                      null
                    );
                  }
                }
              >
                Cancel
              </Button>

              <Button
                loading={
                  updateMutation.isPending
                }
                onClick={save}
              >
                Save
              </Button>

            </Group>

          </Stack>

        )}

      </Modal>
    </>
  );
}
