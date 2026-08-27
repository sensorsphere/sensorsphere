import React from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";

import {
  useMutation,
  useQueryClient
} from "@tanstack/react-query";

import type {
  Asset,
  AssetMetric,
  MetricQualityConfig
} from "./types";

interface Props {
  asset: Asset | undefined;
}

type QualityMode =
  MetricQualityConfig["mode"];

function metricSortOrder(
  key: string
): number {

  switch (key) {
    case "temperature":
      return 10;
    case "humidity":
      return 20;
    case "battery":
    case "battery_level":
      return 30;
    case "voltage":
    case "battery_voltage":
      return 40;
    case "rssi":
      return 50;
    default:
      return 100;
  }
}

function defaultConfig(
  metric: AssetMetric,
  mode: QualityMode
): MetricQualityConfig {

  switch (mode) {
    case "NONE":
      return {
        mode: "NONE"
      };

    case "HIGHER_IS_BETTER":
      if (metric.key === "rssi") {
        return {
          mode,
          warning: -80,
          good: -65
        };
      }

      return {
        mode,
        warning: 20,
        good: 50
      };

    case "LOWER_IS_BETTER":
      return {
        mode,
        good: 10,
        warning: 20
      };

    case "RANGE":
      if (metric.key === "humidity") {
        return {
          mode,
          criticalMin: 20,
          warningMin: 30,
          warningMax: 70,
          criticalMax: 80
        };
      }

      return {
        mode,
        criticalMin: 10,
        warningMin: 18,
        warningMax: 26,
        criticalMax: 35
      };
  }
}

function configIsValid(
  config: MetricQualityConfig
): boolean {

  switch (config.mode) {
    case "NONE":
      return true;

    case "HIGHER_IS_BETTER":
      return (
        Number.isFinite(config.warning) &&
        Number.isFinite(config.good) &&
        config.warning < config.good
      );

    case "LOWER_IS_BETTER":
      return (
        Number.isFinite(config.good) &&
        Number.isFinite(config.warning) &&
        config.good < config.warning
      );

    case "RANGE":
      return (
        Number.isFinite(config.criticalMin) &&
        Number.isFinite(config.warningMin) &&
        Number.isFinite(config.warningMax) &&
        Number.isFinite(config.criticalMax) &&
        config.criticalMin < config.warningMin &&
        config.warningMin <= config.warningMax &&
        config.warningMax < config.criticalMax
      );
  }
}

function qualityDescription(
  config: MetricQualityConfig,
  unit: string | null
): string {

  const suffix =
    unit ? ` ${unit}` : "";

  switch (config.mode) {
    case "NONE":
      return "Quality indicator disabled";

    case "HIGHER_IS_BETTER":
      return `Good ≥ ${config.good}${suffix} · Warning ≥ ${config.warning}${suffix} · Critical below`;

    case "LOWER_IS_BETTER":
      return `Good ≤ ${config.good}${suffix} · Warning ≤ ${config.warning}${suffix} · Critical above`;

    case "RANGE":
      return `Good ${config.warningMin}–${config.warningMax}${suffix} · Warning inside ${config.criticalMin}–${config.criticalMax}${suffix} · Critical outside`;
  }
}

async function saveMetricQuality(
  assetId: string,
  metricId: string,
  config: MetricQualityConfig
): Promise<AssetMetric> {

  const response =
    await fetch(
      `/api/v1/assets/${assetId}/metrics/${metricId}/quality`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(config)
      }
    );

  if (!response.ok) {
    const body =
      await response
        .json()
        .catch(
          () => null
        );

    throw new Error(
      body?.error
      ?? `HTTP ${response.status}`
    );
  }

  return response.json();
}

