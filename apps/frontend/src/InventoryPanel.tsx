import React from "react";

import { activeFilterStyles } from "./filterStyles";

import { NavigationIcon } from "./NavigationIcon";

import {
  Badge,
  Button,
  Card,
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
  createLocation,
  deleteLocation,
  getAssets,
  getLocations,
  getSensors,
  moveLocation,
  updateAssetLocation,
  updateLocation
} from "./api";

import type {
  Asset,
  CreateLocationInput,
  Sensor,
  Location,
  LocationType,
  UpdateLocationInput
} from "./types";

import {
  LOCATION_ICON_OPTIONS,
  LocationIcon,
  getLocationIconName,
  type LocationIconName
} from "./LocationIcon";

import {
  ResetFiltersAction
} from "./ResetFiltersAction";

interface LocationNodeProps {
  location: Location;
  allLocations: Location[];
  assets: Asset[];
  sensorsByUid: Map<string, Sensor>;
  onDropAsset:
    (
      assetId: string,
      locationId: string
    ) => void;

  onEditLocation:
    (
      location: Location
    ) => void;
}

function assetIsEnabled(
  asset: Asset,
  sensorsByUid: Map<string, Sensor>
): boolean {

  return asset.sensor
    ? sensorsByUid.get(
        asset.sensor.uid
      )?.enabled ?? asset.enabled
    : asset.enabled;
}

function LocationNode({
  location,
  allLocations,
  assets,
  sensorsByUid,
  onDropAsset,
  onEditLocation
}: LocationNodeProps) {

  const [
    isDragOver,
    setIsDragOver
  ] =
    React.useState(false);

  const children =
    allLocations.filter(
      child =>
        child.parentId ===
        location.id
    );

  const locationAssets =
    assets.filter(
      asset =>
        asset.location?.id ===
        location.id
    );

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      style={{
        background:
          isDragOver
            ? "var(--ss-active-bg)"
            : "var(--ss-card-bg)",
        borderColor:
          isDragOver
            ? "var(--ss-accent)"
            : "var(--ss-border)",
        transition:
          "background-color 120ms ease, border-color 120ms ease"
      }}
      onDragEnter={
        event => {

          event.preventDefault();
          event.stopPropagation();

          setIsDragOver(
            true
          );
        }
      }
      onDragOver={
        event => {

          event.preventDefault();
          event.stopPropagation();

          event.dataTransfer.dropEffect =
            "move";
        }
      }
      onDragLeave={
        event => {

          event.stopPropagation();

          const nextTarget =
            event.relatedTarget;

          if (
            nextTarget instanceof Node &&
            event.currentTarget.contains(
              nextTarget
            )
          ) {
            return;
          }

          setIsDragOver(
            false
          );
        }
      }
      onDrop={
        event => {

          event.preventDefault();
          event.stopPropagation();

          setIsDragOver(
            false
          );

          const assetId =
            event.dataTransfer
              .getData(
                "text/sensorsphere-asset-id"
              );

          if (assetId) {
            onDropAsset(
              assetId,
              location.id
            );
          }
        }
      }
    >
      <Stack gap="sm">

        <Group
          justify="space-between"
        >
          <div>
            <Group gap="xs">
              <LocationIcon
                name={
                  getLocationIconName(
                    location
                  )
                }
                size={20}
              />

              <Text fw={700}>
                {location.name}
              </Text>
            </Group>

            <Group gap="xs">
              <Badge
                size="xs"
                variant="light"
                color="blue"
              >
                Location
              </Badge>

              <Text
                size="xs"
                c="dimmed"
              >
                {location.type}
              </Text>
            </Group>
          </div>

          <Group gap="xs">
            <Badge variant="light">
              {locationAssets.length} assets
            </Badge>

            <Button
              size="compact-xs"
              variant="subtle"
              onClick={
                event => {

                  event.stopPropagation();

                  onEditLocation(
                    location
                  );
                }
              }
            >
              Edit
            </Button>
          </Group>
        </Group>

        {locationAssets.map(
          asset => (
            <Card
              key={asset.id}
              withBorder
              padding="xs"
              style={{
                background:
                  "var(--ss-card-bg)",
                borderColor:
                  "var(--ss-border)",
                cursor:
                  "grab"
              }}
              draggable
              onDragStart={
                event => {

                  event.dataTransfer
                    .setData(
                      "text/sensorsphere-asset-id",
                      asset.id
                    );
                }
              }
            >
              <Group
                justify="space-between"
                gap="xs"
              >
                <Text
                  size="sm"
                  fw={600}
                >
                  {
                    asset.sensor?.name
                    ?? asset.name
                    ?? asset.externalId
                  }
                </Text>

                <Group gap={4}>
                  <Badge
                    size="xs"
                    variant="light"
                    color={
                      asset.health.status ===
                        "online"
                        ? "green"
                        : asset.health.status ===
                            "warning"
                          ? "yellow"
                          : "red"
                    }
                  >
                    {asset.health.status}
                  </Badge>

                  <Badge
                    size="xs"
                    variant="light"
                    color={
                      assetIsEnabled(
                        asset,
                        sensorsByUid
                      )
                        ? "green"
                        : "orange"
                    }
                  >
                    {
                      assetIsEnabled(
                        asset,
                        sensorsByUid
                      )
                        ? "Enabled"
                        : "Disabled"
                    }
                  </Badge>
                </Group>
              </Group>

              <Text
                size="xs"
                c="dimmed"
              >
                {asset.externalId}
              </Text>
            </Card>
          )
        )}

        {children.length > 0 && (
          <Stack
            gap="sm"
            pl="md"
          >
            {children.map(
              child => (
                <LocationNode
                  key={child.id}
                  location={child}
                  allLocations={
                    allLocations
                  }
                  assets={assets}
                  sensorsByUid={
                    sensorsByUid
                  }
                  onDropAsset={
                    onDropAsset
                  }
                  onEditLocation={
                    onEditLocation
                  }
                />
              )
            )}
          </Stack>
        )}

      </Stack>
    </Card>
  );
}

