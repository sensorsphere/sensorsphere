import React from "react";

import { NavigationIcon } from "./NavigationIcon";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  getAssets,
  getMetricDisplaySettings,
  getObservationAggregates,
  getObservationHistory,
  updateMetricDisplaySetting
} from "./api";

import {
  HistoryChart,
  computeHistoryYAxisBounds,
  historyYAxisKey,
  type HistoryChartSeries,
  type HistoryCurveStyle,
  type HistorySmoothingConfig,
  type HistorySmoothingMethod,
  type HistoryYAxisConfig,
  type HistoryYAxisMode
} from "./HistoryChart";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

type HistoryGraphMode =
  | "sensor_metrics"
  | "metric_sensors";

type HistoryGraphLayout =
  | "full"
  | "half";

type HistorySmoothingWindow = 3 | 5 | 7 | 9 | 11;

interface HistoryGraphVersion {
  savedAt: string;
  config: HistoryGraphSnapshotConfig;
}

interface HistoryGraphConfig {
  id: string;
  name?: string;
  mode?: HistoryGraphMode;
  layout?: HistoryGraphLayout;
  assetId: string;
  metricIds: string[];
  metricKey?: string;
  assetIds?: string[];
  hours: number;
  collapsed?: boolean;
  yAxes?: Record<string, HistoryYAxisConfig>;
  curveStyle?: HistoryCurveStyle;
  smoothing?: HistorySmoothingConfig;
  savedAt?: string;
  versions?: HistoryGraphVersion[];
}

type HistoryGraphSnapshotConfig =
  Omit<HistoryGraphConfig, "versions">;

interface HistoryTabConfig {
  id: string;
  name: string;
  graphs: HistoryGraphConfig[];
}

interface HistoryConfig {
  version: 2;
  activeTabId: string;
  refreshIntervalMs: number;
  tabs: HistoryTabConfig[];
}

const PERIODS = [
  { label: "1 h", value: "1" },
  { label: "2 h", value: "2" },
  { label: "3 h", value: "3" },
  { label: "6 h", value: "6" },
  { label: "12 h", value: "12" },
  { label: "24 h", value: "24" },
  { label: "2 days", value: "48" },
  { label: "3 days", value: "72" },
  { label: "7 days", value: "168" },
  { label: "14 days", value: "336" },
  { label: "30 days", value: "720" }
];

const REFRESH_INTERVALS = [
  { label: "Off", value: "0" },
  { label: "15 s", value: "15000" },
  { label: "30 s", value: "30000" },
  { label: "1 min", value: "60000" },
  { label: "5 min", value: "300000" },
  { label: "10 min", value: "600000" }
];

const DEFAULT_METRIC_COLORS:
Record<string, string> = {
  temperature: "#40c057",
  humidity: "#228be6",
  rssi: "#ff8787",
  battery_level: "#fab005",
  battery_voltage: "#845ef7",
  battery: "#fab005",
  voltage: "#845ef7",
  pressure: "#15aabf",
  co2: "#fd7e14"
};

const METRIC_COLOR_SWATCHES = [
  "#40c057",
  "#fab005",
  "#228be6",
  "#ff8787",
  "#845ef7",
  "#15aabf",
  "#fd7e14",
  "#20c997",
  "#339af0",
  "#cc5de8",
  "#f06595",
  "#94d82d",
  "#fcc419",
  "#ff922b",
  "#868e96"
];

const FALLBACK_METRIC_COLORS = [
  "#12b886",
  "#4c6ef5",
  "#be4bdb",
  "#e64980",
  "#f76707",
  "#0ca678",
  "#1c7ed6",
  "#7048e8"
];

const SENSOR_SERIES_COLORS = [
  "#339af0",
  "#cc5de8",
  "#ff922b",
  "#20c997",
  "#f06595",
  "#5c7cfa",
  "#94d82d",
  "#22b8cf",
  "#e8590c",
  "#9775fa",
  "#12b886",
  "#fcc419",
  "#74c0fc",
  "#da77f2",
  "#ffa94d",
  "#63e6be",
  "#faa2c1",
  "#91a7ff",
  "#b2f2bb",
  "#66d9e8"
];

function defaultMetricColor(
  metricKey: string
): string {

  const normalized =
    metricKey.trim().toLowerCase();

  const configured =
    DEFAULT_METRIC_COLORS[
      normalized
    ];

  if (configured) {
    return configured;
  }

  let hash = 0;

  for (
    let index = 0;
    index < normalized.length;
    index += 1
  ) {
    hash =
      (
        hash * 31 +
        normalized.charCodeAt(index)
      ) >>> 0;
  }

  return FALLBACK_METRIC_COLORS[
    hash %
    FALLBACK_METRIC_COLORS.length
  ];
}

const VALID_REFRESH_INTERVALS =
  new Set(
    REFRESH_INTERVALS.map(
      interval =>
        Number(
          interval.value
        )
    )
  );

function isRefreshInterval(
  value: unknown
): value is number {

  return (
    typeof value === "number" &&
    VALID_REFRESH_INTERVALS.has(
      value
    )
  );
}


function isHistoryYAxisConfig(
  value: unknown
): value is HistoryYAxisConfig {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const config =
    value as Partial<HistoryYAxisConfig>;

  return (
    (
      config.mode === "auto" ||
      config.mode === "fixed"
    ) &&
    (
      config.min === undefined ||
      (
        typeof config.min === "number" &&
        Number.isFinite(config.min)
      )
    ) &&
    (
      config.max === undefined ||
      (
        typeof config.max === "number" &&
        Number.isFinite(config.max)
      )
    )
  );
}

function isHistoryYAxisMap(
  value: unknown
): value is Record<string, HistoryYAxisConfig> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.entries(value).every(
      ([key, config]) =>
        key.length > 0 &&
        isHistoryYAxisConfig(config)
    )
  );
}

function isHistoryCurveStyle(
  value: unknown
): value is HistoryCurveStyle {
  return (
    value === "raw" ||
    value === "smooth"
  );
}

function isHistorySmoothingConfig(
  value: unknown
): value is HistorySmoothingConfig {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const config =
    value as Partial<HistorySmoothingConfig>;

  return (
    (
      config.method === "none" ||
      config.method === "moving_average" ||
      config.method === "median"
    ) &&
    (
      config.window === 3 ||
      config.window === 5 ||
      config.window === 7 ||
      config.window === 9 ||
      config.window === 11
    )
  );
}

function isHistoryGraphSnapshotConfig(
  value: unknown
): value is HistoryGraphSnapshotConfig {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const graph =
    value as Partial<HistoryGraphSnapshotConfig>;

  return (
    typeof graph.id === "string" &&
    typeof graph.assetId === "string" &&
    Array.isArray(graph.metricIds) &&
    graph.metricIds.every(
      metricId =>
        typeof metricId === "string"
    ) &&
    typeof graph.hours === "number" &&
    VALID_HOURS.has(graph.hours) &&
    (
      graph.mode === undefined ||
      graph.mode === "sensor_metrics" ||
      graph.mode === "metric_sensors"
    ) &&
    (
      graph.layout === undefined ||
      graph.layout === "full" ||
      graph.layout === "half"
    ) &&
    (
      graph.metricKey === undefined ||
      typeof graph.metricKey === "string"
    ) &&
    (
      graph.assetIds === undefined ||
      (
        Array.isArray(graph.assetIds) &&
        graph.assetIds.every(
          assetId =>
            typeof assetId === "string"
        )
      )
    ) &&
    (
      graph.yAxes === undefined ||
      isHistoryYAxisMap(graph.yAxes)
    ) &&
    (
      graph.curveStyle === undefined ||
      isHistoryCurveStyle(graph.curveStyle)
    ) &&
    (
      graph.smoothing === undefined ||
      isHistorySmoothingConfig(
        graph.smoothing
      )
    )
  );
}

function isHistoryGraphVersion(
  value: unknown
): value is HistoryGraphVersion {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const version =
    value as Partial<HistoryGraphVersion>;

  return (
    typeof version.savedAt === "string" &&
    Number.isFinite(
      Date.parse(version.savedAt)
    ) &&
    isHistoryGraphSnapshotConfig(
      version.config
    )
  );
}

const VALID_HOURS =
  new Set(
    PERIODS.map(
      period => Number(period.value)
    )
  );

function isHistoryGraphs(
  value: unknown
): value is HistoryGraphConfig[] {
  return (
    Array.isArray(value) &&
    value.every(item => {
      if (
        typeof item !== "object" ||
        item === null
      ) {
        return false;
      }

      const graph =
        item as Partial<HistoryGraphConfig>;

      return (
        typeof graph.id === "string" &&
        (
          graph.name === undefined ||
          typeof graph.name === "string"
        ) &&
        (
          graph.mode === undefined ||
          graph.mode === "sensor_metrics" ||
          graph.mode === "metric_sensors"
        ) &&
        (
          graph.layout === undefined ||
          graph.layout === "full" ||
          graph.layout === "half"
        ) &&
        typeof graph.assetId === "string" &&
        Array.isArray(graph.metricIds) &&
        graph.metricIds.every(
          metricId =>
            typeof metricId === "string"
        ) &&
        (
          graph.metricKey === undefined ||
          typeof graph.metricKey === "string"
        ) &&
        (
          graph.assetIds === undefined ||
          (
            Array.isArray(graph.assetIds) &&
            graph.assetIds.every(
              assetId =>
                typeof assetId === "string"
            )
          )
        ) &&
        typeof graph.hours === "number" &&
        VALID_HOURS.has(graph.hours) &&
        (
          graph.collapsed === undefined ||
          typeof graph.collapsed === "boolean"
        ) &&
        (
          graph.yAxes === undefined ||
          isHistoryYAxisMap(
            graph.yAxes
          )
        ) &&
        (
          graph.curveStyle === undefined ||
          isHistoryCurveStyle(
            graph.curveStyle
          )
        ) &&
        (
          graph.smoothing === undefined ||
          isHistorySmoothingConfig(
            graph.smoothing
          )
        ) &&
        (
          graph.savedAt === undefined ||
          (
            typeof graph.savedAt === "string" &&
            Number.isFinite(
              Date.parse(graph.savedAt)
            )
          )
        ) &&
        (
          graph.versions === undefined ||
          (
            Array.isArray(graph.versions) &&
            graph.versions.length <= 5 &&
            graph.versions.every(
              isHistoryGraphVersion
            )
          )
        )
      );
    })
  );
}

