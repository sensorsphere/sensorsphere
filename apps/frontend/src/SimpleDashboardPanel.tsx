import React from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  addSimpleDashboardCard,
  createSimpleDashboard,
  deleteSimpleDashboard,
  deleteSimpleDashboardCard,
  getAssets,
  getLatestObservations,
  getMetricDisplaySettings,
  getSimpleDashboards,
  renameSimpleDashboard,
  reorderSimpleDashboardCards
} from "./api";
import type {
  Asset,
  AssetMetric,
  LatestObservation,
  SimpleDashboardCard
} from "./types";
import { usePersistentState } from "./preferences/usePersistentState";
import { NavigationIcon } from "./NavigationIcon";
import { LocationIcon, getLocationIconName } from "./LocationIcon";

const DEFAULT_METRIC_COLORS: Record<string, string> = {
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

function defaultMetricColor(metricKey: string): string {
  const normalized = metricKey.trim().toLowerCase();
  const configured = DEFAULT_METRIC_COLORS[normalized];
  if (configured) return configured;

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_METRIC_COLORS[hash % FALLBACK_METRIC_COLORS.length]!;
}

function formatMetricValue(observation: LatestObservation | undefined): string {
  if (!observation) return "—";
  if (typeof observation.value === "number") {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2
    }).format(observation.value);
  }
  if (typeof observation.value === "boolean") {
    return observation.value ? "On" : "Off";
  }
  if (typeof observation.value === "string") return observation.value;
  return "—";
}

function qualityColor(observation: LatestObservation | undefined): string | null {
  switch (observation?.quality.status) {
    case "GOOD":
      return "green";
    case "WARNING":
      return "orange";
    case "CRITICAL":
      return "red";
    default:
      return null;
  }
}

function qualityLabel(observation: LatestObservation | undefined): string | null {
  switch (observation?.quality.status) {
    case "GOOD":
      return "Good";
    case "WARNING":
      return "Warning";
    case "CRITICAL":
      return "Critical";
    default:
      return null;
  }
}

interface ResolvedMetricCard {
  card: SimpleDashboardCard;
  asset: Asset;
  metric: AssetMetric;
  observation: LatestObservation | undefined;
}

