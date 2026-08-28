import React from "react";

import { LocationSelect } from "./LocationFilterControls";

import {
  Badge,
  Card,
  Checkbox,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";

import { useQuery } from "@tanstack/react-query";

import {
  getAssets,
  getGateways,
  getLocations,
  getSensors
} from "./api";

import type {
  Asset,
  Gateway,
  Location,
  Sensor
} from "./types";

function gatewayIsOnline(gateway: Gateway): boolean {
  if (!gateway.lastSeenAt) {
    return false;
  }

  const ageMs = Date.now() - new Date(gateway.lastSeenAt).getTime();
  return ageMs >= 0 && ageMs <= 120_000;
}

function sensorStatus(sensor: Sensor): {
  label: string;
  color: string;
} {
  if (sensor.blacklisted) {
    return { label: "BLACKLISTED", color: "red" };
  }

  return sensor.online
    ? { label: "ONLINE", color: "green" }
    : { label: "OFFLINE", color: "red" };
}

function assetStatus(asset: Asset): {
  label: string;
  color: string;
} {
  switch (asset.health.status) {
    case "online":
      return { label: "ONLINE", color: "green" };
    case "warning":
      return { label: "WARNING", color: "yellow" };
    case "offline":
      return { label: "OFFLINE", color: "red" };
  }
}

function locationPath(
  location: Location,
  byId: Map<string, Location>
): string {
  const names = [location.name];
  let current = location;
  const visited = new Set<string>([location.id]);

  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || visited.has(parent.id)) {
      break;
    }

    visited.add(parent.id);
    names.unshift(parent.name);
    current = parent;
  }

  return names.join(" / ");
}

function NodeCard({
  title,
  subtitle,
  badges,
  tone = "default"
}: {
  title: string;
  subtitle?: string | null;
  badges?: React.ReactNode;
  tone?: "default" | "warning" | "muted";
}) {
  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={{
        minHeight: 76,
        borderStyle: tone === "muted" ? "dashed" : "solid",
        borderColor:
          tone === "warning"
            ? "var(--mantine-color-orange-5)"
            : undefined,
        background:
          tone === "warning"
            ? "color-mix(in srgb, var(--mantine-color-orange-1) 35%, var(--mantine-color-body))"
            : undefined
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text fw={600} size="sm" lineClamp={1}>
            {title}
          </Text>
          {badges}
        </Group>
        {subtitle && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {subtitle}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <Stack gap={2} align="center" justify="center" style={{ minWidth: 86 }}>
      <Text size="xs" c="dimmed" ta="center">
        {label}
      </Text>
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          color: "var(--mantine-color-gray-5)"
        }}
      >
        <div style={{ height: 1, background: "currentColor", flex: 1 }} />
        <span style={{ fontSize: 16, lineHeight: 1 }}>▶</span>
      </div>
    </Stack>
  );
}