function isHistoryTabs(
  value: unknown
): value is HistoryTabConfig[] {

  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      item => {
        if (
          typeof item !== "object" ||
          item === null
        ) {
          return false;
        }

        const tab =
          item as
            Partial<HistoryTabConfig>;

        return (
          typeof tab.id === "string" &&
          typeof tab.name === "string" &&
          tab.name.trim().length > 0 &&
          isHistoryGraphs(
            tab.graphs
          )
        );
      }
    )
  );
}

function normalizeHistoryTabs(
  tabs: HistoryTabConfig[]
): HistoryTabConfig[] {

  return tabs.map(
    tab => ({
      ...tab,
      graphs:
        tab.graphs.map(
          graph => ({
            ...graph,
            name:
              graph.name ?? "",
            mode:
              graph.mode ??
              "sensor_metrics",
            layout:
              graph.layout ??
              "full",
            metricKey:
              graph.metricKey ?? "",
            assetIds:
              graph.assetIds ?? [],
            yAxes:
              graph.yAxes ?? {},
            curveStyle:
              graph.curveStyle ??
              "smooth",
            smoothing:
              graph.smoothing ?? {
                method: "none",
                window: 3
              },
            savedAt:
              graph.savedAt,
            versions:
              (graph.versions ?? [])
                .slice(0, 5)
          })
        )
    })
  );
}

function normalizeHistoryConfig(
  value: unknown
): HistoryConfig | null {

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return null;
  }

  const config =
    value as {
      version?: unknown;
      activeTabId?: unknown;
      refreshIntervalMs?: unknown;
      tabs?: unknown;
    };

  if (
    (
      config.version !== 1 &&
      config.version !== 2
    ) ||
    typeof config.activeTabId !== "string" ||
    !isRefreshInterval(
      config.refreshIntervalMs
    ) ||
    !isHistoryTabs(
      config.tabs
    )
  ) {
    return null;
  }

  return {
    version: 2,
    activeTabId:
      config.activeTabId,
    refreshIntervalMs:
      config.refreshIntervalMs,
    tabs:
      normalizeHistoryTabs(
        config.tabs
      )
  };
}

function createHistoryConfig(
  activeTabId: string,
  refreshIntervalMs: number,
  tabs: HistoryTabConfig[]
): HistoryConfig {

  return {
    version: 2,
    activeTabId,
    refreshIntervalMs,
    tabs:
      normalizeHistoryTabs(
        tabs
      )
  };
}

function newGraph(): HistoryGraphConfig {
  return {
    id:
      `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    mode: "sensor_metrics",
    layout: "full",
    assetId: "",
    metricIds: [],
    metricKey: "",
    assetIds: [],
    hours: 24,
    collapsed: false,
    yAxes: {},
    curveStyle: "smooth",
    smoothing: {
      method: "moving_average",
      window: 7
    },
    savedAt:
      new Date().toISOString(),
    versions: []
  };
}


function newTab(
  index: number
): HistoryTabConfig {

  return {
    id:
      `history-tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,

    name:
      `History ${index}`,

    graphs:
      []
  };
}

