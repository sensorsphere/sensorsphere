import React from "react";

import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title
} from "@mantine/core";

import {
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  getAssets,
  getObservationAggregates,
  getObservationHistory
} from "./api";

import {
  HistoryChart,
  type HistoryChartSeries
} from "./HistoryChart";

import {
  usePersistentState
} from "./preferences/usePersistentState";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

interface HistoryGraphConfig {
  id: string;
  assetId: string;
  metricIds: string[];
  hours: number;
  collapsed?: boolean;
}

interface HistoryTabConfig {
  id: string;
  name: string;
  graphs: HistoryGraphConfig[];
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
        typeof graph.assetId === "string" &&
        Array.isArray(graph.metricIds) &&
        graph.metricIds.every(
          metricId =>
            typeof metricId === "string"
        ) &&
        typeof graph.hours === "number" &&
        VALID_HOURS.has(graph.hours) &&
        (
          graph.collapsed === undefined ||
          typeof graph.collapsed === "boolean"
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

function newGraph(): HistoryGraphConfig {
  return {
    id:
      `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    assetId: "",
    metricIds: [],
    hours: 24,
    collapsed: false
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

function assetLabel(
  asset: Awaited<ReturnType<typeof getAssets>>[number]
): string {
  return (
    asset.sensor?.name
    ?? asset.name
    ?? asset.externalId
  );
}

function HistoryGraph({
  graph,
  assets,
  refreshIntervalMs,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  graph: HistoryGraphConfig;
  assets: Awaited<ReturnType<typeof getAssets>>;
  refreshIntervalMs: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (graph: HistoryGraphConfig) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {

  const asset =
    assets.find(
      current =>
        current.id === graph.assetId
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
        graph.metricIds.includes(
          metric.id
        )
    );

  const useAggregates =
    graph.hours > 24;

  const aggregateBucket =
    graph.hours <= 168
      ? "15 minutes" as const
      : "1 hour" as const;

  const dataQueries =
    useQueries({
      queries:
        selectedMetrics.map(
          metric => ({
            queryKey:
              useAggregates
                ? [
                    "observation-aggregate",
                    metric.id,
                    graph.hours,
                    aggregateBucket
                  ]
                : [
                    "observation-history",
                    metric.id,
                    graph.hours
                  ],

            queryFn:
              () =>
                useAggregates
                  ? getObservationAggregates(
                      metric.id,
                      graph.hours,
                      aggregateBucket
                    )
                  : getObservationHistory(
                      metric.id,
                      graph.hours
                    ),

            enabled:
              !graph.collapsed,

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
      selectedMetrics.map(
        (metric, index) => {

          const data =
            dataQueries[index]?.data
            ?? [];

          return {
            id:
              metric.id,

            name:
              metric.displayName,

            unit:
              metric.unit,

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
        }
      );


  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
    >
      <Stack gap="md">

        <Group
          justify="space-between"
          align="flex-start"
        >
          <div>
            <Text fw={700}>
              {asset
                ? assetLabel(asset)
                : "History graph"}
            </Text>
            <Text
              size="xs"
              c="dimmed"
            >
              {selectedMetrics.length > 0
                ? selectedMetrics
                    .map(metric => metric.displayName)
                    .join(" · ")
                : "Select a sensor and one or more metrics"}
            </Text>
          </div>

          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              disabled={
                !canMoveUp
              }
              onClick={
                onMoveUp
              }
              title="Move graph up"
            >
              ↑
            </Button>

            <Button
              size="xs"
              variant="subtle"
              disabled={
                !canMoveDown
              }
              onClick={
                onMoveDown
              }
              title="Move graph down"
            >
              ↓
            </Button>

            <Button
              size="xs"
              variant="subtle"
              onClick={
                () =>
                  onChange({
                    ...graph,
                    collapsed:
                      !graph.collapsed
                  })
              }
            >
              {
                graph.collapsed
                  ? "Expand"
                  : "Collapse"
              }
            </Button>

            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={onRemove}
            >
              Remove
            </Button>
          </Group>
        </Group>

        {
          !graph.collapsed && (
            <>
        <Group
          align="flex-end"
          wrap="wrap"
        >
          <Select
            label="Sensor"
            searchable
            placeholder="Select a sensor"
            value={
              graph.assetId || null
            }
            data={
              assets
                .filter(
                  current =>
                    current.sensor !== null
                )
                .map(current => ({
                  value: current.id,
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
                onChange({
                  ...graph,
                  assetId: value ?? "",
                  metricIds: []
                })
            }
            style={{
              flex: "1 1 260px"
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
            value={graph.metricIds}
            data={
              metrics.map(metric => ({
                value: metric.id,
                label:
                  metric.unit
                    ? `${metric.displayName} (${metric.unit})`
                    : metric.displayName
              }))
            }
            onChange={
              metricIds =>
                onChange({
                  ...graph,
                  metricIds
                })
            }
            style={{
              flex: "1 1 300px"
            }}
          />
        </Group>

        <div>
          <Text
            size="sm"
            fw={500}
            mb={3}
          >
            Period
          </Text>

          <SegmentedControl
            value={String(graph.hours)}
            onChange={
              value =>
                onChange({
                  ...graph,
                  hours: Number(value)
                })
            }
            data={PERIODS}
          />
        </div>

        {!asset ? (
          <Alert color="blue">
            Select a sensor to configure this graph.
          </Alert>
        ) : selectedMetrics.length === 0 ? (
          <Alert color="blue">
            Select at least one metric.
          </Alert>
        ) : error ? (
          <Alert
            color="red"
            title="Unable to load history"
          >
            One or more metric series could not be loaded.
          </Alert>
        ) : loading ? (
          <Loader />
        ) : (
          <HistoryChart
            hours={graph.hours}
            series={chartSeries}
          />
        )}

            </>
          )
        }

      </Stack>
    </Card>
  );
}

export function HistoryPanel() {

  const queryClient =
    useQueryClient();

  const [
    refreshing,
    setRefreshing
  ] =
    React.useState(
      false
    );

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
      setTabs,
      tabs
    ]
  );

  React.useEffect(
    () => {
      if (
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

  const renameTab =
    (
      tabId: string
    ): void => {

      const tab =
        tabs.find(
          current =>
            current.id === tabId
        );

      if (!tab) {
        return;
      }

      const nextName =
        window.prompt(
          "History tab name",
          tab.name
        )?.trim();

      if (!nextName) {
        return;
      }

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

      const next =
        [...graphs];

      [
        next[index],
        next[targetIndex]
      ] = [
        next[targetIndex],
        next[index]
      ];

      setGraphs(
        next
      );
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
                gap={4}
                draggable
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
                    "grab",
                  opacity:
                    draggedTabId ===
                      tab.id
                      ? 0.55
                      : 1
                }}
              >
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
                  onDoubleClick={
                    () =>
                      renameTab(
                        tab.id
                      )
                  }
                  title="Drag to reorder · Double-click to rename"
                >
                  <span
                    aria-hidden="true"
                    style={{
                      marginRight:
                        6,
                      opacity:
                        0.65
                    }}
                  >
                    ⋮⋮
                  </span>
                  {tab.name}
                </Button>

                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  disabled={
                    tabs.length <= 1
                  }
                  onClick={
                    () =>
                      removeTab(
                        tab.id
                      )
                  }
                  title="Delete tab"
                >
                  ×
                </Button>
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

      </Group>

      <Group
        justify="space-between"
        align="flex-end"
      >
        <div>
          <Title order={2}>
            History
          </Title>
          <Text c="dimmed">
            Organize independent graph dashboards in multiple History tabs
          </Text>
        </div>

        <Group
          gap="sm"
          align="flex-end"
        >
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
        graphs.map(
          (
            graph,
            index
          ) => (
          <HistoryGraph
            key={graph.id}
            graph={graph}
            assets={assets}
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
                      current.id !== graph.id
                  )
                )
            }
          />
        ))
      )}
    </Stack>
  );
}