export function TopologyPanel() {
  const [locationFilter, setLocationFilter] = React.useState<string | null>(null);
  const [showOnlyMismatches, setShowOnlyMismatches] = React.useState(false);
  const [showBlacklisted, setShowBlacklisted] = React.useState(false);
  const [showAssets, setShowAssets] = React.useState(true);

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: getLocations });
  const gatewaysQuery = useQuery({ queryKey: ["gateways"], queryFn: getGateways });
  const sensorsQuery = useQuery({ queryKey: ["sensors"], queryFn: getSensors });
  const assetsQuery = useQuery({ queryKey: ["assets"], queryFn: getAssets });

  const isLoading =
    locationsQuery.isLoading ||
    gatewaysQuery.isLoading ||
    sensorsQuery.isLoading ||
    assetsQuery.isLoading;

  const isError =
    locationsQuery.isError ||
    gatewaysQuery.isError ||
    sensorsQuery.isError ||
    assetsQuery.isError;

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (isError) {
    return (
      <Card withBorder>
        <Text c="red">Unable to load topology data.</Text>
      </Card>
    );
  }

  const locations = locationsQuery.data ?? [];
  const gateways = gatewaysQuery.data ?? [];
  const sensors = sensorsQuery.data ?? [];
  const assets = assetsQuery.data ?? [];

  const locationsById = new Map(locations.map(location => [location.id, location]));
  const gatewaysById = new Map(gateways.map(gateway => [gateway.id, gateway]));
  const assetsBySensorUid = new Map<string, Asset[]>();

  for (const asset of assets) {
    if (!asset.sensor) {
      continue;
    }

    const current = assetsBySensorUid.get(asset.sensor.uid) ?? [];
    current.push(asset);
    assetsBySensorUid.set(asset.sensor.uid, current);
  }


  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>Location Topology</Title>
          <Text c="dimmed" size="sm">
            Gateway → sensor → asset relationships grouped by location.
          </Text>
        </Stack>
        <Badge variant="light" color="blue" size="lg">
          {visibleGroups.length} locations
        </Badge>
      </Group>

      <Card withBorder padding="sm">
        <Group gap="lg" align="center">
          <LocationSelect
            label="Location"
            placeholder="All locations"
            clearable
            searchable
            locations={locations}
            value={locationFilter}
            onChange={setLocationFilter}
          />
          <Checkbox
            label="Show only mismatches"
            checked={showOnlyMismatches}
            onChange={event => setShowOnlyMismatches(event.currentTarget.checked)}
          />
          <Checkbox
            label="Show blacklisted"
            checked={showBlacklisted}
            onChange={event => setShowBlacklisted(event.currentTarget.checked)}
          />
          <Checkbox
            label="Show assets"
            checked={showAssets}
            onChange={event => setShowAssets(event.currentTarget.checked)}
          />
        </Group>
      </Card>

      {visibleGroups.length === 0 ? (
        <Card withBorder>
          <Text c="dimmed">No topology items match the current filters.</Text>
        </Card>
      ) : (
        visibleGroups.map(group => (
          <Card key={group.id} withBorder padding="md" radius="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={1}>
                  <Group gap="xs">
                    <Title order={4}>{group.name}</Title>
                    {group.location && (
                      <Badge variant="light" color="gray">
                        {group.location.type}
                      </Badge>
                    )}
                  </Group>
                  {group.path !== group.name && (
                    <Text size="xs" c="dimmed">{group.path}</Text>
                  )}
                </Stack>
                <Group gap="xs">
                  <Badge variant="light" color="green">
                    {group.groupGateways.length} gateways
                  </Badge>
                  <Badge variant="light" color="blue">
                    {group.rows.length} sensors
                  </Badge>
                  {showAssets && (
                    <Badge variant="light" color="violet">
                      {group.groupAssets.length} assets
                    </Badge>
                  )}
                </Group>
              </Group>

              {group.rows.map(({ sensor, primary, linkedAssets, mismatch }) => {
                const status = sensorStatus(sensor);
                return (
                  <div
                    key={sensor.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: showAssets
                        ? "minmax(190px, 1fr) 90px minmax(210px, 1fr) 90px minmax(190px, 1fr)"
                        : "minmax(190px, 1fr) 90px minmax(210px, 1fr)",
                      gap: 10,
                      alignItems: "center",
                      overflowX: "auto"
                    }}
                  >
                    {primary ? (
                      <NodeCard
                        title={primary.name}
                        subtitle={`${primary.gatewayId}${primary.location ? ` · ${primary.location.name}` : " · Unassigned"}`}
                        tone={mismatch && (primary.location?.id ?? null) !== (sensor.room?.id ?? null) ? "warning" : "default"}
                        badges={(
                          <Badge variant="light" color={gatewayIsOnline(primary) ? "green" : "red"} size="xs">
                            {gatewayIsOnline(primary) ? "ONLINE" : "OFFLINE"}
                          </Badge>
                        )}
                      />
                    ) : (
                      <NodeCard
                        title="No primary gateway"
                        subtitle="Assign a primary gateway to this sensor"
                        tone="warning"
                      />
                    )}

                    <Connector label="Primary" />

                    <NodeCard
                      title={sensor.name ?? sensor.uid}
                      subtitle={sensor.name ? sensor.uid : sensor.manufacturer ?? "Sensor"}
                      tone={mismatch ? "warning" : "default"}
                      badges={(
                        <Group gap={4} wrap="nowrap">
                          {mismatch && (
                            <Badge variant="light" color="orange" size="xs">MISMATCH</Badge>
                          )}
                          <Badge variant="light" color={status.color} size="xs">{status.label}</Badge>
                        </Group>
                      )}
                    />

                    {showAssets && <Connector label="Attached to" />}

                    {showAssets && (
                      linkedAssets.length > 0 ? (
                        <Stack gap="xs">
                          {linkedAssets.map(asset => {
                            const status = assetStatus(asset);
                            const assetLocationMismatch =
                              (asset.location?.id ?? null) !== (sensor.room?.id ?? null);
                            return (
                              <NodeCard
                                key={asset.id}
                                title={asset.name ?? asset.externalId}
                                subtitle={`${asset.assetType}${asset.location ? ` · ${asset.location.name}` : " · Unassigned"}`}
                                tone={assetLocationMismatch ? "warning" : "default"}
                                badges={(
                                  <Badge variant="light" color={status.color} size="xs">
                                    {status.label}
                                  </Badge>
                                )}
                              />
                            );
                          })}
                        </Stack>
                      ) : (
                        <NodeCard
                          title="No linked asset"
                          subtitle="This sensor is not attached to an asset"
                          tone="muted"
                        />
                      )
                    )}
                  </div>
                );
              })}

              {!showOnlyMismatches && group.groupGateways.length > 0 && (
                <Stack gap="xs">
                  <Text size="xs" fw={600} c="dimmed">GATEWAYS IN THIS LOCATION</Text>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                    {group.groupGateways.map(gateway => (
                      <NodeCard
                        key={gateway.id}
                        title={gateway.name}
                        subtitle={gateway.gatewayId}
                        badges={(
                          <Badge variant="light" color={gatewayIsOnline(gateway) ? "green" : "red"} size="xs">
                            {gatewayIsOnline(gateway) ? "ONLINE" : "OFFLINE"}
                          </Badge>
                        )}
                      />
                    ))}
                  </SimpleGrid>
                </Stack>
              )}
            </Stack>
          </Card>
        ))
      )}
    </Stack>
  );
}