function downloadJson(
  filename: string,
  value: unknown
): void {

  const blob =
    new Blob(
      [
        `${JSON.stringify(value, null, 2)}\n`
      ],
      {
        type: "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function normalizedGraph(
  graph: HistoryGraphConfig
): HistoryGraphConfig {

  return normalizeHistoryTabs([
    {
      id: "normalize",
      name: "normalize",
      graphs: [graph]
    }
  ])[0].graphs[0];
}

function graphSnapshot(
  graph: HistoryGraphConfig
): HistoryGraphSnapshotConfig {
  const {
    versions: _versions,
    ...snapshot
  } = normalizedGraph(graph);

  return snapshot;
}

function graphConfigsEqual(
  left: HistoryGraphConfig,
  right: HistoryGraphConfig
): boolean {
  return (
    JSON.stringify(graphSnapshot(left)) ===
    JSON.stringify(graphSnapshot(right))
  );
}

function savedGraph(
  previous: HistoryGraphConfig,
  next: HistoryGraphConfig
): HistoryGraphConfig {
  const now =
    new Date().toISOString();
  const previousSavedAt =
    previous.savedAt ?? now;

  return normalizedGraph({
    ...next,
    id: previous.id,
    savedAt: now,
    versions: [
      {
        savedAt: previousSavedAt,
        config: graphSnapshot(previous)
      },
      ...(previous.versions ?? [])
    ].slice(0, 5)
  });
}

function restoreGraphVersion(
  current: HistoryGraphConfig,
  version: HistoryGraphVersion
): HistoryGraphConfig {
  return normalizedGraph({
    ...version.config,
    id: current.id,
    savedAt: current.savedAt,
    versions: current.versions ?? []
  });
}

function graphVersionSummary(
  graph: HistoryGraphSnapshotConfig
): string {
  const mode =
    graph.mode ?? "sensor_metrics";
  const selectionCount =
    mode === "metric_sensors"
      ? (graph.assetIds ?? []).length
      : graph.metricIds.length;
  const smoothing =
    graph.smoothing ?? {
      method: "none" as const,
      window: 3 as const
    };

  return [
    mode === "metric_sensors"
      ? `Metric: ${graph.metricKey || "—"}`
      : `Metrics: ${selectionCount}`,
    mode === "metric_sensors"
      ? `Sensors: ${selectionCount}`
      : `Sensor: ${graph.assetId ? "selected" : "—"}`,
    `Period: ${graph.hours} h`,
    `Curve: ${graph.curveStyle ?? "smooth"}`,
    smoothing.method === "none"
      ? "Filter: none"
      : `Filter: ${smoothing.method} ${smoothing.window}`
  ].join(" · ");
}

function importedGraphId(
  suffix = ""
): string {

  return `history-${Date.now()}-${suffix}${Math.random().toString(16).slice(2)}`;
}

function assetLabel(
  asset: Awaited<ReturnType<typeof getAssets>>[number]
): string {
  return (
    asset.sensor?.name
    ?? asset.name
    ?? asset.externalId
  );
}

type HistoryAsset =
  Awaited<ReturnType<typeof getAssets>>[number];

type HistoryMetric =
  HistoryAsset["metrics"][number];

interface HistorySeriesTarget {
  id: string;
  name: string;
  metric: HistoryMetric;
  color: string;
}

function HistoryGraph({
  graph,
  assets,
  metricColors,
  refreshIntervalMs,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveTop,
  onMoveUp,
  onMoveDown,
  onMoveBottom
}: {
  graph: HistoryGraphConfig;
  assets: Awaited<ReturnType<typeof getAssets>>;
  metricColors: ReadonlyMap<string, string>;
  refreshIntervalMs: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (graph: HistoryGraphConfig) => void;
  onRemove: () => void;
  onMoveTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveBottom: () => void;
}) {

  const [
    draftGraph,
    setDraftGraph
  ] =
    React.useState<HistoryGraphConfig | null>(
      null
    );

  const [
    historyOpened,
    setHistoryOpened
  ] =
    React.useState(false);

  const [
    restoredSavedAt,
    setRestoredSavedAt
  ] =
    React.useState<string | null>(
      null
    );

  const [
    selectionNotice,
    setSelectionNotice
  ] =
    React.useState<string | null>(
      null
    );

  const workingGraph =
    draftGraph ?? graph;

  const editing =
    draftGraph !== null;

  const hasUnsavedChanges =
    draftGraph !== null &&
    !graphConfigsEqual(
      graph,
      draftGraph
    );

  const updateDraft =
    (next: HistoryGraphConfig): void => {
      setDraftGraph(
        normalizedGraph(next)
      );
      setRestoredSavedAt(null);
    };

  const beginEditing =
    (): void => {
      setDraftGraph(
        normalizedGraph(graph)
      );
      setRestoredSavedAt(null);
      setSelectionNotice(null);
    };

  const cancelEditing =
    (): void => {
      setDraftGraph(null);
      setRestoredSavedAt(null);
      setSelectionNotice(null);
      setEditingGraphName(false);
    };

  const saveEditing =
    (): void => {
      if (
        !draftGraph ||
        !hasUnsavedChanges
      ) {
        return;
      }

      onChange(
        savedGraph(
          graph,
          draftGraph
        )
      );
      setDraftGraph(null);
      setRestoredSavedAt(null);
      setSelectionNotice(null);
      setEditingGraphName(false);
    };

  const restoreVersion =
    (version: HistoryGraphVersion): void => {
      setDraftGraph(
        restoreGraphVersion(
          graph,
          version
        )
      );
      setRestoredSavedAt(
        version.savedAt
      );
      setSelectionNotice(null);
      setHistoryOpened(false);
    };

  const mode: HistoryGraphMode =
    workingGraph.mode ??
    "sensor_metrics";

  const layout: HistoryGraphLayout =
    workingGraph.layout ??
    "full";

  const asset =
    assets.find(
      current =>
        current.id === workingGraph.assetId
    );

  const metrics =
    asset?.metrics
      .filter(metric => metric.enabled)
      .sort(
        (left, right) =>
          left.displayName.localeCompare(
            right.displayName
          )
      )
    ?? [];

  const selectedMetrics =
    metrics.filter(
      metric =>
        workingGraph.metricIds.includes(
          metric.id
        )
    );

  const metricDefinitions =
    new Map<string, HistoryMetric>();

  assets
    .filter(
      current =>
        current.sensor !== null
    )
    .forEach(current => {
      current.metrics
        .filter(metric => metric.enabled)
        .forEach(metric => {
          if (
            !metricDefinitions.has(
              metric.key
            )
          ) {
            metricDefinitions.set(
              metric.key,
              metric
            );
          }
        });
    });

  const metricOptions =
    Array.from(
      metricDefinitions.values()
    )
      .sort(
        (left, right) =>
          left.displayName.localeCompare(
            right.displayName
          )
      )
      .map(metric => ({
        value: metric.key,
        label:
          metric.unit
            ? `${metric.displayName} (${metric.unit})`
            : metric.displayName
      }));

  const selectedMetricKey =
    workingGraph.metricKey ?? "";

  const selectedMetricDefinition =
    metricDefinitions.get(
      selectedMetricKey
    );

  const eligibleAssets =
    selectedMetricKey
      ? assets
          .filter(
            current =>
              current.sensor !== null &&
              current.metrics.some(
                metric =>
                  metric.enabled &&
                  metric.key ===
                    selectedMetricKey
              )
          )
          .sort(
            (left, right) =>
              assetLabel(left).localeCompare(
                assetLabel(right)
              )
          )
      : [];

  const comparisonAssetIds =
    workingGraph.assetIds ?? [];

  const seriesTargets:
    HistorySeriesTarget[] =
      mode === "sensor_metrics"
        ? selectedMetrics.map(
            metric => ({
              id: metric.id,
              name: metric.displayName,
              metric,
              color:
                metricColors.get(
                  metric.key
                ) ??
                defaultMetricColor(
                  metric.key
                )
            })
          )
        : comparisonAssetIds
            .map((assetId, seriesIndex) => {
              const currentAsset =
                eligibleAssets.find(
                  current =>
                    current.id ===
                      assetId
                );

              if (!currentAsset) {
                return null;
              }

              const metric =
                currentAsset.metrics.find(
                  current =>
                    current.enabled &&
                    current.key ===
                      selectedMetricKey
                );

              if (!metric) {
                return null;
              }

              return {
                id: metric.id,
                name:
                  assetLabel(
                    currentAsset
                  ),
                metric,
                color:
                  SENSOR_SERIES_COLORS[
                    seriesIndex %
                    SENSOR_SERIES_COLORS.length
                  ]
              };
            })
            .filter(
              (
                target
              ): target is HistorySeriesTarget =>
                target !== null
            );

  const useAggregates =
    workingGraph.hours > 24;

  const aggregateBucket =
    workingGraph.hours <= 168
      ? "15 minutes" as const
      : "1 hour" as const;

  const dataQueries =
    useQueries({
      queries:
        seriesTargets.map(
          target => ({
            queryKey:
              useAggregates
                ? [
                    "observation-aggregate",
                    target.metric.id,
                    workingGraph.hours,
                    aggregateBucket
                  ]
                : [
                    "observation-history",
                    target.metric.id,
                    workingGraph.hours
                  ],

            queryFn:
              () =>
                useAggregates
                  ? getObservationAggregates(
                      target.metric.id,
                      workingGraph.hours,
                      aggregateBucket
                    )
                  : getObservationHistory(
                      target.metric.id,
                      workingGraph.hours
                    ),

            enabled:
              !workingGraph.collapsed,

            refetchInterval:
              refreshIntervalMs > 0
                ? refreshIntervalMs
                : false,

            staleTime:
              refreshIntervalMs > 0
                ? refreshIntervalMs
                : Infinity,

            refetchOnMount:
              false,

            refetchOnWindowFocus:
              false,

            refetchOnReconnect:
              false
          })
        )
    });

  const loading =
    dataQueries.some(
      query =>
        query.isLoading
    );

  const error =
    dataQueries.some(
      query =>
        query.isError
    );

  const chartSeries:
    HistoryChartSeries[] =
      seriesTargets.map(
        (target, index) => {

          const data =
            dataQueries[index]?.data
            ?? [];

          const series:
            HistoryChartSeries = {
              id:
                target.id,

              name:
                target.name,

              unit:
                target.metric.unit,

              color:
                target.color,

              history:
                useAggregates
                  ? []
                  : data as
                      ObservationHistoryPoint[],

              aggregates:
                useAggregates
                  ? data as
                      ObservationAggregatePoint[]
                  : []
            };

          const currentValue =
            latestNumericSeriesValue(
              series
            );

          return {
            ...series,
            name:
              currentValue !== null
                ? `${target.name} (${formatCurrentValue(
                    currentValue,
                    target.metric.unit
                  )})`
                : target.name
          };
        }
      );

  const yAxisUnits =
    Array.from(
      new Set(
        chartSeries.map(
          item =>
            historyYAxisKey(item.unit)
        )
      )
    );

  const autoYAxisBounds =
    computeHistoryYAxisBounds(
      chartSeries
    );

  const yAxes =
    workingGraph.yAxes ?? {};

  const updateYAxis =
    (
      unit: string,
      next: HistoryYAxisConfig
    ): void => {
      updateDraft({
        ...workingGraph,
        yAxes: {
          ...yAxes,
          [unit]: next
        }
      });
    };

  const setYAxisMode =
    (
      unit: string,
      mode: HistoryYAxisMode
    ): void => {
      const current =
        yAxes[unit];

      if (mode === "auto") {
        updateYAxis(
          unit,
          {
            ...current,
            mode: "auto"
          }
        );
        return;
      }

      const automatic =
        autoYAxisBounds[unit];

      updateYAxis(
        unit,
        {
          mode: "fixed",
          min:
            current?.min ??
            automatic?.min,
          max:
            current?.max ??
            automatic?.max
        }
      );
    };

  const automaticGraphTitle =
    mode === "sensor_metrics"
      ? (
          asset
            ? assetLabel(asset)
            : "History graph"
        )
      : (
          selectedMetricDefinition
            ?.displayName ??
          (
            selectedMetricKey ||
            "History graph"
          )
        );

  const graphTitle =
    workingGraph.name?.trim() ||
    automaticGraphTitle;

  const [
    editingGraphName,
    setEditingGraphName
  ] =
    React.useState(false);

  const [
    graphNameDraft,
    setGraphNameDraft
  ] =
    React.useState(
      workingGraph.name ?? ""
    );

  const [
    removeConfirmOpened,
    setRemoveConfirmOpened
  ] =
    React.useState(false);

  React.useEffect(
    () => {
      if (!editingGraphName) {
        setGraphNameDraft(
          workingGraph.name ?? ""
        );
      }
    },
    [
      editingGraphName,
      workingGraph.name
    ]
  );

  const saveGraphName =
    (): void => {
      updateDraft({
        ...workingGraph,
        name:
          graphNameDraft.trim()
      });

      setEditingGraphName(false);
    };

  const cancelGraphName =
    (): void => {
      setGraphNameDraft(
        workingGraph.name ?? ""
      );
      setEditingGraphName(false);
    };

  const graphSubtitle =
    mode === "sensor_metrics"
      ? (
          selectedMetrics.length > 0
            ? selectedMetrics
                .map(
                  metric =>
                    metric.displayName
                )
                .join(" · ")
            : "Select a sensor and one or more metrics"
        )
      : (
          seriesTargets.length > 0
            ? null
            : "Select a metric and one or more sensors"
        );

  const graphSelectionSummary =
    mode === "metric_sensors"
      ? `${seriesTargets.length} sensor${seriesTargets.length === 1 ? "" : "s"}`
      : null;

  const comparisonNeedsMetric =
    mode === "metric_sensors" &&
    !selectedMetricKey;

  const comparisonNeedsSensors =
    mode === "metric_sensors" &&
    Boolean(selectedMetricKey) &&
    seriesTargets.length === 0;

  const exportGraph =
    (): void => {

      downloadJson(
        `sensorsphere-history-graph-${workingGraph.id}.json`,
        {
          type:
            "sensorsphere-history-graph",
          version: 1,
          graph:
            normalizedGraph(
              workingGraph
            )
        }
      );
    };

  return (
    <Card
      id={`history-graph-${workingGraph.id}`}
      data-history-graph-id={workingGraph.id}
      withBorder
      radius="md"
      padding="lg"
    >
      <Modal
        opened={removeConfirmOpened}
        onClose={
          () =>
            setRemoveConfirmOpened(false)
        }
        title="Delete graph"
        centered
      >
        <Stack gap="md">
          <Text>
            Delete graph "{graphTitle}"?
          </Text>

          <Text
            size="sm"
            c="dimmed"
          >
            This action cannot be undone.
          </Text>

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                () =>
                  setRemoveConfirmOpened(false)
              }
            >
              Cancel
            </Button>

            <Button
              color="red"
              onClick={
                () => {
                  setRemoveConfirmOpened(false);
                  onRemove();
                }
              }
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={historyOpened}
        onClose={
          () =>
            setHistoryOpened(false)
        }
        title="Graph save history"
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Card withBorder padding="sm">
            <Group
              justify="space-between"
              align="flex-start"
            >
              <div>
                <Group gap="xs">
                  <Badge
                    color="green"
                    variant="light"
                  >
                    CURRENT
                  </Badge>
                  <Text fw={600}>
                    {
                      graph.savedAt
                        ? new Date(
                            graph.savedAt
                          ).toLocaleString()
                        : "Current configuration"
                    }
                  </Text>
                </Group>
                <Text
                  size="xs"
                  c="dimmed"
                  mt={4}
                >
                  {
                    graphVersionSummary(
                      graphSnapshot(graph)
                    )
                  }
                </Text>
              </div>
            </Group>
          </Card>

          {(graph.versions ?? []).length === 0 ? (
            <Alert color="blue">
              No previous saved versions yet. The last five saved states will appear here.
            </Alert>
          ) : (
            (graph.versions ?? []).map(
              (version, index) => (
                <Card
                  key={`${version.savedAt}-${index}`}
                  withBorder
                  padding="sm"
                >
                  <Group
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                  >
                    <div>
                      <Group gap="xs">
                        <Badge
                          variant="light"
                          color="gray"
                        >
                          #{index + 1}
                        </Badge>
                        <Text fw={600}>
                          {
                            new Date(
                              version.savedAt
                            ).toLocaleString()
                          }
                        </Text>
                      </Group>
                      <Text
                        size="xs"
                        c="dimmed"
                        mt={4}
                      >
                        {
                          graphVersionSummary(
                            version.config
                          )
                        }
                      </Text>
                    </div>

                    <Button
                      size="xs"
                      variant="light"
                      onClick={
                        () =>
                          restoreVersion(
                            version
                          )
                      }
                    >
                      Restore
                    </Button>
                  </Group>
                </Card>
              )
            )
          )}

          <Text size="xs" c="dimmed">
            Restore loads the selected version as a preview. Use Save to make it current or Cancel to keep the current graph.
          </Text>
        </Stack>
      </Modal>

      <Stack gap="md">

        <Group
          justify="space-between"
          align="flex-start"
        >
          <div>
            <Group
              gap={4}
              align="center"
              wrap="nowrap"
            >
              {
                editingGraphName
                  ? (
                    <TextInput
                      autoFocus
                      value={
                        graphNameDraft
                      }
                      placeholder={
                        automaticGraphTitle
                      }
                      size="xs"
                      w={280}
                      onChange={
                        event =>
                          setGraphNameDraft(
                            event.currentTarget.value
                          )
                      }
                      onBlur={
                        saveGraphName
                      }
                      onKeyDown={
                        event => {
                          if (
                            event.key ===
                              "Enter"
                          ) {
                            event.currentTarget
                              .blur();
                          } else if (
                            event.key ===
                              "Escape"
                          ) {
                            event.preventDefault();
                            cancelGraphName();
                          }
                        }
                      }
                    />
                  )
                  : (
                    <>
                      <Text fw={700}>
                        {graphTitle}
                      </Text>

                      {
                        graphSelectionSummary && (
                          <Text
                            size="xs"
                            c="dimmed"
                            fw={500}
                          >
                            · {graphSelectionSummary}
                          </Text>
                        )
                      }

                      <Tooltip label="Rename graph">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="green"
                          aria-label="Rename graph"
                          onClick={
                            () => {
                              setGraphNameDraft(
                                workingGraph.name ??
                                  graphTitle
                              );
                              setEditingGraphName(
                                true
                              );
                            }
                          }
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )
              }
            </Group>

            {
              graphSubtitle && (
                <Text
                  size="xs"
                  c="dimmed"
                >
                  {graphSubtitle}
                </Text>
              )
            }

          </div>

          <Group
            gap="xs"
            align="center"
            wrap="wrap"
            justify={
              layout === "half"
                ? "flex-end"
                : undefined
            }
            style={{
              marginLeft:
                layout === "half"
                  ? "auto"
                  : undefined,
              maxWidth:
                layout === "half"
                  ? "100%"
                  : undefined
            }}
          >
            {
              editing
                ? (
                  <>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={saveEditing}
                      disabled={!hasUnsavedChanges}
                    >
                      Save
                    </Button>
                  </>
                )
                : (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={beginEditing}
                  >
                    Edit
                  </Button>
                )
            }

            <Tooltip
              label={
                graph.savedAt && !editing
                  ? `Saved ${new Date(graph.savedAt).toLocaleString()}`
                  : undefined
              }
            >
              <Badge
                size="sm"
                variant="light"
                color={
                  restoredSavedAt
                    ? "violet"
                    : hasUnsavedChanges
                      ? "blue"
                      : editing
                        ? "cyan"
                        : "green"
                }
              >
                {
                  restoredSavedAt
                    ? "RESTORED PREVIEW"
                    : hasUnsavedChanges
                      ? "UNSAVED CHANGES"
                      : editing
                        ? "EDITING"
                        : "SAVED"
                }
              </Badge>
            </Tooltip>

            <Button
              size="xs"
              variant="subtle"
              onClick={
                () =>
                  setHistoryOpened(true)
              }
            >
              History ({(graph.versions ?? []).length})
            </Button>

            <Group gap={4} align="center">
              <Text
                size="xs"
                c="dimmed"
              >
                Graph type
              </Text>

              <SegmentedControl
                size="xs"
                value={mode}
                onChange={
                  value =>
                    updateDraft({
                      ...workingGraph,
                      mode:
                        value as
                          HistoryGraphMode,
                      metricKey:
                        workingGraph.metricKey ?? "",
                      assetIds:
                        workingGraph.assetIds ?? []
                    })
                }
                data={[
                  {
                    label: "Sensor → Metrics",
                    value: "sensor_metrics"
                  },
                  {
                    label: "Metric → Sensors",
                    value: "metric_sensors"
                  }
                ]}
              />
            </Group>

            <Button
              size="xs"
              variant="subtle"
              onClick={exportGraph}
            >
              Export graph
            </Button>

            <Group gap={2}>
              <Tooltip label="Move graph to top">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  disabled={!canMoveUp}
                  aria-label="Move graph to top"
                  onClick={onMoveTop}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 5h12" />
                    <path d="m8 11 4-4 4 4" />
                    <path d="M12 7v12" />
                  </svg>
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Move graph up">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  disabled={!canMoveUp}
                  aria-label="Move graph up"
                  onClick={onMoveUp}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m7 14 5-5 5 5" />
                  </svg>
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Move graph down">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  disabled={!canMoveDown}
                  aria-label="Move graph down"
                  onClick={onMoveDown}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Move graph to bottom">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  disabled={!canMoveDown}
                  aria-label="Move graph to bottom"
                  onClick={onMoveBottom}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 19h12" />
                    <path d="m8 13 4 4 4-4" />
                    <path d="M12 5v12" />
                  </svg>
                </ActionIcon>
              </Tooltip>
            </Group>

            <Tooltip
              label={
                layout === "full"
                  ? "Use half width"
                  : "Use full width"
              }
            >
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={
                  layout === "full"
                    ? "Use half width"
                    : "Use full width"
                }
                onClick={
                  () =>
                    updateDraft({
                      ...workingGraph,
                      layout:
                        layout === "full"
                          ? "half"
                          : "full"
                    })
                }
              >
                {
                  layout === "full"
                    ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="3"
                          y="5"
                          width="8"
                          height="14"
                          rx="1"
                        />
                        <rect
                          x="13"
                          y="5"
                          width="8"
                          height="14"
                          rx="1"
                        />
                      </svg>
                    )
                    : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="3"
                          y="5"
                          width="18"
                          height="14"
                          rx="1"
                        />
                      </svg>
                    )
                }
              </ActionIcon>
            </Tooltip>

            <Tooltip
              label={
                workingGraph.collapsed
                  ? "Expand graph"
                  : "Collapse graph"
              }
            >
              <ActionIcon
                variant="subtle"
                aria-label={
                  workingGraph.collapsed
                    ? "Expand graph"
                    : "Collapse graph"
                }
                onClick={
                  () =>
                    updateDraft({
                      ...workingGraph,
                      collapsed:
                        !workingGraph.collapsed
                    })
                }
              >
                {
                  workingGraph.collapsed
                    ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 15 6-6 6 6" />
                      </svg>
                    )
                    : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )
                }
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Remove graph">
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Remove graph"
                onClick={
                  () =>
                    setRemoveConfirmOpened(
                      true
                    )
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="m8 11 1 8h6l1-8" />
                </svg>
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {
          !workingGraph.collapsed && (
            <>
              {
                mode === "sensor_metrics"
                  ? (
                    <Group
                      align={
                        layout === "half"
                          ? "stretch"
                          : "flex-end"
                      }
                      wrap="wrap"
                      style={{
                        flexDirection:
                          layout === "half"
                            ? "column"
                            : "row"
                      }}
                    >
                      <Select
                        label="Sensor"
                        searchable
                        placeholder="Select a sensor"
                        value={
                          workingGraph.assetId || null
                        }
                        data={
                          assets
                            .filter(
                              current =>
                                current.sensor !== null
                            )
                            .map(current => ({
                              value:
                                current.id,
                              label:
                                current.sensor?.uid
                                  ? `${assetLabel(current)} · ${current.sensor.uid}`
                                  : assetLabel(current)
                            }))
                            .sort(
                              (left, right) =>
                                left.label.localeCompare(
                                  right.label
                                )
                            )
                        }
                        onChange={
                          value =>
                            updateDraft({
                              ...workingGraph,
                              mode:
                                "sensor_metrics",
                              assetId:
                                value ?? "",
                              metricIds: []
                            })
                        }
                        style={{
                          flex:
                            layout === "half"
                              ? "1 1 auto"
                              : "0 1 30%",
                          width:
                            layout === "half"
                              ? "100%"
                              : undefined
                        }}
                      />

                      <MultiSelect
                        label="Metrics"
                        searchable
                        clearable
                        placeholder={
                          asset
                            ? "Select metrics"
                            : "Select a sensor first"
                        }
                        disabled={!asset}
                        value={
                          workingGraph.metricIds
                        }
                        data={
                          metrics.map(
                            metric => ({
                              value:
                                metric.id,
                              label:
                                metric.unit
                                  ? `${metric.displayName} (${metric.unit})`
                                  : metric.displayName
                            })
                          )
                        }
                        onChange={
                          metricIds =>
                            updateDraft({
                              ...workingGraph,
                              mode:
                                "sensor_metrics",
                              metricIds
                            })
                        }
                        style={{
                          flex:
                            layout === "half"
                              ? "1 1 auto"
                              : "1 1 68%",
                          width:
                            layout === "half"
                              ? "100%"
                              : undefined
                        }}
                      />
                    </Group>
                  )
                  : (
                    <Group
                      align={
                        layout === "half"
                          ? "stretch"
                          : "flex-end"
                      }
                      wrap="wrap"
                      style={{
                        flexDirection:
                          layout === "half"
                            ? "column"
                            : "row"
                      }}
                    >
                      <Select
                        label="Metric"
                        searchable
                        placeholder="Select a metric"
                        value={
                          selectedMetricKey ||
                          null
                        }
                        data={
                          metricOptions
                        }
                        onChange={
                          value => {
                            const nextMetricKey =
                              value ?? "";
                            const previousIds =
                              workingGraph.assetIds ?? [];
                            const compatibleIds =
                              previousIds.filter(
                                assetId =>
                                  assets.some(
                                    current =>
                                      current.id === assetId &&
                                      current.sensor !== null &&
                                      current.metrics.some(
                                        metric =>
                                          metric.enabled &&
                                          metric.key === nextMetricKey
                                      )
                                  )
                              );
                            const removed =
                              previousIds.length -
                              compatibleIds.length;

                            setSelectionNotice(
                              removed > 0
                                ? `${removed} sensor${removed === 1 ? "" : "s"} removed because ${removed === 1 ? "it does" : "they do"} not expose ${nextMetricKey || "the selected metric"}.`
                                : null
                            );

                            updateDraft({
                              ...workingGraph,
                              mode:
                                "metric_sensors",
                              metricKey:
                                nextMetricKey,
                              assetIds:
                                compatibleIds
                            });
                          }
                        }
                        style={{
                          flex:
                            layout === "half"
                              ? "1 1 auto"
                              : "0 1 30%",
                          width:
                            layout === "half"
                              ? "100%"
                              : undefined
                        }}
                      />

                      <MultiSelect
                        label="Sensors"
                        searchable
                        clearable
                        placeholder={
                          selectedMetricKey
                            ? "Select sensors"
                            : "Select a metric first"
                        }
                        disabled={
                          !selectedMetricKey
                        }
                        value={
                          comparisonAssetIds
                            .filter(
                              assetId =>
                                eligibleAssets
                                  .some(
                                    current =>
                                      current.id ===
                                        assetId
                                  )
                            )
                        }
                        data={
                          eligibleAssets.map(
                            current => ({
                              value:
                                current.id,
                              label:
                                current.sensor?.uid
                                  ? `${assetLabel(current)} · ${current.sensor.uid}`
                                  : assetLabel(current)
                            })
                          )
                        }
                        onChange={
                          assetIds =>
                            updateDraft({
                              ...workingGraph,
                              mode:
                                "metric_sensors",
                              assetIds
                            })
                        }
                        style={{
                          flex:
                            layout === "half"
                              ? "1 1 auto"
                              : "1 1 68%",
                          width:
                            layout === "half"
                              ? "100%"
                              : undefined
                        }}
                      />
                    </Group>
                  )
              }

              {
                selectionNotice && (
                  <Alert
                    color="yellow"
                    title="Sensor selection adjusted"
                  >
                    {selectionNotice}
                  </Alert>
                )
              }

              <div>
                <Text
                  size="sm"
                  fw={500}
                  mb={3}
                >
                  Period
                </Text>

                <SegmentedControl
                  value={String(workingGraph.hours)}
                  onChange={
                    value =>
                      updateDraft({
                        ...workingGraph,
                        hours:
                          Number(value)
                      })
                  }
                  data={PERIODS}
                />
              </div>

              <Group
                gap="lg"
                align="flex-end"
                wrap="wrap"
              >
                <div>
                  <Text
                    size="sm"
                    fw={500}
                    mb={3}
                  >
                    Curve
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={
                      workingGraph.curveStyle ??
                      "smooth"
                    }
                    onChange={
                      value =>
                        updateDraft({
                          ...workingGraph,
                          curveStyle:
                            value as HistoryCurveStyle
                        })
                    }
                    data={[
                      {
                        label: "Raw",
                        value: "raw"
                      },
                      {
                        label: "Smooth",
                        value: "smooth"
                      }
                    ]}
                  />
                </div>

                <Select
                  label="Smoothing"
                  value={
                    workingGraph.smoothing
                      ?.method ??
                    "moving_average"
                  }
                  data={[
                    {
                      label: "None",
                      value: "none"
                    },
                    {
                      label: "Moving average",
                      value: "moving_average"
                    },
                    {
                      label: "Median",
                      value: "median"
                    }
                  ]}
                  onChange={
                    value =>
                      updateDraft({
                        ...workingGraph,
                        smoothing: {
                          method:
                            (value ?? "moving_average") as HistorySmoothingMethod,
                          window:
                            workingGraph.smoothing
                              ?.window ?? 7
                        }
                      })
                  }
                  w={180}
                />

                {
                  (
                    workingGraph.smoothing
                      ?.method ??
                    "moving_average"
                  ) !== "none" && (
                    <SegmentedControl
                      size="xs"
                      value={
                        String(
                          workingGraph.smoothing
                            ?.window ?? 7
                        )
                      }
                      onChange={
                        value =>
                          updateDraft({
                            ...workingGraph,
                            smoothing: {
                              method:
                                workingGraph.smoothing
                                  ?.method ??
                                "moving_average",
                              window:
                                Number(value) as HistorySmoothingWindow
                            }
                          })
                      }
                      data={[
                        { label: "3", value: "3" },
                        { label: "5", value: "5" },
                        { label: "7", value: "7" },
                        { label: "9", value: "9" },
                        { label: "11", value: "11" }
                      ]}
                    />
                  )
                }
              </Group>

              {
                yAxisUnits.length > 0 && (
                  <Stack gap="xs">
                    {
                      yAxisUnits.map(unit => {
                        const config =
                          yAxes[unit] ?? {
                            mode: "auto" as const
                          };

                        const automatic =
                          autoYAxisBounds[unit];

                        const fixedInvalid =
                          config.mode === "fixed" &&
                          (
                            typeof config.min !== "number" ||
                            typeof config.max !== "number" ||
                            config.min >= config.max
                          );

                        return (
                          <Group
                            key={unit}
                            gap="sm"
                            align="flex-end"
                            wrap="wrap"
                          >
                            <div>
                              <Text
                                size="sm"
                                fw={500}
                                mb={3}
                              >
                                Y axis {unit}
                              </Text>

                              <SegmentedControl
                                size="xs"
                                value={
                                  config.mode
                                }
                                onChange={
                                  value =>
                                    setYAxisMode(
                                      unit,
                                      value as HistoryYAxisMode
                                    )
                                }
                                data={[
                                  {
                                    label: "Auto",
                                    value: "auto"
                                  },
                                  {
                                    label: "Fixed",
                                    value: "fixed"
                                  }
                                ]}
                              />
                            </div>

                            {
                              config.mode === "fixed" && (
                                <>
                                  <NumberInput
                                    label="Min"
                                    value={
                                      config.min ?? ""
                                    }
                                    placeholder={
                                      automatic
                                        ? String(automatic.min)
                                        : "Min"
                                    }
                                    onChange={
                                      value =>
                                        updateYAxis(
                                          unit,
                                          {
                                            ...config,
                                            min:
                                              typeof value === "number" &&
                                              Number.isFinite(value)
                                                ? value
                                                : undefined
                                          }
                                        )
                                    }
                                    error={
                                      fixedInvalid
                                        ? "Min must be lower than Max"
                                        : undefined
                                    }
                                    w={130}
                                  />

                                  <NumberInput
                                    label="Max"
                                    value={
                                      config.max ?? ""
                                    }
                                    placeholder={
                                      automatic
                                        ? String(automatic.max)
                                        : "Max"
                                    }
                                    onChange={
                                      value =>
                                        updateYAxis(
                                          unit,
                                          {
                                            ...config,
                                            max:
                                              typeof value === "number" &&
                                              Number.isFinite(value)
                                                ? value
                                                : undefined
                                          }
                                        )
                                    }
                                    error={
                                      fixedInvalid
                                        ? "Min must be lower than Max"
                                        : undefined
                                    }
                                    w={130}
                                  />
                                </>
                              )
                            }

                            {
                              config.mode === "auto" &&
                              automatic && (
                                <Text
                                  size="xs"
                                  c="dimmed"
                                  pb={6}
                                >
                                  {automatic.min} → {automatic.max}
                                </Text>
                              )
                            }
                          </Group>
                        );
                      })
                    }
                  </Stack>
                )
              }

              {
                mode === "sensor_metrics"
                  ? (
                    !asset
                      ? (
                        <Alert color="blue">
                          Select a sensor to configure this graph.
                        </Alert>
                      )
                      : selectedMetrics.length === 0
                        ? (
                          <Alert color="blue">
                            Select at least one metric.
                          </Alert>
                        )
                        : error
                          ? (
                            <Alert
                              color="red"
                              title="Unable to load history"
                            >
                              One or more metric series could not be loaded.
                            </Alert>
                          )
                          : loading
                            ? (
                              <Loader />
                            )
                            : (
                              <HistoryChart
                                hours={
                                  workingGraph.hours
                                }
                                series={
                                  chartSeries
                                }
                                yAxes={
                                  yAxes
                                }
                                curveStyle={
                                  workingGraph.curveStyle
                                }
                                smoothing={
                                  workingGraph.smoothing
                                }
                              />
                            )
                  )
                  : comparisonNeedsMetric
                    ? (
                      <Alert color="blue">
                        Select a metric to compare sensors.
                      </Alert>
                    )
                    : comparisonNeedsSensors
                      ? (
                        <Alert color="blue">
                          Select at least one sensor.
                        </Alert>
                      )
                      : error
                        ? (
                          <Alert
                            color="red"
                            title="Unable to load history"
                          >
                            One or more sensor series could not be loaded.
                          </Alert>
                        )
                        : loading
                          ? (
                            <Loader />
                          )
                          : (
                            <>
                              {
                                seriesTargets.length >=
                                  10 && (
                                  <Alert color="yellow">
                                    {seriesTargets.length} sensors selected — graph readability may decrease.
                                  </Alert>
                                )
                              }

                              <HistoryChart
                                hours={
                                  workingGraph.hours
                                }
                                series={
                                  chartSeries
                                }
                                yAxes={
                                  yAxes
                                }
                                curveStyle={
                                  workingGraph.curveStyle
                                }
                                smoothing={
                                  workingGraph.smoothing
                                }
                              />
                            </>
                          )
              }
            </>
          )
        }

      </Stack>
    </Card>
  );
}


