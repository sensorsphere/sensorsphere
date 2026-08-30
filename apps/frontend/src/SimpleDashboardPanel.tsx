import React from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
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
  createSimpleDashboardSection,
  deleteSimpleDashboard,
  deleteSimpleDashboardCard,
  deleteSimpleDashboardSection,
  getAssets,
  getLatestObservations,
  getMetricDisplaySettings,
  getSimpleDashboards,
  renameSimpleDashboard,
  renameSimpleDashboardSection,
  reorderSimpleDashboardCards,
  reorderSimpleDashboards,
  updateSimpleDashboardCard,
  detachSimpleDashboard,
  convertSimpleDashboardToTemplate
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

import { defaultMetricColor } from "./metricVisuals";
import { DashboardTemplateManager } from "./DashboardTemplateManager";
import type { HistoryTemplateLaunchConfig } from "./HistoryPanel";

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

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.8 2.5 14l2.2-.5L12.8 5.4 10.6 3.2 3 11.8Z" />
      <path d="m9.8 4 2.2 2.2" />
    </svg>
  );
}

function DetachIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6.3 9.7-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5l2-2a2.5 2.5 0 0 1 3.5 0" />
      <path d="m9.7 6.3 1.2-1.2a2.5 2.5 0 0 1 3.5 3.5l-2 2a2.5 2.5 0 0 1-3.5 0" />
      <path d="M5.8 10.2 10.2 5.8" />
      <path d="m3 13 10-10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h10" />
      <path d="M6 4V2.5h4V4" />
      <path d="m4.5 4 .6 9.5h5.8l.6-9.5" />
      <path d="M7 7v4M9 7v4" />
    </svg>
  );
}

interface ResolvedMetricCard {
  card: SimpleDashboardCard;
  asset: Asset;
  metric: AssetMetric;
  observation: LatestObservation | undefined;
}

interface SimpleDashboardPanelProps {
  onOpenTemplateInHistory?: (launch: HistoryTemplateLaunchConfig) => void;
}

