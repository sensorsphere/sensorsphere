import React from "react";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
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

interface SensorFormState {
  name: string;
  description: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  locationId: string;
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

          enabled:
            form.enabled
        }
      });
    };

  if (
    sensorsQuery.isLoading ||
    assetsQuery.isLoading ||
    locationsQuery.isLoading
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
    locationsQuery.isError
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

  return (
    <>
      <Stack gap="md">

        <Group
          justify="space-between"
        >
          <div>
            <Title order={2}>
              Sensors
            </Title>

            <Text c="dimmed">
              Registered SensorSphere devices
            </Text>
          </div>

          <Badge
            variant="light"
          >
            {sensors.length} sensors
          </Badge>
        </Group>

        <SimpleGrid
          cols={{
            base: 1,
            md: 2
          }}
        >

          {sensors.map(
            sensor => {

              const asset =
                assets.find(
                  currentAsset =>
                    currentAsset.sensor?.uid ===
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

                      <Text size="sm">
                        {
                          assets.find(
                            asset =>
                              asset.sensor?.uid ===
                              sensor.uid
                          )?.location?.name
                          ?? "—"
                        }
                      </Text>
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