function latestNumericSeriesValue(
  series: HistoryChartSeries
): number | null {

  const aggregate =
    [...series.aggregates]
      .reverse()
      .find(
        point =>
          point.avg !== null
      );

  if (
    aggregate &&
    aggregate.avg !== null
  ) {
    return aggregate.avg;
  }

  const raw =
    [...series.history]
      .reverse()
      .find(
        point =>
          typeof point.value ===
            "number"
      );

  return (
    raw &&
    typeof raw.value === "number"
  )
    ? raw.value
    : null;
}

function formatCurrentValue(
  value: number,
  unit: string | null
): string {

  const formatted =
    Number.isInteger(value)
      ? String(value)
      : value.toLocaleString(
          undefined,
          {
            maximumFractionDigits: 2
          }
        );

  return unit
    ? `${formatted} ${unit}`
    : formatted;
}

export function HistoryPanel() {

  const queryClient =
    useQueryClient();

  const [
    metricColorsOpened,
    setMetricColorsOpened
  ] =
    React.useState(false);

  const [
    metricColorDrafts,
    setMetricColorDrafts
  ] =
    React.useState<
      Record<string, string>
    >({});

  const [
    refreshing,
    setRefreshing
  ] =
    React.useState(
      false
    );

  const [
    historyConfigReady,
    setHistoryConfigReady
  ] = React.useState(false);

  const [
    historyConfigError,
    setHistoryConfigError
  ] = React.useState<string | null>(
    null
  );

  const importInputRef =
    React.useRef<HTMLInputElement>(
      null
    );

  const [
    importDialogOpened,
    setImportDialogOpened
  ] =
    React.useState(false);

  const [
    importKind,
    setImportKind
  ] =
    React.useState<
      "graph" |
      "tab" |
      "config" |
      null
    >(null);

  const [
    importPayload,
    setImportPayload
  ] =
    React.useState<unknown>(
      null
    );

  const [
    importAction,
    setImportAction
  ] =
    React.useState<string>(
      ""
    );

  const [
    importTargetGraphId,
    setImportTargetGraphId
  ] =
    React.useState<string | null>(
      null
    );

  const [
    graphIdToScrollTo,
    setGraphIdToScrollTo
  ] =
    React.useState<string | null>(
      null
    );

  const [
    editingTabId,
    setEditingTabId
  ] =
    React.useState<string | null>(
      null
    );

  const [
    tabNameDraft,
    setTabNameDraft
  ] =
    React.useState("");

  const [
    draggedTabId,
    setDraggedTabId
  ] =
    React.useState<
      string | null
    >(
      null
    );

  const assetsQuery =
    useQuery({
      queryKey: ["assets"],
      queryFn: getAssets,
      refetchInterval: 30_000
    });

  const metricDisplaySettingsQuery =
    useQuery({
      queryKey:
        ["metric-display-settings"],
      queryFn:
        getMetricDisplaySettings
    });

  const saveMetricColorsMutation =
    useMutation({
      mutationFn:
        async (
          colors:
            Record<string, string>
        ) => {
          await Promise.all(
            Object.entries(colors)
              .map(
                ([metricKey, color]) =>
                  updateMetricDisplaySetting(
                    metricKey,
                    color
                  )
              )
          );
        },

      onSuccess:
        async () => {
          await queryClient
            .invalidateQueries({
              queryKey:
                ["metric-display-settings"]
            });

          setMetricColorsOpened(
            false
          );
        }
    });

  const [
    tabs,
    setTabs
  ] =
    usePersistentState<HistoryTabConfig[]>(
      "history.tabs.v1",
      [
        {
          id:
            "history-tab-default",
          name:
            "History 1",
          graphs:
            []
        }
      ],
      isHistoryTabs
    );

  const [
    activeTabId,
    setActiveTabId
  ] =
    usePersistentState<string>(
      "history.activeTabId",
      "history-tab-default",
      (
        value
      ): value is string =>
        typeof value === "string"
    );

  const activeTab =
    tabs.find(
      tab =>
        tab.id === activeTabId
    )
    ?? tabs[0];

  const graphs =
    activeTab?.graphs
    ?? [];

  const setGraphs =
    (
      nextGraphs:
        HistoryGraphConfig[]
    ): void => {

      if (!activeTab) {
        return;
      }

      setTabs(
        tabs.map(
          tab =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  graphs:
                    nextGraphs
                }
              : tab
        )
      );
    };

  React.useEffect(
    () => {
      if (!graphIdToScrollTo) {
        return;
      }

      const frame =
        window.requestAnimationFrame(
          () => {
            const element =
              document.getElementById(
                `history-graph-${graphIdToScrollTo}`
              );

            if (element) {
              element.scrollIntoView({
                behavior: "smooth",
                block: "center"
              });
            }

            setGraphIdToScrollTo(
              null
            );
          }
        );

      return () =>
        window.cancelAnimationFrame(
          frame
        );
    },
    [
      graphIdToScrollTo,
      graphs
    ]
  );

  const [
    refreshIntervalMs,
    setRefreshIntervalMs
  ] =
    usePersistentState<number>(
      "history.refreshIntervalMs",
      60_000,
      isRefreshInterval
    );

  React.useEffect(
    () => {
      let cancelled = false;

      const load = async (): Promise<void> => {
        try {
          const response =
            await fetch(
              "/api/v1/history-config"
            );

          if (response.ok) {
            const config =
              normalizeHistoryConfig(
                await response.json()
              );

            if (!config) {
              throw new Error(
                "Backend History configuration is invalid."
              );
            }

            if (!cancelled) {
              setTabs(config.tabs);
              setActiveTabId(
                config.activeTabId
              );
              setRefreshIntervalMs(
                config.refreshIntervalMs
              );
            }
          } else if (response.status === 404) {
            const localConfig =
              createHistoryConfig(
                activeTabId,
                refreshIntervalMs,
                tabs
              );

            const saveResponse =
              await fetch(
                "/api/v1/history-config",
                {
                  method: "PUT",
                  headers: {
                    "Content-Type":
                      "application/json"
                  },
                  body: JSON.stringify(
                    localConfig
                  )
                }
              );

            if (!saveResponse.ok) {
              throw new Error(
                "Unable to migrate local History configuration to the backend."
              );
            }
          } else {
            throw new Error(
              `Unable to load History configuration (${response.status}).`
            );
          }
        } catch (error) {
          if (!cancelled) {
            setHistoryConfigError(
              error instanceof Error
                ? error.message
                : "Unable to load History configuration."
            );
          }
        } finally {
          if (!cancelled) {
            setHistoryConfigReady(true);
          }
        }
      };

      void load();

      return () => {
        cancelled = true;
      };
    }, []);

  React.useEffect(
    () => {
      if (!historyConfigReady) {
        return;
      }

      const timeout =
        window.setTimeout(
          () => {
            const config =
              createHistoryConfig(
                activeTabId,
                refreshIntervalMs,
                tabs
              );

            void fetch(
              "/api/v1/history-config",
              {
                method: "PUT",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body: JSON.stringify(
                  config
                )
              }
            )
              .then(response => {
                if (!response.ok) {
                  throw new Error(
                    `Unable to save History configuration (${response.status}).`
                  );
                }

                setHistoryConfigError(
                  null
                );
              })
              .catch(error => {
                setHistoryConfigError(
                  error instanceof Error
                    ? error.message
                    : "Unable to save History configuration."
                );
              });
          },
          500
        );

      return () =>
        window.clearTimeout(
          timeout
        );
    }, [
      activeTabId,
      historyConfigReady,
      refreshIntervalMs,
      tabs
    ]
  );

  React.useEffect(
    () => {
      if (
        !tabs.some(
          tab =>
            tab.id === activeTabId
        )
      ) {
        setActiveTabId(
          tabs[0].id
        );
      }
    },
    [
      activeTabId,
      setActiveTabId,
      tabs
    ]
  );

  React.useEffect(
    () => {
      if (
        historyConfigReady &&
        tabs.length === 1 &&
        tabs[0].id === "history-tab-default" &&
        tabs[0].graphs.length === 0
      ) {
        try {
          const legacy =
            JSON.parse(
              localStorage.getItem(
                "history.graphs.v2"
              )
              ?? "null"
            );

          if (
            isHistoryGraphs(
              legacy
            ) &&
            legacy.length > 0
          ) {
            setTabs([
              {
                ...tabs[0],
                graphs:
                  legacy
              }
            ]);
          }
        } catch {}
      }
    },
    [
      historyConfigReady,
      setTabs,
      tabs
    ]
  );

  React.useEffect(
    () => {
      if (
        historyConfigReady &&
        graphs.length === 0 &&
        (assetsQuery.data?.length ?? 0) > 0
      ) {
        const firstAsset =
          assetsQuery.data!.find(
            asset =>
              asset.sensor !== null
          );

        const firstMetrics =
          firstAsset?.metrics
            .filter(metric => metric.enabled)
            .filter(
              metric =>
                metric.key === "temperature" ||
                metric.key === "humidity"
            )
            .map(metric => metric.id)
          ?? [];

        setGraphs([
          {
            ...newGraph(),
            assetId:
              firstAsset?.id ?? "",
            metricIds:
              firstMetrics
          }
        ]);
      }
    }, [
      assetsQuery.data,
      graphs.length,
      historyConfigReady,
      setGraphs
    ]
  );

  if (assetsQuery.isLoading) {
    return <Loader />;
  }

  if (assetsQuery.isError) {
    return (
      <Alert
        color="red"
        title="Unable to load history"
      >
        Assets could not be loaded.
      </Alert>
    );
  }

  const assets =
    assetsQuery.data ?? [];

  const metricDisplaySettings =
    metricDisplaySettingsQuery.data
    ?? [];

  const metricColors =
    new Map(
      metricDisplaySettings.map(
        setting => [
          setting.metricKey,
          setting.color
        ]
      )
    );

  const metricKeys =
    Array.from(
      new Set(
        assets.flatMap(
          asset =>
            asset.metrics.map(
              metric => metric.key
            )
        )
      )
    ).sort(
      (left, right) =>
        left.localeCompare(
          right,
          undefined,
          {
            sensitivity: "base"
          }
        )
    );

  const openMetricColors =
    (): void => {

      setMetricColorDrafts(
        Object.fromEntries(
          metricKeys.map(
            metricKey => [
              metricKey,
              metricColors.get(
                metricKey
              ) ??
              defaultMetricColor(
                metricKey
              )
            ]
          )
        )
      );

      setMetricColorsOpened(
        true
      );
    };

  const exportHistoryConfig =
    (): void => {

      downloadJson(
        "sensorsphere-history-config.json",
        createHistoryConfig(
          activeTabId,
          refreshIntervalMs,
          tabs
        )
      );
    };

  const handleImportFile =
    async (
      event: React.ChangeEvent<HTMLInputElement>
    ): Promise<void> => {

      const file =
        event.currentTarget.files?.[0];

      event.currentTarget.value = "";

      if (!file) {
        return;
      }

      try {
        const parsed: unknown =
          JSON.parse(
            await file.text()
          );

        const typed =
          parsed as {
            type?: unknown;
            version?: unknown;
            graph?: unknown;
            tab?: unknown;
          };

        if (
          typed.type ===
            "sensorsphere-history-graph" &&
          typed.version === 1 &&
          isHistoryGraphs([
            typed.graph
          ])
        ) {
          setImportKind("graph");
          setImportPayload(
            normalizedGraph(
              typed.graph as
                HistoryGraphConfig
            )
          );
          setImportAction(
            "add_graph"
          );
          setImportTargetGraphId(
            graphs[0]?.id ?? null
          );
        } else if (
          typed.type ===
            "sensorsphere-history-tab" &&
          typed.version === 1 &&
          isHistoryTabs([
            typed.tab
          ])
        ) {
          setImportKind("tab");
          setImportPayload(
            normalizeHistoryTabs([
              typed.tab as
                HistoryTabConfig
            ])[0]
          );
          setImportAction(
            "add_tab"
          );
        } else {
          const config =
            normalizeHistoryConfig(
              parsed
            );

          if (!config) {
            throw new Error(
              "Invalid SensorSphere History JSON file."
            );
          }

          setImportKind("config");
          setImportPayload(config);
          setImportAction(
            "replace_config"
          );
        }

        setImportDialogOpened(true);
        setHistoryConfigError(null);
      } catch (error) {
        setHistoryConfigError(
          error instanceof Error
            ? error.message
            : "Unable to import History JSON file."
        );
      }
    };

  const exportActiveTab =
    (): void => {

      if (!activeTab) {
        return;
      }

      const normalizedTab =
        normalizeHistoryTabs([
          activeTab
        ])[0];

      downloadJson(
        `sensorsphere-history-tab-${activeTab.id}.json`,
        {
          type:
            "sensorsphere-history-tab",
          version: 1,
          tab: normalizedTab
        }
      );
    };

  const confirmImport =
    (): void => {

      if (
        importKind === "graph" &&
        importPayload
      ) {
        const imported =
          importPayload as
            HistoryGraphConfig;

        if (
          importAction ===
            "replace_graph" &&
          importTargetGraphId
        ) {
          setGraphs(
            graphs.map(
              graph =>
                graph.id ===
                  importTargetGraphId
                  ? {
                      ...imported,
                      id:
                        importTargetGraphId
                    }
                  : graph
            )
          );
        } else {
          setGraphs([
            ...graphs,
            {
              ...imported,
              id:
                importedGraphId()
            }
          ]);
        }
      } else if (
        importKind === "tab" &&
        importPayload
      ) {
        const imported =
          importPayload as
            HistoryTabConfig;

        const remappedGraphs =
          imported.graphs.map(
            (graph, index) => ({
              ...graph,
              id:
                importedGraphId(
                  `${index}-`
                )
            })
          );

        if (
          importAction ===
            "replace_tab" &&
          activeTab
        ) {
          setTabs(
            tabs.map(
              tab =>
                tab.id ===
                  activeTab.id
                  ? {
                      ...imported,
                      id:
                        activeTab.id,
                      graphs:
                        remappedGraphs
                    }
                  : tab
            )
          );
        } else {
          const importedTab:
            HistoryTabConfig = {
              ...imported,
              id:
                `history-tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              graphs:
                remappedGraphs
            };

          setTabs([
            ...tabs,
            importedTab
          ]);

          setActiveTabId(
            importedTab.id
          );
        }
      } else if (
        importKind === "config" &&
        importPayload
      ) {
        const config =
          importPayload as
            HistoryConfig;

        setTabs(config.tabs);
        setActiveTabId(
          config.activeTabId
        );
        setRefreshIntervalMs(
          config.refreshIntervalMs
        );
      }

      setImportDialogOpened(false);
      setImportKind(null);
      setImportPayload(null);
      setImportAction("");
      setImportTargetGraphId(null);
      setHistoryConfigError(null);
    };

  const addTab =
    (): void => {

      const tab =
        newTab(
          tabs.length + 1
        );

      setTabs([
        ...tabs,
        tab
      ]);

      setActiveTabId(
        tab.id
      );
    };

  const startRenameTab =
    (
      tab: HistoryTabConfig
    ): void => {

      setEditingTabId(
        tab.id
      );
      setTabNameDraft(
        tab.name
      );
    };

  const saveTabName =
    (
      tabId: string
    ): void => {

      const nextName =
        tabNameDraft.trim();

      if (nextName) {
        setTabs(
          tabs.map(
            current =>
              current.id === tabId
                ? {
                    ...current,
                    name:
                      nextName
                  }
                : current
          )
        );
      }

      setEditingTabId(null);
      setTabNameDraft("");
    };

  const cancelTabName =
    (): void => {

      setEditingTabId(null);
      setTabNameDraft("");
    };

  const removeTab =
    (
      tabId: string
    ): void => {

      if (
        tabs.length <= 1
      ) {
        return;
      }

      const currentIndex =
        tabs.findIndex(
          tab =>
            tab.id === tabId
        );

      const nextTabs =
        tabs.filter(
          tab =>
            tab.id !== tabId
        );

      setTabs(
        nextTabs
      );

      if (
        activeTabId === tabId
      ) {
        setActiveTabId(
          nextTabs[
            Math.max(
              0,
              currentIndex - 1
            )
          ]?.id
          ?? nextTabs[0].id
        );
      }
    };

  const reorderTab =
    (
      sourceId: string,
      targetId: string
    ): void => {

      if (
        sourceId === targetId
      ) {
        return;
      }

      const sourceIndex =
        tabs.findIndex(
          tab =>
            tab.id === sourceId
        );

      const targetIndex =
        tabs.findIndex(
          tab =>
            tab.id === targetId
        );

      if (
        sourceIndex < 0 ||
        targetIndex < 0
      ) {
        return;
      }

      const next =
        [...tabs];

      const [
        moved
      ] =
        next.splice(
          sourceIndex,
          1
        );

      next.splice(
        targetIndex,
        0,
        moved
      );

      setTabs(
        next
      );
    };

  const updateGraph =
    (
      id: string,
      next: HistoryGraphConfig
    ): void => {
      setGraphs(
        graphs.map(
          graph =>
            graph.id === id
              ? next
              : graph
        )
      );
    };

  const moveGraph =
    (
      index: number,
      direction: -1 | 1
    ): void => {

      const targetIndex =
        index + direction;

      if (
        targetIndex < 0 ||
        targetIndex >=
          graphs.length
      ) {
        return;
      }

      const movedGraphId =
        graphs[index]?.id;

      const next =
        [...graphs];

      [
        next[index],
        next[targetIndex]
      ] = [
        next[targetIndex],
        next[index]
      ];

      if (movedGraphId) {
        setGraphIdToScrollTo(
          movedGraphId
        );
      }

      setGraphs(
        next
      );
    };

  const moveGraphTo =
    (
      index: number,
      targetIndex: number
    ): void => {

      if (
        index === targetIndex ||
        index < 0 ||
        targetIndex < 0 ||
        index >= graphs.length ||
        targetIndex >= graphs.length
      ) {
        return;
      }

      const movedGraphId =
        graphs[index]?.id;

      const next =
        [...graphs];

      const [moved] =
        next.splice(
          index,
          1
        );

      next.splice(
        targetIndex,
        0,
        moved
      );

      if (movedGraphId) {
        setGraphIdToScrollTo(
          movedGraphId
        );
      }

      setGraphs(next);
    };

  const setAllCollapsed =
    (
      collapsed: boolean
    ): void => {

      setGraphs(
        graphs.map(
          graph => ({
            ...graph,
            collapsed
          })
        )
      );
    };

  const refreshNow =
    async (): Promise<void> => {

      setRefreshing(
        true
      );

      try {
        await queryClient
          .refetchQueries({
            type:
              "active",

            predicate:
              query =>
                query.queryKey[0] ===
                  "observation-history" ||
                query.queryKey[0] ===
                  "observation-aggregate"
          });
      } finally {
        setRefreshing(
          false
        );
      }
    };

  return (
    <Stack gap="lg">

      <Group
        gap="xs"
        align="center"
        wrap="wrap"
      >
        {
          tabs.map(
            tab => (
              <Group
                key={tab.id}
                gap={1}
                draggable={
                  editingTabId !==
                    tab.id
                }
                onDragStart={
                  event => {
                    setDraggedTabId(
                      tab.id
                    );

                    event.dataTransfer
                      .setData(
                        "text/plain",
                        tab.id
                      );

                    event.dataTransfer
                      .effectAllowed =
                      "move";
                  }
                }
                onDragEnd={
                  () =>
                    setDraggedTabId(
                      null
                    )
                }
                onDragOver={
                  event => {
                    event.preventDefault();

                    event.dataTransfer
                      .dropEffect =
                      "move";
                  }
                }
                onDrop={
                  event => {
                    event.preventDefault();

                    const sourceId =
                      draggedTabId
                      ?? event.dataTransfer
                        .getData(
                          "text/plain"
                        );

                    if (sourceId) {
                      reorderTab(
                        sourceId,
                        tab.id
                      );
                    }

                    setDraggedTabId(
                      null
                    );
                  }
                }
                style={{
                  cursor:
                    editingTabId ===
                      tab.id
                      ? "default"
                      : "grab",
                  opacity:
                    draggedTabId ===
                      tab.id
                      ? 0.55
                      : 1
                }}
              >
                {
                  editingTabId ===
                    tab.id
                    ? (
                      <TextInput
                        autoFocus
                        size="xs"
                        value={
                          tabNameDraft
                        }
                        w={150}
                        onChange={
                          event =>
                            setTabNameDraft(
                              event.currentTarget.value
                            )
                        }
                        onBlur={
                          () =>
                            saveTabName(
                              tab.id
                            )
                        }
                        onKeyDown={
                          event => {
                            if (
                              event.key ===
                                "Enter"
                            ) {
                              event.currentTarget
                                .blur();
                            } else if (
                              event.key ===
                                "Escape"
                            ) {
                              event.preventDefault();
                              cancelTabName();
                            }
                          }
                        }
                      />
                    )
                    : (
                      <Button
                        size="xs"
                        variant={
                          tab.id === activeTab?.id
                            ? "filled"
                            : "default"
                        }
                        onClick={
                          () =>
                            setActiveTabId(
                              tab.id
                            )
                        }
                        title="Drag to reorder"
                        styles={{
                          inner: {
                            gap: 2
                          }
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display:
                              "inline-flex",
                            marginLeft:
                              -7,
                            marginRight:
                              1,
                            opacity:
                              0.65
                          }}
                        >
                          <svg
                            width="10"
                            height="14"
                            viewBox="0 0 10 14"
                            fill="currentColor"
                          >
                            <circle cx="3" cy="3" r="1" />
                            <circle cx="7" cy="3" r="1" />
                            <circle cx="3" cy="7" r="1" />
                            <circle cx="7" cy="7" r="1" />
                            <circle cx="3" cy="11" r="1" />
                            <circle cx="7" cy="11" r="1" />
                          </svg>
                        </span>

                        {tab.name}
                      </Button>
                    )
                }

                {
                  editingTabId !==
                    tab.id && (
                    <Tooltip label="Rename tab">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="green"
                        aria-label="Rename tab"
                        onClick={
                          () =>
                            startRenameTab(
                              tab
                            )
                        }
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </ActionIcon>
                    </Tooltip>
                  )
                }

                <Tooltip label="Delete tab">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    disabled={
                      tabs.length <= 1
                    }
                    aria-label="Delete tab"
                    onClick={
                      () =>
                        removeTab(
                          tab.id
                        )
                    }
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 7h16" />
                      <path d="M9 7V4h6v3" />
                      <path d="m8 11 1 8h6l1-8" />
                    </svg>
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          )
        }

        <Button
          size="xs"
          variant="light"
          onClick={
            addTab
          }
        >
          + Add tab
        </Button>

        <Button
          size="xs"
          variant="default"
          disabled={!activeTab}
          onClick={
            exportActiveTab
          }
        >
          Export tab
        </Button>

      </Group>

      {historyConfigError && (
        <Alert
          color="red"
          title="History configuration"
        >
          {historyConfigError}
        </Alert>
      )}

      {metricDisplaySettingsQuery.isError && (
        <Alert
          color="yellow"
          title="Metric colors"
        >
          Unable to load saved metric colors. Default colors are being used.
        </Alert>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={
          event =>
            void handleImportFile(
              event
            )
        }
      />

      <Modal
        opened={importDialogOpened}
        onClose={
          () =>
            setImportDialogOpened(
              false
            )
        }
        title={
          importKind === "graph"
            ? "Import graph"
            : importKind === "tab"
              ? "Import tab"
              : "Import History configuration"
        }
        centered
      >
        <Stack gap="md">
          {
            importKind === "graph" && (
              <>
                <SegmentedControl
                  value={importAction}
                  onChange={
                    setImportAction
                  }
                  data={[
                    {
                      label:
                        "Add to current tab",
                      value:
                        "add_graph"
                    },
                    {
                      label:
                        "Replace graph",
                      value:
                        "replace_graph"
                    }
                  ]}
                />

                {
                  importAction ===
                    "replace_graph" && (
                    <Select
                      label="Graph to replace"
                      value={
                        importTargetGraphId
                      }
                      data={
                        graphs.map(
                          graph => ({
                            value:
                              graph.id,
                            label:
                              graph.name
                                ?.trim() ||
                              "Unnamed graph"
                          })
                        )
                      }
                      onChange={
                        setImportTargetGraphId
                      }
                      placeholder="Select a graph"
                    />
                  )
                }
              </>
            )
          }

          {
            importKind === "tab" && (
              <SegmentedControl
                value={importAction}
                onChange={
                  setImportAction
                }
                data={[
                  {
                    label:
                      "Add as new tab",
                    value:
                      "add_tab"
                  },
                  {
                    label:
                      "Replace current tab",
                    value:
                      "replace_tab"
                  }
                ]}
              />
            )
          }

          {
            importKind === "config" && (
              <Alert
                color="yellow"
                title="Replace complete History configuration?"
              >
                This import replaces all History tabs and graphs.
              </Alert>
            )
          }

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                () =>
                  setImportDialogOpened(
                    false
                  )
              }
            >
              Cancel
            </Button>

            <Button
              onClick={
                confirmImport
              }
              disabled={
                importKind === "graph" &&
                importAction ===
                  "replace_graph" &&
                !importTargetGraphId
              }
            >
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={metricColorsOpened}
        onClose={
          () =>
            setMetricColorsOpened(
              false
            )
        }
        title="Metric colors"
        centered
      >
        <Stack gap="sm">
          <Text
            size="sm"
            c="dimmed"
          >
            Colors are global by metric type and are shared by all History graphs.
          </Text>

          {
            metricKeys.map(
              metricKey => (
                <Group
                  key={metricKey}
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                >
                  <Text
                    size="sm"
                    fw={500}
                  >
                    {metricKey}
                  </Text>

                  <ColorInput
                    value={
                      metricColorDrafts[
                        metricKey
                      ] ??
                      defaultMetricColor(
                        metricKey
                      )
                    }
                    onChange={
                      color =>
                        setMetricColorDrafts(
                          current => ({
                            ...current,
                            [metricKey]:
                              color
                          })
                        )
                    }
                    format="hex"
                    swatches={METRIC_COLOR_SWATCHES}
                    swatchesPerRow={5}
                    w={190}
                  />
                </Group>
              )
            )
          }

          {
            metricKeys.length === 0 && (
              <Text
                size="sm"
                c="dimmed"
              >
                No metric types are available.
              </Text>
            )
          }

          <Group
            justify="space-between"
            mt="sm"
          >
            <Button
              variant="default"
              onClick={
                () =>
                  setMetricColorDrafts(
                    Object.fromEntries(
                      metricKeys.map(
                        metricKey => [
                          metricKey,
                          defaultMetricColor(
                            metricKey
                          )
                        ]
                      )
                    )
                  )
              }
            >
              Restore defaults
            </Button>

            <Group gap="xs">
              <Button
                variant="default"
                onClick={
                  () =>
                    setMetricColorsOpened(
                      false
                    )
                }
              >
                Cancel
              </Button>

              <Button
                loading={
                  saveMetricColorsMutation
                    .isPending
                }
                disabled={
                  metricKeys.length === 0
                }
                onClick={
                  () =>
                    saveMetricColorsMutation
                      .mutate(
                        metricColorDrafts
                      )
                }
              >
                Save colors
              </Button>
            </Group>
          </Group>

          {
            saveMetricColorsMutation
              .isError && (
              <Alert color="red">
                Unable to save metric colors.
              </Alert>
            )
          }
        </Stack>
      </Modal>

      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Group gap="xs">
              <NavigationIcon page="history" size={24} />
              <Title order={2}>
                History
              </Title>
            </Group>
          <Text c="dimmed">
            Organize independent graph dashboards in multiple History tabs
          </Text>
        </div>

        <Group
          gap="sm"
          align="flex-end"
        >
          <Button
            variant="default"
            onClick={
              openMetricColors
            }
          >
            Metric colors
          </Button>

          <Button
            variant="default"
            onClick={
              () =>
                importInputRef.current?.click()
            }
          >
            Import
          </Button>

          <Button
            variant="default"
            onClick={
              exportHistoryConfig
            }
          >
            Export JSON
          </Button>

          <Select
            label="Refresh"
            value={
              String(
                refreshIntervalMs
              )
            }
            data={
              REFRESH_INTERVALS
            }
            onChange={
              value =>
                value &&
                setRefreshIntervalMs(
                  Number(
                    value
                  )
                )
            }
            w={120}
          />

          <Button
            variant="default"
            loading={
              refreshing
            }
            onClick={
              refreshNow
            }
            disabled={
              graphs.length === 0
            }
          >
            Refresh now
          </Button>

          <Button
            variant="default"
            onClick={
              () =>
                setAllCollapsed(
                  true
                )
            }
            disabled={
              graphs.length === 0 ||
              graphs.every(
                graph =>
                  graph.collapsed
              )
            }
          >
            Collapse all
          </Button>

          <Button
            variant="default"
            onClick={
              () =>
                setAllCollapsed(
                  false
                )
            }
            disabled={
              graphs.length === 0 ||
              graphs.every(
                graph =>
                  !graph.collapsed
              )
            }
          >
            Expand all
          </Button>

          <Button
            onClick={
              () =>
                setGraphs([
                  ...graphs,
                  newGraph()
                ])
            }
          >
            + Add graph
          </Button>
        </Group>
      </Group>

      {graphs.length === 0 ? (
        <Alert color="blue">
          Add a graph to start exploring history.
        </Alert>
      ) : (
        <SimpleGrid
          cols={{
            base: 1,
            lg: 2
          }}
          spacing="lg"
        >
          {
            graphs.map(
              (
                graph,
                index
              ) => (
                <div
                  key={graph.id}
                  style={{
                    minWidth: 0,
                    gridColumn:
                      (graph.layout ?? "full") ===
                        "full"
                        ? "1 / -1"
                        : undefined
                  }}
                >
                  <HistoryGraph
                    graph={graph}
                    assets={assets}
                    metricColors={
                      metricColors
                    }
                    refreshIntervalMs={
                      refreshIntervalMs
                    }
                    canMoveUp={
                      index > 0
                    }
                    canMoveDown={
                      index <
                      graphs.length - 1
                    }
                    onMoveTop={
                      () =>
                        moveGraphTo(
                          index,
                          0
                        )
                    }
                    onMoveUp={
                      () =>
                        moveGraph(
                          index,
                          -1
                        )
                    }
                    onMoveDown={
                      () =>
                        moveGraph(
                          index,
                          1
                        )
                    }
                    onMoveBottom={
                      () =>
                        moveGraphTo(
                          index,
                          graphs.length - 1
                        )
                    }
                    onChange={
                      next =>
                        updateGraph(
                          graph.id,
                          next
                        )
                    }
                    onRemove={
                      () =>
                        setGraphs(
                          graphs.filter(
                            current =>
                              current.id !==
                                graph.id
                          )
                        )
                    }
                  />
                </div>
              )
            )
          }
        </SimpleGrid>
      )}
    </Stack>
  );
}
