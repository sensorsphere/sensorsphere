import React from "react";

import { activeFilterStyles } from "./filterStyles";
import { BadgeSelect } from "./BadgeSelect";

import { NavigationIcon } from "./NavigationIcon";

import {
  ActionIcon,
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
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";

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

  const [showBlacklistedOnly, setShowBlacklistedOnly] =
    usePersistentState<boolean>(
      "sensors.showBlacklistedOnly",
      false,
      value => typeof value === "boolean"
    );

  const [nameSearch, setNameSearch] =
    usePersistentState<string>(
      "sensors.nameSearch",
      "",
      value =>
        typeof value === "string"
    );

  const [tableSortKey, setTableSortKey] =
    usePersistentState<string>("sensors.tableSortKey", "name");
  const [tableSortDirection, setTableSortDirection] =
    usePersistentState<SortDirection>("sensors.tableSortDirection", "asc");

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

  const [blacklistTarget, setBlacklistTarget] =
    React.useState<Sensor | null>(null);

  const blacklistMutation =
    useMutation({
      mutationFn: async ({
        sensor,
        blacklisted
      }: {
        sensor: Sensor;
        blacklisted: boolean;
      }) =>
        updateSensor(
          sensor.id,
          { blacklisted }
        ),

      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["sensors"]
        });
        setBlacklistTarget(null);
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

  React.useEffect(
    () => {
      const sensorId =
        window.sessionStorage.getItem(
          "dashboard.edit.sensor"
        );

      if (!sensorId) {
        return;
      }

      const sensor =
        sensorsQuery.data?.find(
          current =>
            current.id === sensorId
        );

      if (!sensor) {
        return;
      }

      window.sessionStorage.removeItem(
        "dashboard.edit.sensor"
      );

      openEditor(
        sensor
      );
    },
    [
      sensorsQuery.data,
      assetsQuery.data
    ]
  );

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

  const locationsById =
    new Map(
      locations.map(
        location => [
          location.id,
          location
        ]
      )
    );

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

  const sensorStatusCounts = sensors
    .filter(sensor => !sensor.blacklisted)
    .reduce(
    (counts, sensor) => {
      const status =
        assetsBySensorUid.get(sensor.uid)?.health.status ?? "offline";

      counts[status] += 1;
      return counts;
    },
    { online: 0, warning: 0, offline: 0 }
  );

  const filteredSensors =
    [...sensors]
      .filter(sensor => {

        if (showBlacklistedOnly ? !sensor.blacklisted : sensor.blacklisted) {
          return false;
        }

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

  const sortedTableSensors = [...filteredSensors].sort((left, right) => {
    const leftAsset = assetsBySensorUid.get(left.uid);
    const rightAsset = assetsBySensorUid.get(right.uid);
    const value = (sensor: Sensor, asset: Asset | undefined) => {
      switch (tableSortKey) {
        case "uid": return sensor.uid;
        case "manufacturer": return sensor.manufacturer;
        case "model": return sensor.model;
        case "location": return asset?.location?.name;
        case "gateway": return sensor.gateway?.name;
        case "status": return asset?.health.status ?? "offline";
        case "enabled": return sensor.enabled;
        case "blacklisted": return sensor.blacklisted;
        default: return sensor.name ?? sensor.uid;
      }
    };
    return compareTableValues(value(left, leftAsset), value(right, rightAsset), tableSortDirection);
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
    manufacturerFilter !== null ||
    modelFilter !== null ||
    locationFilter !== null ||
    gatewayFilter !== null ||
    enabledFilter !== "all" ||
    statusFilter !== "all" ||
    showBlacklistedOnly;

  const clearFilters =
    (): void => {
      setNameSearch("");
      setManufacturerFilter(null);
      setModelFilter(null);
      setLocationFilter(null);
      setGatewayFilter(null);
      setEnabledFilter("all");
      setStatusFilter("all");
      setShowBlacklistedOnly(false);
    };

  return (
    <>
      <Stack gap="md">

        <div className="page-sticky-controls page-sticky-controls-gap-md">
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
            <Badge color="green" variant="light">
              {sensorStatusCounts.online} Online
            </Badge>
            <Badge color="yellow" variant="light">
              {sensorStatusCounts.warning} Warning
            </Badge>
            <Badge color="red" variant="light">
              {sensorStatusCounts.offline} Offline
            </Badge>
            <Badge variant="light">
              {filteredSensors.length} / {sensors.length} sensors
            </Badge>

            <SegmentedControl
              value={viewMode}
              onChange={value =>
                setViewMode(
                  value as "cards" | "compact"
                )
              }
              data={[
                { value: "cards", label: "Cards" },
                { value: "compact", label: "Compact" }
              ]}
            />
          </Group>
        </Group>

        <SimpleGrid
          cols={{
            base: 1,
            xs: 2,
            md: 4,
            lg: 8
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
            rightSectionPointerEvents="all"
            rightSection={
              nameSearch.trim().length > 0
                ? (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label="Clear name filter"
                    title="Clear name filter"
                    onClick={() => setNameSearch("")}
                  >
                    ×
                  </ActionIcon>
                )
                : null
            }
            styles={activeFilterStyles(nameSearch.trim().length > 0)}
          />

          <Select
            label="Manufacturer"
            clearable
            searchable
            placeholder="All"
            value={manufacturerFilter}
            onChange={setManufacturerFilter}
            data={manufacturerOptions}
            styles={activeFilterStyles(manufacturerFilter !== null)}
          />

          <Select
            label="Model"
            clearable
            searchable
            placeholder="All"
            value={modelFilter}
            onChange={setModelFilter}
            data={modelOptions}
            styles={activeFilterStyles(modelFilter !== null)}
          />

          <Select
            label="Location"
            clearable
            searchable
            placeholder="All"
            value={locationFilter}
            onChange={setLocationFilter}
            data={locationOptions}
            styles={activeFilterStyles(locationFilter !== null)}
          />

          <Select
            label="Gateway"
            clearable
            searchable
            placeholder="All"
            value={gatewayFilter}
            onChange={setGatewayFilter}
            data={gatewayFilterOptions}
            styles={activeFilterStyles(gatewayFilter !== null)}
          />

          <BadgeSelect
            badgeColor={value => value === "enabled" ? "blue" : value === "disabled" ? "orange" : "gray"}
            label="Enabled"
            clearable
            value={enabledFilter}
            onChange={value =>
              setEnabledFilter(
                (value ?? "all") as
                  "all" | "enabled" | "disabled"
              )
            }
            data={[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" }
            ]}
            styles={activeFilterStyles(enabledFilter !== "all")}
          />

          <BadgeSelect
            badgeColor={value => value === "online" ? "green" : value === "warning" ? "yellow" : value === "offline" ? "red" : "gray"}
            label="Status"
            clearable
            value={statusFilter}
            onChange={value =>
              setStatusFilter(
                (value ?? "all") as
                  "all" | "online" | "warning" | "offline"
              )
            }
            data={[
              { value: "all", label: "All" },
              { value: "online", label: "Online" },
              { value: "warning", label: "Warning" },
              { value: "offline", label: "Offline" }
            ]}
            styles={activeFilterStyles(statusFilter !== "all")}
          />

          <Checkbox
            label="Show blacklisted only"
            checked={showBlacklistedOnly}
            onChange={event =>
              setShowBlacklistedOnly(event.currentTarget.checked)
            }
            styles={activeFilterStyles(showBlacklistedOnly)}
            mt="xl"
          />

          <Group align="flex-end" h="100%">
            <ResetFiltersAction
              active={filtersActive}
              onReset={clearFilters}
            />
          </Group>
        </SimpleGrid>
        </div>

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
                      variant="light"
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
                      size="xs"
                      variant="default"
                      onClick={
                        () =>
                          openEditor(
                            sensor
                          )
                      }
                    >
                      Edit
                    </Button>
                    {sensor.blacklisted ? (
                      <Button
                        color="green"
                        variant="light"
                        onClick={() =>
                          blacklistMutation.mutate({ sensor, blacklisted: false })
                        }
                      >
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        color="red"
                        variant="light"
                        onClick={() => setBlacklistTarget(sensor)}
                      >
                        Blacklist
                      </Button>
                    )}
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
                  {[["name", "Name"], ["uid", "UID"], ["manufacturer", "Manufacturer"], ["model", "Model"], ["location", "Location"], ["gateway", "Gateway"], ["status", "Status"], ["enabled", "Enabled"]].map(([key, label]) => (
                    <SortableTableHeader
                      key={key}
                      active={tableSortKey === key}
                      direction={tableSortDirection}
                      onClick={() => toggleTableSort(key)}
                    >
                      {label}
                    </SortableTableHeader>
                  ))}
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedTableSensors.map(sensor => {
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
                      <Table.Td>
                        {asset?.location ? (
                          <Group gap={5} wrap="nowrap">
                            <LocationIcon
                              name={getLocationIconName(asset.location)}
                              size={16}
                            />
                            <Text size="sm">{asset.location.name}</Text>
                          </Group>
                        ) : "—"}
                      </Table.Td>
                      <Table.Td>{sensor.gateway?.name ?? "—"}</Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          variant="light"
                          color={
                            sensor.blacklisted
                              ? "gray"
                              : status === "online"
                              ? "green"
                              : status === "warning"
                                ? "yellow"
                                : "red"
                          }
                        >
                          {sensor.blacklisted ? "blacklisted" : status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={sensor.enabled ? "blue" : "orange"}
                          variant="light"
                        >
                          {sensor.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={() => openEditor(sensor)}
                        >
                          Edit
                        </Button>
                          {sensor.blacklisted ? (
                            <Button
                              size="compact-sm"
                              color="green"
                              variant="light"
                              onClick={() =>
                                blacklistMutation.mutate({ sensor, blacklisted: false })
                              }
                            >
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="compact-sm"
                              color="red"
                              variant="light"
                              onClick={() => setBlacklistTarget(sensor)}
                            >
                              Blacklist
                            </Button>
                          )}
                        </Group>
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
              leftSection={
                form.locationId ? (
                  <LocationIcon
                    name={getLocationIconName(locationsById.get(form.locationId))}
                    size={17}
                  />
                ) : undefined
              }
              renderOption={({ option }) => (
                <Group gap="xs" wrap="nowrap">
                  <LocationIcon
                    name={getLocationIconName(locationsById.get(option.value))}
                    size={17}
                  />
                  <Text size="sm">{option.label}</Text>
                </Group>
              )}
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
              leftSection={(() => {
                const gateway = gateways.find(current => current.id === form.gatewayId);
                return gateway?.location ? (
                  <LocationIcon
                    name={getLocationIconName(locationsById.get(gateway.location.id))}
                    size={17}
                  />
                ) : undefined;
              })()}
              renderOption={({ option }) => {
                const gateway = gateways.find(current => current.id === option.value);
                return (
                  <Group gap="xs" wrap="nowrap">
                    {gateway?.location && (
                      <LocationIcon
                        name={getLocationIconName(locationsById.get(gateway.location.id))}
                        size={17}
                      />
                    )}
                    <Text size="sm">{option.label}</Text>
                  </Group>
                );
              }}
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
              leftSection={(() => {
                const gateway = gateways.find(current => current.id === form.backupGatewayId);
                return gateway?.location ? (
                  <LocationIcon
                    name={getLocationIconName(locationsById.get(gateway.location.id))}
                    size={17}
                  />
                ) : undefined;
              })()}
              renderOption={({ option }) => {
                const gateway = gateways.find(current => current.id === option.value);
                return (
                  <Group gap="xs" wrap="nowrap">
                    {gateway?.location && (
                      <LocationIcon
                        name={getLocationIconName(locationsById.get(gateway.location.id))}
                        size={17}
                      />
                    )}
                    <Text size="sm">{option.label}</Text>
                  </Group>
                );
              }}
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

      <Modal
        opened={blacklistTarget !== null}
        onClose={() => setBlacklistTarget(null)}
        title="Blacklist sensor"
        centered
      >
        <Stack>
          <Text>
            Blacklist {blacklistTarget?.name ?? blacklistTarget?.uid}? Incoming data and metadata from this sensor will be ignored until it is reactivated.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setBlacklistTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={blacklistMutation.isPending}
              onClick={() =>
                blacklistTarget && blacklistMutation.mutate({
                  sensor: blacklistTarget,
                  blacklisted: true
                })
              }
            >
              Blacklist
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