interface LocationFormState {
  id: string | null;
  parentId: string | null;
  type: LocationType;
  name: string;
  description: string;
  icon: LocationIconName | null;
}

const emptyLocationForm:
LocationFormState = {
  id: null,
  parentId: null,
  type: "ROOM",
  name: "",
  description: "",
  icon: null
};

export function InventoryPanel() {

  const queryClient =
    useQueryClient();

  const [
    locationForm,
    setLocationForm
  ] =
    React.useState<LocationFormState | null>(
      null
    );

  const [
    search,
    setSearch
  ] =
    React.useState("");

  const [
    inventoryView,
    setInventoryView
  ] =
    React.useState<
      "tree" | "table"
    >("tree");

  const [
    locationFilter,
    setLocationFilter
  ] =
    React.useState<string | null>(
      null
    );

  const [
    statusFilter,
    setStatusFilter
  ] =
    React.useState<string | null>(
      null
    );

  const [
    protocolFilter,
    setProtocolFilter
  ] =
    React.useState<string | null>(
      null
    );

  const [
    sortBy,
    setSortBy
  ] =
    React.useState(
      "name"
    );

  const assetsQuery =
    useQuery({
      queryKey:
        ["assets"],

      queryFn:
        getAssets
    });

  const locationsQuery =
    useQuery({
      queryKey:
        ["locations"],

      queryFn:
        getLocations
    });

  const sensorsQuery =
    useQuery({
      queryKey:
        ["sensors"],

      queryFn:
        getSensors
    });

  const moveAssetMutation =
    useMutation({
      mutationFn:
        ({
          assetId,
          locationId
        }: {
          assetId: string;
          locationId: string | null;
        }) =>
          updateAssetLocation(
            assetId,
            locationId
          ),

      onSuccess:
        async () => {

          await Promise.all([
            queryClient
              .invalidateQueries({
                queryKey:
                  ["assets"]
              }),

            queryClient
              .invalidateQueries({
                queryKey:
                  ["latest-observations"]
              })
          ]);
        }
    });

  const saveLocationMutation =
    useMutation({
      mutationFn:
        async (
          form: LocationFormState
        ) => {

          if (form.id) {

            const currentLocation =
              locationsQuery.data
                ?.find(
                  location =>
                    location.id ===
                    form.id
                );

            const metadata = {
              ...(currentLocation?.metadata ?? {})
            };

            if (form.icon) {
              metadata.icon =
                form.icon;
            } else {
              delete metadata.icon;
            }

            const updateInput:
              UpdateLocationInput = {
                type:
                  form.type,
                name:
                  form.name.trim(),
                description:
                  form.description.trim()
                    || null,
                metadata
              };

            const updated =
              await updateLocation(
                form.id,
                updateInput
              );

            if (
              currentLocation &&
              currentLocation.parentId !==
              form.parentId
            ) {
              return moveLocation(
                form.id,
                {
                  parentId:
                    form.parentId
                }
              );
            }

            return updated;
          }

          const createInput:
            CreateLocationInput = {
              parentId:
                form.parentId,
              type:
                form.type,
              name:
                form.name.trim(),
              description:
                form.description.trim()
                  || null,
              metadata:
                form.icon
                  ? { icon: form.icon }
                  : {}
            };

          return createLocation(
            createInput
          );
        },

      onSuccess:
        async () => {

          await queryClient
            .invalidateQueries({
              queryKey:
                ["locations"]
            });

          setLocationForm(
            null
          );
        }
    });

  React.useEffect(
    () => {
      if (!locationForm) {
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
              locationForm.name.trim().length > 0 &&
              locationForm.type.trim().length > 0;

            if (
              canSave &&
              !saveLocationMutation.isPending
            ) {
              saveLocationMutation.mutate(
                locationForm
              );
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
      locationForm,
      saveLocationMutation.isPending
    ]
  );

  const deleteLocationMutation =
    useMutation({
      mutationFn:
        deleteLocation,

      onSuccess:
        async () => {

          await queryClient
            .invalidateQueries({
              queryKey:
                ["locations"]
            });

          setLocationForm(
            null
          );
        }
    });

  if (
    assetsQuery.isLoading ||
    locationsQuery.isLoading ||
    sensorsQuery.isLoading
  ) {
    return (
      <Text>
        Loading inventory...
      </Text>
    );
  }

  if (
    assetsQuery.isError ||
    locationsQuery.isError ||
    sensorsQuery.isError
  ) {
    return (
      <Text c="red">
        Unable to load inventory.
      </Text>
    );
  }

  const assets =
    assetsQuery.data ?? [];

  const locations =
    locationsQuery.data ?? [];

  const sensors =
    sensorsQuery.data ?? [];

  const sensorsByUid =
    new Map<string, Sensor>(
      sensors.map(sensor => [
        sensor.uid,
        sensor
      ])
    );

  const normalizedSearch =
    search
      .trim()
      .toLowerCase();

  const matchesAsset =
    (
      asset: Asset
    ): boolean => {

      if (!normalizedSearch) {
        return true;
      }

      const values = [
        asset.sensor?.name,
        asset.sensor?.uid,
        asset.name,
        asset.externalId,
        asset.location?.name,
        asset.assetType,
        asset.protocol
      ];

      return values.some(
        value =>
          value
            ?.toLowerCase()
            .includes(
              normalizedSearch
            )
      );
    };

  const protocolOptions =
    Array.from(
      new Set(
        assets
          .map(
            asset =>
              asset.protocol
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      )
    )
      .sort()
      .map(
        value => ({
          value,
          label: value
        })
      );

  const filteredAssets =
    assets
      .filter(
        matchesAsset
      )
      .filter(
        asset =>
          !locationFilter ||
          (
            locationFilter ===
            "__unassigned__"
              ? asset.location === null
              : asset.location?.id ===
                locationFilter
          )
      )
      .filter(
        asset =>
          !statusFilter ||
          (
            statusFilter ===
            "enabled"
              ? assetIsEnabled(asset, sensorsByUid)
              : !assetIsEnabled(asset, sensorsByUid)
          )
      )
      .filter(
        asset =>
          !protocolFilter ||
          asset.protocol ===
          protocolFilter
      )
      .sort(
        (left, right) => {

          const leftName =
            left.sensor?.name
            ?? left.name
            ?? left.externalId;

          const rightName =
            right.sensor?.name
            ?? right.name
            ?? right.externalId;

          if (
            sortBy ===
            "location"
          ) {
            return (
              left.location?.name
              ?? "Unassigned"
            ).localeCompare(
              right.location?.name
              ?? "Unassigned"
            );
          }

          if (
            sortBy ===
            "type"
          ) {
            return left.assetType
              .localeCompare(
                right.assetType
              );
          }

          return leftName
            .localeCompare(
              rightName
            );
        }
      );

  const rootLocations =
    locations.filter(
      location =>
        location.parentId === null
    );

  const unassignedAssets =
    filteredAssets.filter(
      asset =>
        asset.location === null
    );

  return (
    <>
      <Stack gap="md">

      <Group
        justify="space-between"
      >
        <div>
          <Group gap="xs">
              <NavigationIcon page="inventory" size={24} />
              <Title order={2}>
                Inventory
              </Title>
            </Group>

          <Text c="dimmed">
            Drag assets onto locations to organize your environment.
          </Text>
        </div>

        <Group gap="sm">
          <Badge variant="light">
            {
              filteredAssets.length ===
              assets.length
                ? `${assets.length} assets`
                : `${filteredAssets.length} / ${assets.length} assets`
            }
          </Badge>

          <Button
            onClick={
              () =>
                setLocationForm({
                  ...emptyLocationForm
                })
            }
          >
            Add location
          </Button>
        </Group>
      </Group>

      <Stack gap="sm">

        <Group
          align="flex-end"
          grow
        >
          <TextInput
            label="Search"
            placeholder="Asset, sensor UID, location..."
            value={search}
            onChange={
              event =>
                setSearch(
                  event.currentTarget.value
                )
            }
            styles={activeFilterStyles(search.trim().length > 0)}
          />

          <Select
            label="Location"
            placeholder="All locations"
            clearable
            searchable
            value={locationFilter}
            onChange={
              setLocationFilter
            }
            data={[
              {
                value:
                  "__unassigned__",
                label:
                  "Unassigned"
              },
              ...locations.map(
                location => ({
                  value:
                    location.id,
                  label:
                    location.name
                })
              )
            ]}
            styles={activeFilterStyles(locationFilter !== null)}
          />

          <Select
            label="Status"
            placeholder="All statuses"
            clearable
            value={statusFilter}
            onChange={
              setStatusFilter
            }
            data={[
              {
                value: "enabled",
                label: "Enabled"
              },
              {
                value: "disabled",
                label: "Disabled"
              }
            ]}
            styles={activeFilterStyles(statusFilter !== null)}
          />

          <Select
            label="Protocol"
            placeholder="All protocols"
            clearable
            value={protocolFilter}
            onChange={
              setProtocolFilter
            }
            data={
              protocolOptions
            }
            styles={activeFilterStyles(protocolFilter !== null)}
          />
        </Group>

        <Group
          justify="space-between"
          align="flex-end"
        >
          <Select
            label="Sort by"
            value={sortBy}
            onChange={
              value =>
                setSortBy(
                  value
                  ?? "name"
                )
            }
            data={[
              {
                value: "name",
                label: "Name"
              },
              {
                value: "location",
                label: "Location"
              },
              {
                value: "type",
                label: "Type"
              }
            ]}
            w={220}
          />


          <ResetFiltersAction
            active={
              search.trim().length > 0 ||
              locationFilter !== null ||
              statusFilter !== null ||
              protocolFilter !== null
            }
            onReset={
              () => {
                setSearch("");
                setLocationFilter(null);
                setStatusFilter(null);
                setProtocolFilter(null);
              }
            }
          />
          <SegmentedControl
            value={inventoryView}
            onChange={
              value =>
                setInventoryView(
                  value as
                    "tree" | "table"
                )
            }
            data={[
              {
                label: "Tree",
                value: "tree"
              },
              {
                label: "Table",
                value: "table"
              }
            ]}
          />
        </Group>

      </Stack>

      {unassignedAssets.length > 0 && (
        <Card
          withBorder
          radius="md"
          padding="md"
          style={{
            background:
              "var(--ss-card-bg)",
            borderColor:
              "var(--ss-border)"
          }}
        >
          <Stack gap="sm">

            <Text fw={700}>
              Unassigned assets
            </Text>

            <SimpleGrid
              cols={{
                base: 1,
                sm: 2,
                md: 3
              }}
            >
              {unassignedAssets.map(
                asset => (
                  <Card
                    key={asset.id}
                    withBorder
                    padding="xs"
                    style={{
                      background:
                        "var(--ss-card-bg)",
                      borderColor:
                        "var(--ss-border)",
                      cursor:
                        "grab"
                    }}
                    draggable
                    onDragStart={
                      event => {

                        event.dataTransfer
                          .setData(
                            "text/sensorsphere-asset-id",
                            asset.id
                          );
                      }
                    }
                  >
                    <Group
                      justify="space-between"
                      gap="xs"
                    >
                      <Text
                        size="sm"
                        fw={600}
                      >
                        {
                          asset.sensor?.name
                          ?? asset.name
                          ?? asset.externalId
                        }
                      </Text>

                      <Group gap={4}>
                        <Badge
                          size="xs"
                          variant="light"
                          color={
                            asset.health.status ===
                              "online"
                              ? "green"
                              : asset.health.status ===
                                  "warning"
                                ? "yellow"
                                : "red"
                          }
                        >
                          {asset.health.status}
                        </Badge>

                        <Badge
                          size="xs"
                          variant="light"
                          color={
                            assetIsEnabled(
                              asset,
                              sensorsByUid
                            )
                              ? "green"
                              : "orange"
                          }
                        >
                          {
                            assetIsEnabled(
                              asset,
                              sensorsByUid
                            )
                              ? "Enabled"
                              : "Disabled"
                          }
                        </Badge>
                      </Group>
                    </Group>

                    <Text
                      size="xs"
                      c="dimmed"
                    >
                      {asset.externalId}
                    </Text>
                  </Card>
                )
              )}
            </SimpleGrid>

          </Stack>
        </Card>
      )}

      {inventoryView === "tree"
        ? (
          <SimpleGrid
            cols={{
              base: 1,
              md: 2
            }}
          >
            {rootLocations.map(
              location => (
                <LocationNode
                  key={location.id}
                  location={location}
                  allLocations={locations}
                  assets={filteredAssets}
                  sensorsByUid={
                    sensorsByUid
                  }
                  onDropAsset={
                    (
                      assetId,
                      locationId
                    ) =>
                      moveAssetMutation
                        .mutate({
                          assetId,
                          locationId
                        })
                  }
                  onEditLocation={
                    currentLocation =>
                      setLocationForm({
                        id:
                          currentLocation.id,
                        parentId:
                          currentLocation.parentId,
                        type:
                          currentLocation.type,
                        name:
                          currentLocation.name,
                        description:
                          currentLocation.description
                          ?? "",
                        icon:
                          getLocationIconName(
                            currentLocation
                          )
                      })
                  }
                />
              )
            )}
          </SimpleGrid>
        )
        : (
          <Card
            withBorder
            radius="md"
            padding="md"
          >
            <Table
              striped
              highlightOnHover
              verticalSpacing="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Asset</Table.Th>
                  <Table.Th>Sensor UID</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Protocol</Table.Th>
                  <Table.Th>Health</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {filteredAssets.map(
                  asset => (
                    <Table.Tr
                      key={asset.id}
                    >
                      <Table.Td>
                        {
                          asset.sensor?.name
                          ?? asset.name
                          ?? asset.externalId
                        }
                      </Table.Td>

                      <Table.Td>
                        {
                          asset.sensor?.uid
                          ?? "—"
                        }
                      </Table.Td>

                      <Table.Td>
                        <Group gap={4}>
                          <LocationIcon
                            name={
                              getLocationIconName(
                                asset.location
                              )
                            }
                            size={16}
                          />

                          <Text size="sm">
                            {
                              asset.location?.name
                              ?? "Unassigned"
                            }
                          </Text>
                        </Group>
                      </Table.Td>

                      <Table.Td>
                        {asset.assetType}
                      </Table.Td>

                      <Table.Td>
                        {
                          asset.protocol
                          ?? "—"
                        }
                      </Table.Td>

                      <Table.Td>
                        <Badge
                          color={
                            asset.health.status ===
                              "online"
                              ? "green"
                              : asset.health.status ===
                                  "warning"
                                ? "yellow"
                                : "red"
                          }
                          variant="light"
                        >
                          {asset.health.status}
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        <Badge
                          color={
                            assetIsEnabled(asset, sensorsByUid)
                              ? "green"
                              : "orange"
                          }
                          variant="light"
                        >
                          {
                            assetIsEnabled(asset, sensorsByUid)
                              ? "Enabled"
                              : "Disabled"
                          }
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  )
                )}
              </Table.Tbody>
            </Table>
          </Card>
        )}

    </Stack>

    <Modal
      opened={
        locationForm !== null
      }
      onClose={
        () =>
          setLocationForm(
            null
          )
      }
      title={
        locationForm?.id
          ? "Edit location"
          : "Add location"
      }
    >
      {locationForm && (
        <Stack gap="md">

          <TextInput
            label="Name"
            value={
              locationForm.name
            }
            onChange={
              event =>
                setLocationForm({
                  ...locationForm,
                  name:
                    event.currentTarget.value
                })
            }
          />

          <Select
            label="Type"
            value={
              locationForm.type
            }
            onChange={
              value =>
                setLocationForm({
                  ...locationForm,
                  type:
                    (
                      value
                      ?? "ROOM"
                    ) as LocationType
                })
            }
            data={[
              "SITE",
              "BUILDING",
              "FLOOR",
              "ROOM",
              "ZONE",
              "AREA",
              "OTHER"
            ]}
          />


          <Select
            label="Icon"
            description="Optional icon displayed with this location"
            clearable
            searchable
            placeholder="No icon"
            value={locationForm.icon}
            leftSection={
              <LocationIcon
                name={locationForm.icon}
                size={17}
              />
            }
            data={LOCATION_ICON_OPTIONS}
            renderOption={
              ({ option }) => (
                <Group gap="xs">
                  <LocationIcon
                    name={
                      option.value as
                        LocationIconName
                    }
                    size={17}
                  />
                  <Text size="sm">
                    {option.label}
                  </Text>
                </Group>
              )
            }
            onChange={
              value =>
                setLocationForm({
                  ...locationForm,
                  icon:
                    value as
                      LocationIconName
                      | null
                })
            }
          />
          <Select
            label="Parent location"
            clearable
            searchable
            value={
              locationForm.parentId
            }
            onChange={
              value =>
                setLocationForm({
                  ...locationForm,
                  parentId:
                    value
                })
            }
            data={
              locations
                .filter(
                  location =>
                    location.id !==
                    locationForm.id
                )
                .map(
                  location => ({
                    value:
                      location.id,
                    label:
                      location.name
                  })
                )
            }
          />

          <Textarea
            label="Description"
            value={
              locationForm.description
            }
            onChange={
              event =>
                setLocationForm({
                  ...locationForm,
                  description:
                    event.currentTarget.value
                })
            }
          />

          {
            saveLocationMutation.isError &&
            (
              <Text c="red">
                Unable to save location.
              </Text>
            )
          }

          {
            deleteLocationMutation.isError &&
            (
              <Text c="red">
                Unable to delete location. Remove child locations and assigned assets first.
              </Text>
            )
          }

          <Group justify="space-between">

            <div>
              {locationForm.id && (
                <Button
                  color="red"
                  variant="light"
                  loading={
                    deleteLocationMutation.isPending
                  }
                  onClick={
                    () =>
                      deleteLocationMutation
                        .mutate(
                          locationForm.id!
                        )
                  }
                >
                  Delete
                </Button>
              )}
            </div>

            <Group>
              <Button
                variant="default"
                onClick={
                  () =>
                    setLocationForm(
                      null
                    )
                }
              >
                Cancel
              </Button>

              <Button
                loading={
                  saveLocationMutation.isPending
                }
                disabled={
                  !locationForm.name.trim() ||
                  !locationForm.type.trim()
                }
                onClick={
                  () =>
                    saveLocationMutation
                      .mutate(
                        locationForm
                      )
                }
              >
                Save
              </Button>
            </Group>

          </Group>

        </Stack>
      )}
    </Modal>
    </>
  );
}