export function SimpleDashboardPanel({ onOpenTemplateInHistory }: SimpleDashboardPanelProps = {}) {
  const queryClient = useQueryClient();
  const dashboardsQuery = useQuery({
    queryKey: ["simple-dashboards"],
    queryFn: getSimpleDashboards,
    refetchOnMount: "always"
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
  const [cardEditorMode, setCardEditorMode] = React.useState<"add" | "edit" | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [selectedMetricId, setSelectedMetricId] = React.useState<string | null>(null);
  const [lastMetricKey, setLastMetricKey] = usePersistentState<string>(
    "simple-dashboards.last-metric-key",
    "",
    (value): value is string => typeof value === "string"
  );
  const [draggedCardId, setDraggedCardId] = React.useState<string | null>(null);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  const [dragSectionByCardId, setDragSectionByCardId] = React.useState<Record<string, string | null> | null>(null);
  const [draggedDashboardId, setDraggedDashboardId] = React.useState<string | null>(null);
  const [dashboardDragOrder, setDashboardDragOrder] = React.useState<string[] | null>(null);
  const [sectionModalMode, setSectionModalMode] = React.useState<"create" | "rename" | null>(null);
  const [editingSectionId, setEditingSectionId] = React.useState<string | null>(null);
  const [sectionName, setSectionName] = React.useState("");
  const [selectedSectionId, setSelectedSectionId] = React.useState<string | null>(null);
  const [cardCreatingSection, setCardCreatingSection] = React.useState(false);
  const [cardNewSectionName, setCardNewSectionName] = React.useState("");
  const dashboardNameInputRef = React.useRef<HTMLInputElement>(null);
  const sectionNameInputRef = React.useRef<HTMLInputElement>(null);
  const dropCommittedRef = React.useRef(false);
  const [templateManagerOpened, setTemplateManagerOpened] = React.useState(false);
  const [templateManagerInitialId, setTemplateManagerInitialId] = React.useState<string | null>(null);
  const [detachConfirmOpen, setDetachConfirmOpen] = React.useState(false);
  const [convertTemplateOpen, setConvertTemplateOpen] = React.useState(false);
  const [convertTemplateName, setConvertTemplateName] = React.useState("");
  const [convertCreateInstance, setConvertCreateInstance] = React.useState(false);
  const [convertMetricKey, setConvertMetricKey] = React.useState<string | null>(null);
  const convertTemplateNameRef = React.useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<
    | { type: "dashboard"; id: string; name: string }
    | { type: "card"; dashboardId: string; cardId: string; label: string }
    | { type: "section"; dashboardId: string; sectionId: string; name: string }
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
  const reorderDashboardsMutation = useMutation({
    mutationFn: (dashboardIds: string[]) => reorderSimpleDashboards(dashboardIds),
    onSuccess: invalidate
  });
  const createSectionMutation = useMutation({
    mutationFn: ({ dashboardId, name }: { dashboardId: string; name: string }) =>
      createSimpleDashboardSection(dashboardId, name),
    onSuccess: async () => {
      setSectionModalMode(null);
      setEditingSectionId(null);
      setSectionName("");
      await invalidate();
    }
  });
  const createCardSectionMutation = useMutation({
    mutationFn: ({ dashboardId, name }: { dashboardId: string; name: string }) =>
      createSimpleDashboardSection(dashboardId, name),
    onSuccess: async created => {
      setSelectedSectionId(created.id);
      setCardCreatingSection(false);
      setCardNewSectionName("");
      await invalidate();
    }
  });
  const renameSectionMutation = useMutation({
    mutationFn: ({ dashboardId, sectionId, name }: { dashboardId: string; sectionId: string; name: string }) =>
      renameSimpleDashboardSection(dashboardId, sectionId, name),
    onSuccess: async () => {
      setSectionModalMode(null);
      setEditingSectionId(null);
      setSectionName("");
      await invalidate();
    }
  });
  const deleteSectionMutation = useMutation({
    mutationFn: ({ dashboardId, sectionId }: { dashboardId: string; sectionId: string }) =>
      deleteSimpleDashboardSection(dashboardId, sectionId),
    onSuccess: invalidate
  });
  const deleteDashboardMutation = useMutation({
    mutationFn: deleteSimpleDashboard,
    onSuccess: async () => {
      setSelectedDashboardId("");
      await invalidate();
    }
  });
  const detachDashboardMutation = useMutation({
    mutationFn: detachSimpleDashboard,
    onSuccess: async () => {
      setDetachConfirmOpen(false);
      await invalidate();
    }
  });
  const convertDashboardToTemplateMutation = useMutation({
    mutationFn: ({ dashboardId, name, createInstance, metricKey }: { dashboardId: string; name: string; createInstance: boolean; metricKey: string | null }) =>
      convertSimpleDashboardToTemplate(dashboardId, { name, createInstance, metricKey }),
    onSuccess: async result => {
      setConvertTemplateOpen(false);
      setConvertTemplateName("");
      setConvertCreateInstance(false);
      setConvertMetricKey(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["simple-dashboard-templates"] }),
        invalidate()
      ]);
      setTemplateManagerInitialId(result.template.id);
      setTemplateManagerOpened(true);
      if (result.instance) setSelectedDashboardId(result.instance.id);
    }
  });
  const addCardMutation = useMutation({
    mutationFn: ({ dashboardId, assetMetricId, sectionId }: { dashboardId: string; assetMetricId: string; sectionId: string | null }) =>
      addSimpleDashboardCard(dashboardId, assetMetricId, sectionId),
    onSuccess: async () => {
      const selectedMetric = assets
        .flatMap(asset => asset.metrics)
        .find(metric => metric.id === selectedMetricId);
      if (selectedMetric) {
        setLastMetricKey(selectedMetric.key);
      }
      setCardEditorMode(null);
      setEditingCardId(null);
      setSelectedAssetId(null);
      setSelectedMetricId(null);
      await invalidate();
    }
  });
  const updateCardMutation = useMutation({
    mutationFn: ({ dashboardId, cardId, assetMetricId, sectionId }: { dashboardId: string; cardId: string; assetMetricId: string; sectionId: string | null }) =>
      updateSimpleDashboardCard(dashboardId, cardId, assetMetricId, sectionId),
    onSuccess: async () => {
      const selectedMetric = assets
        .flatMap(asset => asset.metrics)
        .find(metric => metric.id === selectedMetricId);
      if (selectedMetric) setLastMetricKey(selectedMetric.key);
      setCardEditorMode(null);
      setEditingCardId(null);
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
  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const assets = assetsQuery.data ?? [];
  const observations = observationsQuery.data ?? [];
  const sections = dashboardsQuery.data?.sections ?? [];
  const cards = dashboardsQuery.data?.cards ?? [];

  const activeDashboard =
    dashboards.find(item => item.id === selectedDashboardId) ?? dashboards[0] ?? null;
  const activeDashboardIsTemplateInstance = Boolean(activeDashboard?.templateId);
  const activeDashboardCardSignature = activeDashboard
    ? cards
        .filter(card => card.dashboardId === activeDashboard.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(card => `${card.id}:${card.sectionId ?? ""}:${card.sortOrder}`)
        .join("|")
    : "";

  React.useEffect(() => {
    if (activeDashboard && activeDashboard.id !== selectedDashboardId) {
      setSelectedDashboardId(activeDashboard.id);
    }
  }, [activeDashboard?.id, selectedDashboardId, setSelectedDashboardId]);

  React.useEffect(() => {
    if (draggedCardId) return;
    setDragOrder(null);
    setDragSectionByCardId(null);
  }, [activeDashboardCardSignature, draggedCardId]);

  React.useEffect(() => {
    setDraggedCardId(null);
    setDragOrder(null);
    setDragSectionByCardId(null);
    setSelectedSectionId(null);
  }, [activeDashboard?.id]);

  React.useEffect(() => {
    if (!dashboardModalMode) return;
    const timer = window.setTimeout(() => dashboardNameInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [dashboardModalMode]);

  React.useEffect(() => {
    if (convertTemplateOpen) {
      const timer = window.setTimeout(() => convertTemplateNameRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [convertTemplateOpen]);

  React.useEffect(() => {
    if (!sectionModalMode) return;
    const timer = window.setTimeout(() => sectionNameInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [sectionModalMode]);

  React.useEffect(() => {
    if (!dashboardModalMode && !sectionModalMode && !cardEditorMode && !convertTemplateOpen) return;

    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();

      if (convertTemplateOpen) {
        if (!activeDashboard || !convertTemplateName.trim() || convertDashboardToTemplateMutation.isPending) return;
        if (convertCreateInstance && !convertMetricKey) return;
        convertDashboardToTemplateMutation.mutate({
          dashboardId: activeDashboard.id,
          name: convertTemplateName.trim(),
          createInstance: convertCreateInstance,
          metricKey: convertCreateInstance ? convertMetricKey : null
        });
        return;
      }

      if (dashboardModalMode) {
        const name = dashboardName.trim();
        if (!name || createDashboardMutation.isPending || renameDashboardMutation.isPending) return;
        if (dashboardModalMode === "create") {
          createDashboardMutation.mutate(name);
        } else if (activeDashboard) {
          renameDashboardMutation.mutate({ id: activeDashboard.id, name });
        }
        return;
      }

      if (sectionModalMode) {
        if (!activeDashboard || !sectionName.trim() || createSectionMutation.isPending || renameSectionMutation.isPending) return;
        if (sectionModalMode === "create") {
          createSectionMutation.mutate({ dashboardId: activeDashboard.id, name: sectionName.trim() });
        } else if (editingSectionId) {
          renameSectionMutation.mutate({ dashboardId: activeDashboard.id, sectionId: editingSectionId, name: sectionName.trim() });
        }
        return;
      }

      if (cardCreatingSection) {
        if (!activeDashboard || !cardNewSectionName.trim() || createCardSectionMutation.isPending) return;
        createCardSectionMutation.mutate({
          dashboardId: activeDashboard.id,
          name: cardNewSectionName.trim()
        });
        return;
      }

      if (!activeDashboard || !selectedMetricId || addCardMutation.isPending || updateCardMutation.isPending) return;
      if (cardEditorMode === "edit" && editingCardId) {
        updateCardMutation.mutate({
          dashboardId: activeDashboard.id,
          cardId: editingCardId,
          assetMetricId: selectedMetricId,
          sectionId: selectedSectionId
        });
      } else if (cardEditorMode === "add") {
        addCardMutation.mutate({
          dashboardId: activeDashboard.id,
          assetMetricId: selectedMetricId,
          sectionId: selectedSectionId
        });
      }
    };

    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [
    activeDashboard,
    addCardMutation,
    cardCreatingSection,
    cardEditorMode,
    cardNewSectionName,
    convertCreateInstance,
    convertDashboardToTemplateMutation,
    convertMetricKey,
    convertTemplateName,
    convertTemplateOpen,
    createCardSectionMutation,
    createDashboardMutation,
    createSectionMutation,
    dashboardModalMode,
    dashboardName,
    editingCardId,
    editingSectionId,
    renameDashboardMutation,
    renameSectionMutation,
    sectionModalMode,
    sectionName,
    selectedMetricId,
    selectedSectionId,
    updateCardMutation
  ]);

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

  const activeSections = activeDashboard
    ? sections
        .filter(section => section.dashboardId === activeDashboard.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
  const convertMetricOptions = Array.from(
    new Map(activeCards.map(item => [item.metric.key, item.metric.displayName || item.metric.key])).entries()
  ).map(([value, label]) => ({ value, label }));
  const orderedDashboards = (() => {
    if (!dashboardDragOrder) return dashboards;
    const byId = new Map(dashboards.map(item => [item.id, item]));
    return dashboardDragOrder.map(id => byId.get(id)).filter((item): item is NonNullable<typeof item> => item !== undefined);
  })();
  const metricDisplayNameByKey = new Map(
    assets.flatMap(asset => asset.metrics).map(metric => [metric.key, metric.displayName || metric.key] as const)
  );
  const standardDashboards = orderedDashboards.filter(dashboard => !dashboard.templateId);
  const templateDashboardGroups = Array.from(
    orderedDashboards.reduce((groups, dashboard) => {
      if (!dashboard.templateId) return groups;
      const current = groups.get(dashboard.templateId) ?? {
        templateId: dashboard.templateId,
        templateName: dashboard.templateName ?? "Template",
        dashboards: [] as typeof orderedDashboards
      };
      current.dashboards.push(dashboard);
      groups.set(dashboard.templateId, current);
      return groups;
    }, new Map<string, { templateId: string; templateName: string; dashboards: typeof orderedDashboards }>()).values()
  )
    .map(group => ({ ...group, dashboards: [...group.dashboards].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.templateName.localeCompare(right.templateName));

  const historyLaunchForTemplate = (
    templateId: string,
    templateName: string,
    templateDashboards: typeof orderedDashboards
  ): HistoryTemplateLaunchConfig | null => {
    const tabs = templateDashboards.flatMap(dashboard => {
      const metricKey = dashboard.templateMetricKey;
      if (!metricKey) return [];

      const graphs = sections
        .filter(section => section.dashboardId === dashboard.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .flatMap(section => {
          const assetIds = cards
            .filter(card => card.dashboardId === dashboard.id && card.sectionId === section.id)
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map(card => assetByMetricId.get(card.assetMetricId))
            .filter((resolved): resolved is { asset: Asset; metric: AssetMetric } => resolved !== undefined)
            .filter(resolved =>
              resolved.asset.sensor !== null &&
              resolved.metric.enabled &&
              resolved.metric.key === metricKey
            )
            .map(resolved => resolved.asset.id);

          if (assetIds.length === 0) return [];

          return [{
            id: `template-history-graph-${templateId}-${metricKey}-${section.id}`,
            name: section.name,
            metricKey,
            assetIds
          }];
        });

      if (graphs.length === 0) return [];

      return [{
        id: `template-history-tab-${templateId}-${metricKey}`,
        name: metricDisplayNameByKey.get(metricKey) ?? metricKey,
        graphs
      }];
    });

    if (tabs.length === 0) return null;

    return {
      key: `${templateId}:${templateDashboards.map(dashboard => `${dashboard.id}:${dashboard.templateMetricKey ?? ""}`).join("|")}`,
      templateId,
      templateName,
      tabs
    };
  };

  const previewMoveDashboard = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = dashboardDragOrder ?? dashboards.map(item => item.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...ids];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved!);
    setDashboardDragOrder(next);
  };

  const persistDashboardOrder = () => {
    if (!dashboardDragOrder) return;
    const original = dashboards.map(item => item.id);
    if (original.join("|") === dashboardDragOrder.join("|")) {
      setDashboardDragOrder(null);
      return;
    }
    reorderDashboardsMutation.mutate(dashboardDragOrder, { onSettled: () => setDashboardDragOrder(null) });
  };

  const selectedAsset = assets.find(asset => asset.id === selectedAssetId) ?? null;
  const editingCard = activeCards.find(item => item.card.id === editingCardId) ?? null;
  const dashboardMetricIds = new Set(activeCards.map(item => item.metric.id));
  const metricOptions = (selectedAsset?.metrics ?? [])
    .filter(metric =>
      metric.enabled &&
      (!dashboardMetricIds.has(metric.id) || metric.id === editingCard?.metric.id)
    )
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

  const effectiveSectionId = (card: SimpleDashboardCard): string | null =>
    dragSectionByCardId?.[card.id] ?? card.sectionId;

  const beginCardDrag = (cardId: string) => {
    dropCommittedRef.current = false;
    setDraggedCardId(cardId);
    setDragOrder(activeCards.map(item => item.card.id));
    setDragSectionByCardId(
      Object.fromEntries(activeCards.map(item => [item.card.id, item.card.sectionId]))
    );
  };

  const previewMoveCard = (sourceId: string, targetId: string, targetSectionId: string | null) => {
    if (sourceId !== targetId) {
      const ids = dragOrder ?? activeCards.map(item => item.card.id);
      const sourceIndex = ids.indexOf(sourceId);
      const targetIndex = ids.indexOf(targetId);
      if (sourceIndex >= 0 && targetIndex >= 0) {
        const next = [...ids];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved!);
        setDragOrder(next);
      }
    }
    setDragSectionByCardId(current => ({
      ...(current ?? Object.fromEntries(activeCards.map(item => [item.card.id, item.card.sectionId]))),
      [sourceId]: targetSectionId
    }));
  };

  const previewMoveCardToSection = (sourceId: string, sectionId: string) => {
    setDragSectionByCardId(current => ({
      ...(current ?? Object.fromEntries(activeCards.map(item => [item.card.id, item.card.sectionId]))),
      [sourceId]: sectionId
    }));
  };

  const persistDragOrder = async () => {
    if (!activeDashboard || !dragOrder || !dragSectionByCardId || !draggedCardId) return;
    const originalIds = activeCards.map(item => item.card.id);
    const dragged = activeCards.find(item => item.card.id === draggedCardId);
    const nextSectionId = dragSectionByCardId[draggedCardId] ?? dragged?.card.sectionId ?? null;
    const sectionChanged = Boolean(dragged && nextSectionId !== dragged.card.sectionId);
    const orderChanged = dragOrder.join("|") !== originalIds.join("|");
    try {
      if (sectionChanged && dragged) {
        await updateSimpleDashboardCard(
          activeDashboard.id,
          dragged.card.id,
          dragged.card.assetMetricId,
          nextSectionId
        );
      }
      if (orderChanged) {
        await reorderSimpleDashboardCards(activeDashboard.id, dragOrder);
      }
      await invalidate();
    } finally {
      setDraggedCardId(null);
      setDragOrder(null);
      setDragSectionByCardId(null);
    }
  };

  const commitCardDrop = () => {
    if (!draggedCardId || dropCommittedRef.current) return;
    dropCommittedRef.current = true;
    setDraggedCardId(null);
    void persistDragOrder();
  };

  const finishCardDrag = () => {
    if (!dropCommittedRef.current) {
      setDraggedCardId(null);
      setDragOrder(null);
      setDragSectionByCardId(null);
    }
    dropCommittedRef.current = false;
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
        (!dashboardMetricIds.has(metric.id) || metric.id === editingCard?.metric.id)
    );
    setSelectedMetricId(preferredMetric?.id ?? null);
  };

  const openAddCardEditor = (sectionId?: string | null) => {
    setEditingCardId(null);
    setSelectedAssetId(null);
    setSelectedMetricId(null);
    setSelectedSectionId(sectionId ?? activeSections[0]?.id ?? null);
    setCardCreatingSection(false);
    setCardNewSectionName("");
    setCardEditorMode("add");
  };

  const openEditCardEditor = (item: ResolvedMetricCard) => {
    setEditingCardId(item.card.id);
    setSelectedAssetId(item.asset.id);
    setSelectedMetricId(item.metric.id);
    setSelectedSectionId(item.card.sectionId);
    setCardCreatingSection(false);
    setCardNewSectionName("");
    setCardEditorMode("edit");
  };

  const saveSectionEditor = () => {
    if (!activeDashboard || !sectionName.trim()) return;
    if (sectionModalMode === "create") {
      createSectionMutation.mutate({ dashboardId: activeDashboard.id, name: sectionName.trim() });
    } else if (editingSectionId) {
      renameSectionMutation.mutate({ dashboardId: activeDashboard.id, sectionId: editingSectionId, name: sectionName.trim() });
    }
  };

  const saveCardEditor = () => {
    if (!activeDashboard || !selectedMetricId) return;
    if (cardEditorMode === "edit" && editingCardId) {
      updateCardMutation.mutate({
        dashboardId: activeDashboard.id,
        cardId: editingCardId,
        assetMetricId: selectedMetricId,
        sectionId: selectedSectionId
      });
    } else {
      addCardMutation.mutate({
        dashboardId: activeDashboard.id,
        assetMetricId: selectedMetricId,
        sectionId: selectedSectionId
      });
    }
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
            color="orange"
            onClick={() => { setTemplateManagerInitialId(null); setTemplateManagerOpened(true); }}
          >
            ▦ Templates
          </Button>
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
          <Button
            size="xs"
            variant="light"
            color="blue"
            loading={
              dashboardsQuery.isFetching
              || assetsQuery.isFetching
              || observationsQuery.isFetching
              || colorsQuery.isFetching
            }
            onClick={() => {
              setDraggedCardId(null);
              setDragOrder(null);
              setDragSectionByCardId(null);
              setDashboardDragOrder(null);
              void Promise.all([
                dashboardsQuery.refetch(),
                assetsQuery.refetch(),
                observationsQuery.refetch(),
                colorsQuery.refetch()
              ]);
            }}
          >
            Refresh (auto 15 s)
          </Button>
        </Group>
      </Group>

      {dashboards.length > 0 && (
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <Tabs
            value={activeDashboard?.id ?? null}
            onChange={value => value && setSelectedDashboardId(value)}
            style={{ minWidth: 0, flex: 1 }}
          >
            <Stack gap={4}>
              {standardDashboards.length > 0 && (
                <Group align="flex-start" gap="sm" wrap="nowrap">
                  <Group gap={4} wrap="nowrap" style={{ width: 240, flexShrink: 0, paddingTop: 4 }}>
                    <Text size="xs" fw={700} c="dimmed" style={{ flex: 1 }}>Standard</Text>
                    {activeDashboard && !activeDashboardIsTemplateInstance && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon size="xs" variant="light" color="orange" title="Convert to template" aria-label="Convert to template" onClick={() => {
                          setConvertTemplateName(activeDashboard.name);
                          setConvertCreateInstance(false);
                          setConvertMetricKey(convertMetricOptions[0]?.value ?? null);
                          setConvertTemplateOpen(true);
                        }}>▦</ActionIcon>
                        <ActionIcon size="xs" variant="light" color="blue" title="Edit dashboard" aria-label="Edit dashboard" onClick={() => { setDashboardName(activeDashboard.name); setDashboardModalMode("rename"); }}><PencilIcon /></ActionIcon>
                        <ActionIcon size="xs" variant="light" color="red" title="Delete dashboard" aria-label="Delete dashboard" onClick={() => setDeleteTarget({ type: "dashboard", id: activeDashboard.id, name: activeDashboard.name })}><TrashIcon /></ActionIcon>
                      </Group>
                    )}
                  </Group>
                  <Tabs.List style={{ flex: 1, flexWrap: "wrap", overflow: "visible" }}>
                    {standardDashboards.map(dashboard => (
                      <Tabs.Tab
                        key={dashboard.id}
                        value={dashboard.id}
                        draggable
                        onDragStart={() => {
                          setDraggedDashboardId(dashboard.id);
                          setDashboardDragOrder(dashboards.map(item => item.id));
                        }}
                        onDragEnter={() => draggedDashboardId && previewMoveDashboard(draggedDashboardId, dashboard.id)}
                        onDragOver={event => event.preventDefault()}
                        onDragEnd={() => {
                          persistDashboardOrder();
                          setDraggedDashboardId(null);
                        }}
                        style={{ cursor: "grab", opacity: draggedDashboardId === dashboard.id ? 0.6 : 1 }}
                      >
                        {dashboard.name}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Group>
              )}
              {templateDashboardGroups.map(group => {
                const templateSelected = activeDashboard?.templateId === group.templateId;
                const templateHistoryLaunch = historyLaunchForTemplate(group.templateId, group.templateName, group.dashboards);

                return (
                <Group key={group.templateId} align="flex-start" gap="sm" wrap="nowrap">
                  <Group
                    gap={4}
                    wrap="nowrap"
                    title={`Template: ${group.templateName}`}
                    style={{ width: 240, flexShrink: 0, paddingTop: 4, minWidth: 0 }}
                  >
                    <Text span size="xs" c={templateSelected ? "blue" : "orange"} aria-hidden="true">▦</Text>
                    <Text
                      size="xs"
                      fw={700}
                      c={templateSelected ? "blue" : undefined}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                    >
                      {group.templateName}
                    </Text>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon
                        size="xs"
                        variant="light"
                        color="blue"
                        title={`Edit template: ${group.templateName}`}
                        aria-label={`Edit template: ${group.templateName}`}
                        onClick={() => { setTemplateManagerInitialId(group.templateId); setTemplateManagerOpened(true); }}
                      >
                        <PencilIcon />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="light"
                        color="violet"
                        title={`Open template in History: ${group.templateName}`}
                        aria-label={`Open template in History: ${group.templateName}`}
                        disabled={!onOpenTemplateInHistory || !templateHistoryLaunch}
                        onClick={() => {
                          if (templateHistoryLaunch && onOpenTemplateInHistory) onOpenTemplateInHistory(templateHistoryLaunch);
                        }}
                      >
                        <NavigationIcon page="history" size={14} />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="light"
                        color="blue"
                        title={templateSelected ? "Rename selected dashboard" : "Select a template metric before renaming"}
                        aria-label="Rename selected dashboard"
                        disabled={!templateSelected || !activeDashboard}
                        onClick={() => {
                          if (!activeDashboard) return;
                          setDashboardName(activeDashboard.name);
                          setDashboardModalMode("rename");
                        }}
                      >
                        <PencilIcon />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="light"
                        color="orange"
                        title={templateSelected ? "Detach from template" : "Select a template metric before detaching"}
                        aria-label="Detach from template"
                        disabled={!templateSelected}
                        onClick={() => setDetachConfirmOpen(true)}
                      >
                        <DetachIcon />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="light"
                        color="red"
                        title={templateSelected ? "Delete instance" : "Select a template metric before deleting the instance"}
                        aria-label="Delete instance"
                        disabled={!templateSelected}
                        onClick={() => {
                          if (templateSelected && activeDashboard) {
                            setDeleteTarget({ type: "dashboard", id: activeDashboard.id, name: activeDashboard.name });
                          }
                        }}
                      >
                        <TrashIcon />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Tabs.List style={{ flex: 1, flexWrap: "wrap", overflow: "visible" }}>
                    {group.dashboards.map(dashboard => {
                      const metricKey = dashboard.templateMetricKey ?? "";
                      const metricLabel = metricDisplayNameByKey.get(metricKey) ?? metricKey;
                      return (
                        <Tabs.Tab key={dashboard.id} value={dashboard.id}>
                          <span title={`From template: ${group.templateName} · Metric: ${metricKey}`}>{metricLabel}</span>
                        </Tabs.Tab>
                      );
                    })}
                  </Tabs.List>
                </Group>
                );
              })}
            </Stack>
          </Tabs>
          {!activeDashboardIsTemplateInstance && (
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="green"
                onClick={() => { setSectionName(""); setEditingSectionId(null); setSectionModalMode("create"); }}
              >
                + Add section
              </Button>
              <Button
                size="xs"
                variant="light"
                color="green"
                onClick={() => openAddCardEditor()}
              >
                + Add card
              </Button>
            </Group>
          )}
        </Group>
      )}

      {!activeDashboard ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <Text fw={600}>No dashboard yet</Text>
            <Text size="sm" c="dimmed">Create a dashboard, then add Asset + Metric cards.</Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="lg">
          {activeSections.map(section => {
            const sectionCards = orderedActiveCards.filter(item => effectiveSectionId(item.card) === section.id);
            return (
              <Stack
                key={section.id}
                gap="sm"
                onDragEnter={() => { if (!activeDashboardIsTemplateInstance && draggedCardId) previewMoveCardToSection(draggedCardId, section.id); }}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); if (!activeDashboardIsTemplateInstance) commitCardDrop(); }}
              >
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text size="sm" fw={700} c="dimmed">{section.name}</Text>
                  <div style={{ height: 1, flex: 1, background: "var(--mantine-color-dark-4)" }} />
                  {!activeDashboardIsTemplateInstance && (<>
                    <ActionIcon size="sm" variant="light" color="blue" title="Rename section" onClick={() => { setEditingSectionId(section.id); setSectionName(section.name); setSectionModalMode("rename"); }}>✎</ActionIcon>
                    <ActionIcon size="sm" variant="light" color="red" title="Delete section" onClick={() => setDeleteTarget({ type: "section", dashboardId: activeDashboard.id, sectionId: section.id, name: section.name })}>×</ActionIcon>
                    <Button size="compact-xs" variant="light" color="green" onClick={() => openAddCardEditor(section.id)}>+ Add card</Button>
                  </>)}
                </Group>
                {sectionCards.length === 0 ? (
                  <Text size="xs" c="dimmed">No cards in this section.</Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                    {sectionCards.map(({ card, asset, metric, observation }) => {
                      const color = metricColors.get(metric.key) ?? defaultMetricColor(metric.key);
                      return (
                        <Card
                          key={card.id}
                          withBorder
                          radius="md"
                          p="sm"
                          draggable={!activeDashboardIsTemplateInstance}
                          onDragStart={() => !activeDashboardIsTemplateInstance && beginCardDrag(card.id)}
                          onDragEnter={event => {
                            event.stopPropagation();
                            if (!activeDashboardIsTemplateInstance && draggedCardId) previewMoveCard(draggedCardId, card.id, section.id);
                          }}
                          onDragEnd={() => !activeDashboardIsTemplateInstance && finishCardDrag()}
                          onDragOver={event => event.preventDefault()}
                          onDrop={event => { event.preventDefault(); event.stopPropagation(); if (!activeDashboardIsTemplateInstance) commitCardDrop(); }}
                          style={{ borderLeft: `4px solid ${color}`, cursor: activeDashboardIsTemplateInstance ? "default" : "grab", opacity: draggedCardId === card.id ? 0.55 : 1 }}
                        >
                          <Stack gap={4}>
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Text size="sm" fw={600} lineClamp={1} c={asset.health.status === "offline" ? "red" : undefined} style={{ minWidth: 0 }}>
                                {asset.sensor?.name ?? asset.externalId}
                              </Text>
                              {!activeDashboardIsTemplateInstance && (
                                <Group gap={4} wrap="nowrap">
                                  <ActionIcon size="sm" variant="light" color="blue" aria-label="Edit card" title="Edit card" onClick={() => openEditCardEditor({ card, asset, metric, observation })}>✎</ActionIcon>
                                  <ActionIcon size="sm" variant="light" color="red" aria-label="Remove card" title="Remove card" onClick={() => setDeleteTarget({ type: "card", dashboardId: activeDashboard.id, cardId: card.id, label: `${asset.sensor?.name ?? asset.externalId} · ${metric.displayName}` })}>×</ActionIcon>
                                </Group>
                              )}
                            </Group>
                            <Group gap={6} align="center" wrap="nowrap">
                              <Text
                                size="xl"
                                fw={700}
                                style={{
                                  color: observation ? color : "var(--mantine-color-dark-3)",
                                  lineHeight: "var(--mantine-line-height-xl)"
                                }}
                              >
                                {formatMetricValue(observation)}{metric.unit ? ` ${metric.unit}` : ""}
                              </Text>
                              <Badge variant="light" color={color} size="xs">{metric.displayName.toUpperCase()}</Badge>
                              {qualityColor(observation) && (
                                <Badge size="xs" variant="light" color={qualityColor(observation)!}>• {qualityLabel(observation)?.toUpperCase()}</Badge>
                              )}
                            </Group>
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Group gap={5} wrap="nowrap" style={{ minWidth: 0 }}>
                                {asset.location && <LocationIcon name={getLocationIconName(asset.location)} size={14} />}
                                <Text size="xs" c="dimmed" lineClamp={1}>{asset.location?.name ?? "Unassigned"}</Text>
                              </Group>
                              <Badge size="xs" variant="light" color={asset.health.status === "offline" ? "red" : "green"}>
                                {asset.health.status === "offline" ? "OFFLINE" : "ONLINE"}
                              </Badge>
                            </Group>
                          </Stack>
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      <DashboardTemplateManager
        opened={templateManagerOpened}
        onClose={() => setTemplateManagerOpened(false)}
        initialTemplateId={templateManagerInitialId}
      />


      <Modal opened={convertTemplateOpen} onClose={() => setConvertTemplateOpen(false)} title="Convert dashboard to template" centered>
        <Stack>
          <Text size="sm" c="dimmed">
            Sections, Assets and their order will be copied into a new template. The current dashboard stays unchanged.
          </Text>
          <TextInput
            ref={convertTemplateNameRef}
            label="Template name"
            value={convertTemplateName}
            onChange={event => setConvertTemplateName(event.currentTarget.value)}
          />
          <Checkbox
            label="Create a template instance after conversion"
            checked={convertCreateInstance}
            onChange={event => setConvertCreateInstance(event.currentTarget.checked)}
          />
          {convertCreateInstance && (
            <Select
              label="Instance metric"
              data={convertMetricOptions}
              value={convertMetricKey}
              onChange={setConvertMetricKey}
              searchable
              allowDeselect={false}
              nothingFoundMessage="No metric found on this dashboard"
            />
          )}
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setConvertTemplateOpen(false)}>Cancel</Button>
            <Button
              variant="light"
              color="orange"
              loading={convertDashboardToTemplateMutation.isPending}
              disabled={!activeDashboard || !convertTemplateName.trim() || (convertCreateInstance && !convertMetricKey)}
              onClick={() => {
                if (!activeDashboard || !convertTemplateName.trim()) return;
                convertDashboardToTemplateMutation.mutate({
                  dashboardId: activeDashboard.id,
                  name: convertTemplateName.trim(),
                  createInstance: convertCreateInstance,
                  metricKey: convertCreateInstance ? convertMetricKey : null
                });
              }}
            >
              Convert
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={detachConfirmOpen} onClose={() => setDetachConfirmOpen(false)} title="Detach from template" centered>
        <Stack>
          <Alert color="orange" variant="light" title="Create an independent dashboard">
            The current template structure and available metric cards will be copied into this dashboard. Future template changes will no longer affect it.
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setDetachConfirmOpen(false)}>Cancel</Button>
            <Button variant="light" color="orange" loading={detachDashboardMutation.isPending} onClick={() => activeDashboard && detachDashboardMutation.mutate(activeDashboard.id)}>Detach</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={dashboardModalMode !== null}
        onClose={() => setDashboardModalMode(null)}
        title={dashboardModalMode === "create" ? "New dashboard" : "Rename dashboard"}
      >
        <Stack>
          <TextInput
            label="Name"
            ref={dashboardNameInputRef}
            value={dashboardName}
            onChange={event => setDashboardName(event.currentTarget.value)}
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
        opened={sectionModalMode !== null}
        onClose={() => setSectionModalMode(null)}
        title={sectionModalMode === "create" ? "New section" : "Rename section"}
      >
        <Stack>
          <TextInput ref={sectionNameInputRef} label="Name" value={sectionName} onChange={event => setSectionName(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setSectionModalMode(null)}>Cancel</Button>
            <Button
              variant="light"
              color="green"
              disabled={!sectionName.trim()}
              loading={createSectionMutation.isPending || renameSectionMutation.isPending}
              onClick={saveSectionEditor}
            >
              {sectionModalMode === "create" ? "Add section" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === "dashboard" ? "Delete dashboard" : deleteTarget?.type === "section" ? "Delete section" : "Remove metric card"}
        centered
      >
        <Stack>
          <Alert color="red" variant="light" title="Confirmation required">
            {deleteTarget?.type === "dashboard"
              ? `Delete dashboard "${deleteTarget.name}" and all of its cards?`
              : deleteTarget?.type === "section"
                ? `Delete section "${deleteTarget.name}"? Its cards will move to another section.`
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
              loading={deleteDashboardMutation.isPending || deleteCardMutation.isPending || deleteSectionMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "dashboard") {
                  deleteDashboardMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null)
                  });
                } else if (deleteTarget.type === "section") {
                  deleteSectionMutation.mutate(
                    { dashboardId: deleteTarget.dashboardId, sectionId: deleteTarget.sectionId },
                    { onSuccess: () => setDeleteTarget(null) }
                  );
                } else {
                  deleteCardMutation.mutate(
                    { dashboardId: deleteTarget.dashboardId, cardId: deleteTarget.cardId },
                    { onSuccess: () => setDeleteTarget(null) }
                  );
                }
              }}
            >
              {deleteTarget?.type === "dashboard" ? "Delete dashboard" : deleteTarget?.type === "section" ? "Delete section" : "Remove card"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={cardEditorMode !== null}
        onClose={() => {
          setCardEditorMode(null);
          setEditingCardId(null);
        }}
        title={cardEditorMode === "edit" ? "Edit metric card" : "Add metric card"}
      >
        <Stack>
          <Select
            label="Asset"
            autoFocus
            searchable
            value={selectedAssetId}
            onChange={selectAssetForCard}
            data={assets.map(asset => ({
              value: asset.id,
              label: `${asset.sensor?.name ?? asset.externalId} · ${asset.location?.name ?? "Unassigned"}`
            }))}
          />
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              style={{ flex: 1 }}
              label="Section"
              value={selectedSectionId}
              onChange={setSelectedSectionId}
              data={activeSections.map(section => ({ value: section.id, label: section.name }))}
              disabled={cardCreatingSection}
            />
            <ActionIcon
              color="green"
              variant="light"
              size="lg"
              title="Create section"
              aria-label="Create section"
              onClick={() => {
                setCardCreatingSection(true);
                setCardNewSectionName("");
              }}
            >
              +
            </ActionIcon>
          </Group>
          {cardCreatingSection && (
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                label="New section name"
                value={cardNewSectionName}
                onChange={event => setCardNewSectionName(event.currentTarget.value)}
                autoFocus
              />
              <ActionIcon
                color="green"
                variant="light"
                size="lg"
                title="Create section"
                aria-label="Create section"
                loading={createCardSectionMutation.isPending}
                disabled={!activeDashboard || !cardNewSectionName.trim()}
                onClick={() => {
                  if (!activeDashboard || !cardNewSectionName.trim()) return;
                  createCardSectionMutation.mutate({
                    dashboardId: activeDashboard.id,
                    name: cardNewSectionName.trim()
                  });
                }}
              >
                ✓
              </ActionIcon>
              <ActionIcon
                color="gray"
                variant="light"
                size="lg"
                title="Cancel"
                aria-label="Cancel section creation"
                onClick={() => {
                  setCardCreatingSection(false);
                  setCardNewSectionName("");
                }}
              >
                ×
              </ActionIcon>
            </Group>
          )}
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
            <Button
              variant="light"
              color="gray"
              onClick={() => {
                setCardEditorMode(null);
                setEditingCardId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="light"
              color={cardEditorMode === "edit" ? "blue" : "green"}
              disabled={!activeDashboard || !selectedMetricId || cardCreatingSection}
              loading={addCardMutation.isPending || updateCardMutation.isPending}
              onClick={saveCardEditor}
            >
              {cardEditorMode === "edit" ? "Save" : "Add card"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