export function SimpleDashboardPanel() {
  const queryClient = useQueryClient();
  const dashboardsQuery = useQuery({
    queryKey: ["simple-dashboards"],
    queryFn: getSimpleDashboards
  });
  const assetsQuery = useQuery({
    queryKey: ["assets"],
    queryFn: getAssets
  });
  const observationsQuery = useQuery({
    queryKey: ["observations", "latest"],
    queryFn: () => getLatestObservations(),
    refetchInterval: 15_000
  });
  const colorsQuery = useQuery({
    queryKey: ["metric-display-settings"],
    queryFn: getMetricDisplaySettings
  });

  const [selectedDashboardId, setSelectedDashboardId] =
    usePersistentState<string>(
      "simple-dashboards.selected",
      "",
      (value): value is string => typeof value === "string"
    );
  const [dashboardModalMode, setDashboardModalMode] = React.useState<"create" | "rename" | null>(null);
  const [dashboardName, setDashboardName] = React.useState("");
  const [addCardOpened, setAddCardOpened] = React.useState(false);
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [selectedMetricId, setSelectedMetricId] = React.useState<string | null>(null);
  const [lastMetricKey, setLastMetricKey] = usePersistentState<string>(
    "simple-dashboards.last-metric-key",
    "",
    (value): value is string => typeof value === "string"
  );
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<
    | { type: "dashboard"; id: string; name: string }
    | { type: "card"; dashboardId: string; cardId: string; label: string }
    | null
  >(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
  };

  const createDashboardMutation = useMutation({
    mutationFn: (name: string) => createSimpleDashboard(name),
    onSuccess: async dashboard => {
      setSelectedDashboardId(dashboard.id);
      setDashboardModalMode(null);
      setDashboardName("");
      await invalidate();
    }
  });
  const renameDashboardMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameSimpleDashboard(id, name),
    onSuccess: async () => {
      setDashboardModalMode(null);
      setDashboardName("");
      await invalidate();
    }
  });
  const deleteDashboardMutation = useMutation({
    mutationFn: deleteSimpleDashboard,
    onSuccess: async () => {
      setSelectedDashboardId("");
      await invalidate();
    }
  });
  const addCardMutation = useMutation({
    mutationFn: ({ dashboardId, assetMetricId }: { dashboardId: string; assetMetricId: string }) =>
      addSimpleDashboardCard(dashboardId, assetMetricId),
    onSuccess: async () => {
      const selectedMetric = assets
        .flatMap(asset => asset.metrics)
        .find(metric => metric.id === selectedMetricId);
      if (selectedMetric) {
        setLastMetricKey(selectedMetric.key);
      }
      setAddCardOpened(false);
      setSelectedAssetId(null);
      setSelectedMetricId(null);
      await invalidate();
    }
  });
  const deleteCardMutation = useMutation({
    mutationFn: ({ dashboardId, cardId }: { dashboardId: string; cardId: string }) =>
      deleteSimpleDashboardCard(dashboardId, cardId),
    onSuccess: invalidate
  });
  const reorderMutation = useMutation({
    mutationFn: ({ dashboardId, cardIds }: { dashboardId: string; cardIds: string[] }) =>
      reorderSimpleDashboardCards(dashboardId, cardIds),
    onSuccess: invalidate
  });

  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const assets = assetsQuery.data ?? [];
  const observations = observationsQuery.data ?? [];
  const cards = dashboardsQuery.data?.cards ?? [];

  const activeDashboard =
    dashboards.find(item => item.id === selectedDashboardId) ?? dashboards[0] ?? null;

  React.useEffect(() => {
    if (activeDashboard && activeDashboard.id !== selectedDashboardId) {
      setSelectedDashboardId(activeDashboard.id);
    }
  }, [activeDashboard?.id, selectedDashboardId, setSelectedDashboardId]);

  React.useEffect(() => {
    setDraggedCardId(null);
    setDragOrder(null);
  }, [activeDashboard?.id]);

  if (dashboardsQuery.isLoading || assetsQuery.isLoading || observationsQuery.isLoading) {
    return <Loader />;
  }
  if (dashboardsQuery.isError || assetsQuery.isError || observationsQuery.isError) {
    return <Alert color="red" title="Unable to load dashboards">Dashboard data could not be loaded.</Alert>;
  }

  const observationsByMetricId = new Map(
    observations.map(observation => [observation.metricId, observation])
  );
  const metricColors = new Map(
    (colorsQuery.data ?? []).map(setting => [setting.metricKey, setting.color])
  );
  const assetByMetricId = new Map<string, { asset: Asset; metric: AssetMetric }>();
  for (const asset of assets) {
    for (const metric of asset.metrics) {
      assetByMetricId.set(metric.id, { asset, metric });
    }
  }

  const activeCards: ResolvedMetricCard[] = activeDashboard
    ? cards
        .filter(card => card.dashboardId === activeDashboard.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(card => {
          const resolved = assetByMetricId.get(card.assetMetricId);
          return resolved
            ? {
                card,
                asset: resolved.asset,
                metric: resolved.metric,
                observation: observationsByMetricId.get(card.assetMetricId)
              }
            : null;
        })
        .filter((value): value is ResolvedMetricCard => value !== null)
    : [];

  const selectedAsset = assets.find(asset => asset.id === selectedAssetId) ?? null;
  const dashboardMetricIds = new Set(activeCards.map(item => item.metric.id));
  const metricOptions = (selectedAsset?.metrics ?? [])
    .filter(metric => metric.enabled && !dashboardMetricIds.has(metric.id))
    .map(metric => ({
      value: metric.id,
      label: `${metric.displayName}${metric.unit ? ` (${metric.unit})` : ""}`
    }));

  const orderedActiveCards = (() => {
    if (!dragOrder) return activeCards;
    const cardsById = new Map(activeCards.map(item => [item.card.id, item]));
    return dragOrder
      .map(id => cardsById.get(id))
      .filter((item): item is ResolvedMetricCard => item !== undefined);
  })();

  const previewMoveCard = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = dragOrder ?? activeCards.map(item => item.card.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...ids];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved!);
    setDragOrder(next);
  };

  const persistDragOrder = () => {
    if (!activeDashboard || !dragOrder) return;
    const originalIds = activeCards.map(item => item.card.id);
    if (dragOrder.join("|") === originalIds.join("|")) {
      setDragOrder(null);
      return;
    }
    reorderMutation.mutate(
      { dashboardId: activeDashboard.id, cardIds: dragOrder },
      { onSettled: () => setDragOrder(null) }
    );
  };

  const selectAssetForCard = (assetId: string | null) => {
    setSelectedAssetId(assetId);
    if (!assetId) {
      setSelectedMetricId(null);
      return;
    }
    const asset = assets.find(item => item.id === assetId);
    const preferredMetric = asset?.metrics.find(
      metric =>
        metric.enabled &&
        metric.key === lastMetricKey &&
        !dashboardMetricIds.has(metric.id)
    );
    setSelectedMetricId(preferredMetric?.id ?? null);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Group gap="sm">
          <NavigationIcon page="dashboards" size={25} />
          <div>
            <Title order={2}>Dashboards</Title>
            <Text c="dimmed">Simple live metric cards</Text>
          </div>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            color="green"
            onClick={() => {
              setDashboardName("");
              setDashboardModalMode("create");
            }}
          >
            + New dashboard
          </Button>
          {activeDashboard && (
            <>
              <Button
                size="xs"
                variant="light"
                color="blue"
                onClick={() => {
                  setDashboardName(activeDashboard.name);
                  setDashboardModalMode("rename");
                }}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() =>
                  setDeleteTarget({
                    type: "dashboard",
                    id: activeDashboard.id,
                    name: activeDashboard.name
                  })
                }
              >
                Delete
              </Button>
            </>
          )}
        </Group>
      </Group>

      {dashboards.length > 0 && (
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <Tabs
            value={activeDashboard?.id ?? null}
            onChange={value => value && setSelectedDashboardId(value)}
            style={{ minWidth: 0, flex: 1 }}
          >
            <Tabs.List style={{ flexWrap: "nowrap", overflowX: "auto" }}>
              {dashboards.map(dashboard => (
                <Tabs.Tab key={dashboard.id} value={dashboard.id}>
                  {dashboard.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
          <Button
            size="xs"
            variant="light"
            color="green"
            onClick={() => setAddCardOpened(true)}
          >
            + Add card
          </Button>
        </Group>
      )}

      {!activeDashboard ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <Text fw={600}>No dashboard yet</Text>
            <Text size="sm" c="dimmed">Create a dashboard, then add Asset + Metric cards.</Text>
          </Stack>
        </Card>
      ) : activeCards.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <Text fw={600}>No metric cards</Text>
            <Text size="sm" c="dimmed">Use Add card to choose an Asset and one of its metrics.</Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
          {orderedActiveCards.map(({ card, asset, metric, observation }) => {
            const color = metricColors.get(metric.key) ?? defaultMetricColor(metric.key);
            return (
              <Card
                key={card.id}
                withBorder
                p="md"
                draggable
                onDragStart={() => {
                  setDraggedCardId(card.id);
                  setDragOrder(activeCards.map(item => item.card.id));
                }}
                onDragEnter={() => {
                  if (draggedCardId) previewMoveCard(draggedCardId, card.id);
                }}
                onDragEnd={() => {
                  persistDragOrder();
                  setDraggedCardId(null);
                }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => event.preventDefault()}
                style={{
                  borderLeft: `4px solid ${color}`,
                  cursor: "grab",
                  opacity: draggedCardId === card.id ? 0.55 : 1,
                  minHeight: 132
                }}
              >
                <Stack gap={4} h="100%">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Badge variant="light" color={color} size="sm">
                      {metric.displayName.toUpperCase()}
                    </Badge>
                    <ActionIcon
                      size="sm"
                      variant="light"
                      color="red"
                      aria-label="Remove card"
                      title="Remove card"
                      onClick={() =>
                        setDeleteTarget({
                          type: "card",
                          dashboardId: activeDashboard.id,
                          cardId: card.id,
                          label: `${asset.name ?? asset.externalId} · ${metric.displayName}`
                        })
                      }
                    >
                      ×
                    </ActionIcon>
                  </Group>
                  <Group gap="xs" align="center" wrap="nowrap">
                    <Text size="xl" fw={800} style={{ color }}>
                      {formatMetricValue(observation)}{metric.unit ? ` ${metric.unit}` : ""}
                    </Text>
                    {qualityColor(observation) && (
                      <Badge
                        size="sm"
                        variant="light"
                        color={qualityColor(observation)!}
                      >
                        {qualityLabel(observation)}
                      </Badge>
                    )}
                  </Group>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {asset.name ?? asset.externalId}
                  </Text>
                  <Group gap={5} wrap="nowrap">
                    {asset.location && (
                      <LocationIcon name={getLocationIconName(asset.location)} size={14} />
                    )}
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {asset.location?.name ?? "Unassigned"}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Modal
        opened={dashboardModalMode !== null}
        onClose={() => setDashboardModalMode(null)}
        title={dashboardModalMode === "create" ? "New dashboard" : "Rename dashboard"}
      >
        <Stack>
          <TextInput
            label="Name"
            value={dashboardName}
            onChange={event => setDashboardName(event.currentTarget.value)}
            autoFocus
          />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setDashboardModalMode(null)}>Cancel</Button>
            <Button
              variant="light"
              color="green"
              disabled={!dashboardName.trim()}
              loading={createDashboardMutation.isPending || renameDashboardMutation.isPending}
              onClick={() => {
                const name = dashboardName.trim();
                if (!name) return;
                if (dashboardModalMode === "create") {
                  createDashboardMutation.mutate(name);
                } else if (activeDashboard) {
                  renameDashboardMutation.mutate({ id: activeDashboard.id, name });
                }
              }}
            >
              {dashboardModalMode === "create" ? "Add dashboard" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === "dashboard" ? "Delete dashboard" : "Remove metric card"}
        centered
      >
        <Stack>
          <Alert color="red" variant="light" title="Confirmation required">
            {deleteTarget?.type === "dashboard"
              ? `Delete dashboard "${deleteTarget.name}" and all of its cards?`
              : deleteTarget?.type === "card"
                ? `Remove "${deleteTarget.label}" from this dashboard?`
                : ""}
          </Alert>
          <Text size="sm" c="dimmed">This action cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="light"
              color="red"
              loading={deleteDashboardMutation.isPending || deleteCardMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "dashboard") {
                  deleteDashboardMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null)
                  });
                } else {
                  deleteCardMutation.mutate(
                    { dashboardId: deleteTarget.dashboardId, cardId: deleteTarget.cardId },
                    { onSuccess: () => setDeleteTarget(null) }
                  );
                }
              }}
            >
              {deleteTarget?.type === "dashboard" ? "Delete dashboard" : "Remove card"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={addCardOpened}
        onClose={() => setAddCardOpened(false)}
        title="Add metric card"
      >
        <Stack>
          <Select
            label="Asset"
            searchable
            value={selectedAssetId}
            onChange={selectAssetForCard}
            data={assets.map(asset => ({
              value: asset.id,
              label: `${asset.name ?? asset.externalId} · ${asset.location?.name ?? "Unassigned"}`
            }))}
          />
          <Select
            label="Metric"
            searchable
            disabled={!selectedAsset}
            value={selectedMetricId}
            onChange={setSelectedMetricId}
            data={metricOptions}
            nothingFoundMessage={selectedAsset ? "No available metric" : "Select an asset first"}
          />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setAddCardOpened(false)}>Cancel</Button>
            <Button
              variant="light"
              color="green"
              disabled={!activeDashboard || !selectedMetricId}
              loading={addCardMutation.isPending}
              onClick={() => {
                if (activeDashboard && selectedMetricId) {
                  addCardMutation.mutate({
                    dashboardId: activeDashboard.id,
                    assetMetricId: selectedMetricId
                  });
                }
              }}
            >
              Add card
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