async function resetMetricQuality(
  assetId: string,
  metricId: string
): Promise<AssetMetric> {
  const response = await fetch(`/api/v1/assets/${assetId}/metrics/${metricId}/quality`, { method: "DELETE" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function saveGlobalMetricQuality(
  metricKey: string,
  config: MetricQualityConfig
): Promise<void> {
  const response = await fetch(`/api/v1/metric-quality-policies/${encodeURIComponent(metricKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function MetricQualityCard({
  assetId,
  metric
}: {
  assetId: string;
  metric: AssetMetric;
}) {

  const queryClient =
    useQueryClient();

  const [scope, setScope] =
    React.useState<
      "GLOBAL" | "OVERRIDE"
    >(
      metric.qualityOverridden
        ? "OVERRIDE"
        : "GLOBAL"
    );

  const [config, setConfig] =
    React.useState<MetricQualityConfig>(
      metric.qualityOverridden
        ? metric.qualityConfig
        : metric.globalQualityConfig
    );

  const [dirty, setDirty] =
    React.useState(false);

  React.useEffect(
    () => {
      if (!dirty) {
        setConfig(
          scope === "GLOBAL"
            ? metric.globalQualityConfig
            : metric.qualityConfig
        );
      }
    },
    [
      dirty,
      scope,
      metric.qualityConfig,
      metric.globalQualityConfig
    ]
  );

  const mutation =
    useMutation({
      mutationFn:
        () =>
          scope === "GLOBAL"
            ? saveGlobalMetricQuality(
                metric.key,
                config
              )
            : saveMetricQuality(
                assetId,
                metric.id,
                config
              ),

      onSuccess:
        async () => {
          setDirty(false);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["assets"] }),
            queryClient.invalidateQueries({ queryKey: ["latest-observations"] })
          ]);
        }
    });

  const resetMutation =
    useMutation({
      mutationFn:
        () =>
          resetMetricQuality(
            assetId,
            metric.id
          ),
      onSuccess:
        async () => {
          setScope("GLOBAL");
          setDirty(false);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["assets"] }),
            queryClient.invalidateQueries({ queryKey: ["latest-observations"] })
          ]);
        }
    });

  const updateConfig =
    (
      next:
        MetricQualityConfig
    ): void => {
      setConfig(next);
      setDirty(true);
    };

  const valid =
    configIsValid(config);

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
    >
      <Stack gap="sm">

        <Group
          justify="space-between"
          align="flex-start"
        >
          <div>
            <Text fw={700}>
              {metric.displayName}
            </Text>

            <Text
              size="xs"
              c="dimmed"
            >
              {metric.key}
              {
                metric.unit
                  ? ` · ${metric.unit}`
                  : ""
              }
            </Text>
          </div>

          <Badge
            variant="light"
            color={
              config.mode === "NONE"
                ? "gray"
                : "blue"
            }
          >
            {config.mode}
          </Badge>

          {metric.qualityOverridden && (
            <Badge
              color="violet"
              variant="filled"
              title="This sensor overrides the global quality policy"
            >
              ↳ Overridden
            </Badge>
          )}
        </Group>

        <Select
          label="Configuration scope"
          value={scope}
          data={[
            { value: "GLOBAL", label: "Global default" },
            { value: "OVERRIDE", label: "This sensor override" }
          ]}
          onChange={value => {
            if (!value) return;
            const next = value as "GLOBAL" | "OVERRIDE";
            setScope(next);
            setConfig(next === "GLOBAL" ? metric.globalQualityConfig : metric.qualityConfig);
            setDirty(false);
          }}
        />

        <Text size="xs" c="dimmed">
          Global: {qualityDescription(metric.globalQualityConfig, metric.unit)}
        </Text>

        <Select
          label="Quality mode"
          value={config.mode}
          data={[
            {
              value: "NONE",
              label: "None"
            },
            {
              value:
                "HIGHER_IS_BETTER",
              label:
                "Higher is better"
            },
            {
              value:
                "LOWER_IS_BETTER",
              label:
                "Lower is better"
            },
            {
              value: "RANGE",
              label:
                "Target range"
            }
          ]}
          onChange={
            value => {
              if (!value) {
                return;
              }

              const mode =
                value as
                  QualityMode;

              updateConfig(
                config.mode === mode
                  ? config
                  : defaultConfig(
                      metric,
                      mode
                    )
              );
            }
          }
        />

        {
          config.mode ===
            "HIGHER_IS_BETTER" && (
            <SimpleGrid cols={2}>
              <NumberInput
                label="Warning from"
                value={config.warning}
                suffix={
                  metric.unit
                    ? ` ${metric.unit}`
                    : undefined
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      warning:
                        Number(value)
                    })
                }
              />

              <NumberInput
                label="Good from"
                value={config.good}
                suffix={
                  metric.unit
                    ? ` ${metric.unit}`
                    : undefined
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      good:
                        Number(value)
                    })
                }
              />
            </SimpleGrid>
          )
        }

        {
          config.mode ===
            "LOWER_IS_BETTER" && (
            <SimpleGrid cols={2}>
              <NumberInput
                label="Good up to"
                value={config.good}
                suffix={
                  metric.unit
                    ? ` ${metric.unit}`
                    : undefined
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      good:
                        Number(value)
                    })
                }
              />

              <NumberInput
                label="Warning up to"
                value={config.warning}
                suffix={
                  metric.unit
                    ? ` ${metric.unit}`
                    : undefined
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      warning:
                        Number(value)
                    })
                }
              />
            </SimpleGrid>
          )
        }

        {
          config.mode === "RANGE" && (
            <SimpleGrid
              cols={{
                base: 2,
                sm: 4
              }}
            >
              <NumberInput
                label="Critical min"
                value={
                  config.criticalMin
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      criticalMin:
                        Number(value)
                    })
                }
              />

              <NumberInput
                label="Warning min"
                value={
                  config.warningMin
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      warningMin:
                        Number(value)
                    })
                }
              />

              <NumberInput
                label="Warning max"
                value={
                  config.warningMax
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      warningMax:
                        Number(value)
                    })
                }
              />

              <NumberInput
                label="Critical max"
                value={
                  config.criticalMax
                }
                onChange={
                  value =>
                    updateConfig({
                      ...config,
                      criticalMax:
                        Number(value)
                    })
                }
              />
            </SimpleGrid>
          )
        }

        <Text
          size="xs"
          c="dimmed"
        >
          {
            qualityDescription(
              config,
              metric.unit
            )
          }
        </Text>

        {
          !valid && (
            <Alert
              color="red"
              title="Invalid thresholds"
            >
              Check the threshold ordering before saving.
            </Alert>
          )
        }

        {
          mutation.isError && (
            <Text c="red" size="sm">
              {
                mutation.error
                  instanceof Error
                  ? mutation.error.message
                  : "Unable to save quality configuration."
              }
            </Text>
          )
        }

        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            color="gray"
            disabled={!dirty}
            onClick={
              () => {
                setConfig(
                  scope === "GLOBAL"
                    ? metric.globalQualityConfig
                    : metric.qualityConfig
                );
                setDirty(false);
              }
            }
          >
            Reset
          </Button>

          {metric.qualityOverridden && scope === "OVERRIDE" && (
            <Button
              size="xs"
              color="violet"
              variant="subtle"
              loading={resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
            >
              Reset to global
            </Button>
          )}

          <Button
            size="xs"
            disabled={
              !dirty || !valid
            }
            loading={
              mutation.isPending
            }
            onClick={
              () =>
                mutation.mutate()
            }
          >
            {scope === "GLOBAL" ? "Save global" : "Save override"}
          </Button>
        </Group>

      </Stack>
    </Card>
  );
}

export function MetricQualityEditor({
  asset
}: Props) {

  if (!asset) {
    return (
      <Text
        size="sm"
        c="dimmed"
      >
        Quality settings are unavailable until this sensor is linked to an asset.
      </Text>
    );
  }

  const metrics =
    [...asset.metrics]
      .sort(
        (left, right) => {
          const order =
            metricSortOrder(left.key) -
            metricSortOrder(right.key);

          return order !== 0
            ? order
            : left.displayName
                .localeCompare(
                  right.displayName,
                  undefined,
                  {
                    sensitivity:
                      "base"
                  }
                );
        }
      );

  return (
    <Stack gap="sm">
      <div>
        <Title order={4}>
          Metric quality
        </Title>
        <Text
          size="sm"
          c="dimmed"
        >
          Metrics inherit global thresholds by default. Use a sensor override only when local conditions require different criteria.
        </Text>
      </div>

      {
        metrics.map(
          metric => (
            <MetricQualityCard
              key={metric.id}
              assetId={asset.id}
              metric={metric}
            />
          )
        )
      }
    </Stack>
  );
}
