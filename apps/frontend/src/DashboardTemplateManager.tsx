import React from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeleteActionIcon } from "./TableActionIcons";
import type { HistoryTemplateLaunchConfig } from "./HistoryPanel";
import {
  addSimpleDashboardTemplateAsset,
  createSimpleDashboardTemplate,
  createSimpleDashboardTemplateSection,
  deleteSimpleDashboardTemplate,
  deleteSimpleDashboardTemplateAsset,
  deleteSimpleDashboardTemplateSection,
  getAssets,
  getSimpleDashboards,
  getSimpleDashboardTemplates,
  instantiateSimpleDashboardTemplate,
  renameSimpleDashboardTemplate,
  renameSimpleDashboardTemplateSection,
  reorderSimpleDashboardTemplateAssets,
  reorderSimpleDashboardTemplateSections
} from "./api";

interface DashboardTemplateManagerProps {
  opened: boolean;
  onClose: () => void;
  initialTemplateId?: string | null;
  onOpenInHistory?: (launch: HistoryTemplateLaunchConfig) => void;
}

export function DashboardTemplateManager({ opened, onClose, initialTemplateId, onOpenInHistory }: DashboardTemplateManagerProps) {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["simple-dashboard-templates"],
    queryFn: getSimpleDashboardTemplates,
    enabled: opened
  });
  const assetsQuery = useQuery({ queryKey: ["assets"], queryFn: getAssets, enabled: opened });
  const dashboardsQuery = useQuery({ queryKey: ["simple-dashboards"], queryFn: getSimpleDashboards, enabled: opened });
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [newSectionName, setNewSectionName] = React.useState("");
  const [assetSectionId, setAssetSectionId] = React.useState<string | null>(null);
  const [assetId, setAssetId] = React.useState<string | null>(null);
  const [metricKeys, setMetricKeys] = React.useState<string[]>([]);
  const [draggedMetricKey, setDraggedMetricKey] = React.useState<string | null>(null);
  const [instanceMetricsDirty, setInstanceMetricsDirty] = React.useState(false);
  const syncedTemplateIdRef = React.useRef<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<{ type: "template" | "section"; id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<{ type: "template" | "section" | "asset"; id: string; name: string } | null>(null);

  const invalidateTemplates = async () => {
    await queryClient.invalidateQueries({ queryKey: ["simple-dashboard-templates"] });
  };
  const invalidateDashboards = async () => {
    await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
  };

  const createTemplate = useMutation({
    mutationFn: createSimpleDashboardTemplate,
    onSuccess: async created => {
      setSelectedTemplateId(created.id);
      setNewTemplateName("");
      await invalidateTemplates();
    }
  });
  const renameTemplate = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameSimpleDashboardTemplate(id, name),
    onSuccess: async () => { setRenameTarget(null); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const deleteTemplate = useMutation({
    mutationFn: deleteSimpleDashboardTemplate,
    onSuccess: async () => { setSelectedTemplateId(null); setDeleteTarget(null); await invalidateTemplates(); }
  });
  const createSection = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name: string }) => createSimpleDashboardTemplateSection(templateId, name),
    onSuccess: async created => { setNewSectionName(""); setAssetSectionId(created.id); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const renameSection = useMutation({
    mutationFn: ({ templateId, sectionId, name }: { templateId: string; sectionId: string; name: string }) => renameSimpleDashboardTemplateSection(templateId, sectionId, name),
    onSuccess: async () => { setRenameTarget(null); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const deleteSection = useMutation({
    mutationFn: ({ templateId, sectionId }: { templateId: string; sectionId: string }) => deleteSimpleDashboardTemplateSection(templateId, sectionId),
    onSuccess: async () => { setDeleteTarget(null); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const addAsset = useMutation({
    mutationFn: ({ templateId, sectionId, assetId }: { templateId: string; sectionId: string; assetId: string }) => addSimpleDashboardTemplateAsset(templateId, sectionId, assetId),
    onSuccess: async () => { setAssetId(null); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const deleteAsset = useMutation({
    mutationFn: ({ templateId, cardId }: { templateId: string; cardId: string }) => deleteSimpleDashboardTemplateAsset(templateId, cardId),
    onSuccess: async () => { setDeleteTarget(null); await invalidateTemplates(); await invalidateDashboards(); }
  });
  const saveInstanceMetrics = useMutation({
    mutationFn: ({ templateId, metrics }: { templateId: string; metrics: string[] }) => instantiateSimpleDashboardTemplate(templateId, metrics),
    onSuccess: async dashboards => {
      setMetricKeys(dashboards.map(item => item.templateMetricKey).filter((value): value is string => Boolean(value)));
      setInstanceMetricsDirty(false);
      await invalidateDashboards();
    }
  });
  const reorderSections = useMutation({
    mutationFn: ({ templateId, sectionIds }: { templateId: string; sectionIds: string[] }) => reorderSimpleDashboardTemplateSections(templateId, sectionIds),
    onSuccess: async () => { await invalidateTemplates(); await invalidateDashboards(); }
  });
  const reorderAssets = useMutation({
    mutationFn: ({ templateId, cardIds }: { templateId: string; cardIds: string[] }) => reorderSimpleDashboardTemplateAssets(templateId, cardIds),
    onSuccess: async () => { await invalidateTemplates(); await invalidateDashboards(); }
  });

  const templates = templatesQuery.data?.templates ?? [];
  const sections = templatesQuery.data?.sections ?? [];
  const templateCards = templatesQuery.data?.cards ?? [];
  const assets = assetsQuery.data ?? [];
  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const activeTemplate = templates.find(item => item.id === selectedTemplateId)
    ?? templates.find(item => item.id === initialTemplateId)
    ?? templates[0]
    ?? null;
  const activeSections = activeTemplate
    ? sections.filter(item => item.templateId === activeTemplate.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  React.useEffect(() => {
    if (!opened) return;
    if (initialTemplateId && templates.some(item => item.id === initialTemplateId)) {
      setSelectedTemplateId(initialTemplateId);
    } else if (!selectedTemplateId && templates[0]) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [opened, initialTemplateId, templates.length]);


  React.useEffect(() => {
    if (!opened || !activeTemplate || !dashboardsQuery.data) return;
    const serverMetricKeys = dashboards
      .filter(item => item.templateId === activeTemplate.id && item.templateMetricKey)
      .map(item => item.templateMetricKey!);

    if (syncedTemplateIdRef.current !== activeTemplate.id) {
      syncedTemplateIdRef.current = activeTemplate.id;
      setMetricKeys(serverMetricKeys);
      setInstanceMetricsDirty(false);
      return;
    }

    if (!instanceMetricsDirty) {
      setMetricKeys(serverMetricKeys);
    }
  }, [opened, activeTemplate?.id, dashboardsQuery.dataUpdatedAt, instanceMetricsDirty]);

  React.useEffect(() => {
    if (!opened) {
      syncedTemplateIdRef.current = null;
      setInstanceMetricsDirty(false);
    }
  }, [opened]);

  React.useEffect(() => {
    if (!opened) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      if (renameTarget) {
        if (!renameValue.trim() || !activeTemplate || renameTemplate.isPending || renameSection.isPending) return;
        event.preventDefault();
        if (renameTarget.type === "template") {
          renameTemplate.mutate({ id: renameTarget.id, name: renameValue.trim() });
        } else {
          renameSection.mutate({ templateId: activeTemplate.id, sectionId: renameTarget.id, name: renameValue.trim() });
        }
        return;
      }
      if (!activeTemplate || saveInstanceMetrics.isPending) return;
      event.preventDefault();
      saveInstanceMetrics.mutate({ templateId: activeTemplate.id, metrics: metricKeys });
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [opened, activeTemplate?.id, metricKeys, renameTarget, renameValue, saveInstanceMetrics.isPending, renameTemplate.isPending, renameSection.isPending]);

  React.useEffect(() => {
    if (activeSections.length > 0 && !activeSections.some(item => item.id === assetSectionId)) {
      setAssetSectionId(activeSections[0]!.id);
    }
  }, [activeTemplate?.id, activeSections.length]);

  const usedAssetIds = new Set(
    activeTemplate ? templateCards.filter(item => item.templateId === activeTemplate.id).map(item => item.assetId) : []
  );
  const assetOptions = assets
    .filter(asset => !usedAssetIds.has(asset.id))
    .map(asset => ({ value: asset.id, label: asset.sensor?.name ?? asset.externalId }));
  const availableMetricKeys = [...new Map(
    assets.flatMap(asset => asset.metrics).map(metric => [metric.key, { value: metric.key, label: metric.displayName }])
  ).values()].sort((a, b) => a.label.localeCompare(b.label));

  const historyLaunch = React.useMemo<HistoryTemplateLaunchConfig | null>(() => {
    if (!activeTemplate || metricKeys.length === 0) return null;

    const tabs = metricKeys.map(metricKey => {
      const metricLabel = availableMetricKeys.find(item => item.value === metricKey)?.label ?? metricKey;
      const graphs = activeSections.flatMap(section => {
        const assetIds = templateCards
          .filter(card => card.templateId === activeTemplate.id && card.sectionId === section.id)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(card => assets.find(asset => asset.id === card.assetId))
          .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
          .filter(asset =>
            asset.sensor !== null &&
            asset.metrics.some(metric => metric.enabled && metric.key === metricKey)
          )
          .map(asset => asset.id);

        if (assetIds.length === 0) return [];

        return [{
          id: `template-history-graph-${activeTemplate.id}-${metricKey}-${section.id}`,
          name: section.name,
          metricKey,
          assetIds
        }];
      });

      return {
        id: `template-history-tab-${activeTemplate.id}-${metricKey}`,
        name: metricLabel,
        graphs
      };
    }).filter(tab => tab.graphs.length > 0);

    if (tabs.length === 0) return null;

    return {
      key: `${activeTemplate.id}:${activeTemplate.updatedAt}:${metricKeys.join(",")}`,
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      tabs
    };
  }, [
    activeTemplate,
    activeSections,
    assets,
    availableMetricKeys,
    metricKeys,
    templateCards
  ]);

  const openInHistory = (): void => {
    if (!historyLaunch || !onOpenInHistory) return;
    onOpenInHistory(historyLaunch);
    onClose();
  };

  return (
    <>
      <Modal opened={opened} onClose={onClose} title="Dashboard templates" size="xl" centered>
        <Stack gap="md">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="New template"
              placeholder="e.g. Main Home"
              value={newTemplateName}
              onChange={event => setNewTemplateName(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button variant="light" color="green" disabled={!newTemplateName.trim()} onClick={() => createTemplate.mutate(newTemplateName.trim())}>+ Add template</Button>
          </Group>

          {templates.length > 0 && (
            <Select
              label="Template"
              data={templates.map(item => ({ value: item.id, label: item.name }))}
              value={activeTemplate?.id ?? null}
              onChange={setSelectedTemplateId}
            />
          )}

          {!activeTemplate ? (
            <Alert color="blue" variant="light">Create a template to define reusable sections and Assets.</Alert>
          ) : (
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Title order={4}>{activeTemplate.name}</Title>
                  <Text size="xs" c="dimmed">Instances inherit sections, Assets and ordering from this template.</Text>
                </div>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    color="cyan"
                    disabled={!historyLaunch || instanceMetricsDirty || !onOpenInHistory}
                    title={instanceMetricsDirty ? "Save instance metrics before opening this template in History" : "Generate an ephemeral History view from this template"}
                    onClick={openInHistory}
                  >
                    Open in History
                  </Button>
                  <Button size="xs" variant="light" color="blue" onClick={() => { setRenameTarget({ type: "template", id: activeTemplate.id, name: activeTemplate.name }); setRenameValue(activeTemplate.name); }}>Rename</Button>
                  <DeleteActionIcon onClick={() => setDeleteTarget({ type: "template", id: activeTemplate.id, name: activeTemplate.name })} />
                </Group>
              </Group>

              <Card withBorder radius="md" p="sm">
                <Stack gap="sm">
                  <div>
                    <Text fw={600}>Instance metrics</Text>
                    <Text size="xs" c="dimmed">Selected metrics are the instances managed by this template. Save adds missing instances and removes unchecked ones.</Text>
                  </div>
                  <MultiSelect
                    label="Metrics"
                    placeholder="Choose metrics"
                    searchable
                    data={availableMetricKeys}
                    value={metricKeys}
                    onChange={values => {
                      setMetricKeys(previous => [
                        ...previous.filter(value => values.includes(value)),
                        ...values.filter(value => !previous.includes(value))
                      ]);
                      setInstanceMetricsDirty(true);
                    }}
                  />
                  {metricKeys.length > 0 && (
                    <div>
                      <Text size="xs" fw={600} mb={4}>Instance order</Text>
                      <Group gap="xs" wrap="wrap">
                        {metricKeys.map(metricKey => {
                          const option = availableMetricKeys.find(item => item.value === metricKey);
                          return (
                            <Badge
                              key={metricKey}
                              variant="light"
                              color="gray"
                              draggable
                              onDragStart={() => setDraggedMetricKey(metricKey)}
                              onDragEnter={() => {
                                if (!draggedMetricKey || draggedMetricKey === metricKey) return;
                                setMetricKeys(current => {
                                  const sourceIndex = current.indexOf(draggedMetricKey);
                                  const targetIndex = current.indexOf(metricKey);
                                  if (sourceIndex < 0 || targetIndex < 0) return current;
                                  const next = [...current];
                                  const [moved] = next.splice(sourceIndex, 1);
                                  next.splice(targetIndex, 0, moved!);
                                  return next;
                                });
                                setInstanceMetricsDirty(true);
                              }}
                              onDragOver={event => event.preventDefault()}
                              onDragEnd={() => setDraggedMetricKey(null)}
                              style={{ cursor: "grab", opacity: draggedMetricKey === metricKey ? 0.6 : 1 }}
                              title="Drag to reorder template instances"
                            >
                              {option?.label ?? metricKey}
                            </Badge>
                          );
                        })}
                      </Group>
                    </div>
                  )}
                  <Group justify="flex-end">
                    <Button
                      variant="light"
                      color="green"
                      loading={saveInstanceMetrics.isPending}
                      disabled={!instanceMetricsDirty}
                      onClick={() => saveInstanceMetrics.mutate({ templateId: activeTemplate.id, metrics: metricKeys })}
                    >
                      Save instance metrics
                    </Button>
                  </Group>
                </Stack>
              </Card>

              <Group align="flex-end" wrap="nowrap">
                <TextInput label="New section" value={newSectionName} onChange={event => setNewSectionName(event.currentTarget.value)} style={{ flex: 1 }} />
                <Button variant="light" color="green" disabled={!newSectionName.trim()} onClick={() => createSection.mutate({ templateId: activeTemplate.id, name: newSectionName.trim() })}>+ Add section</Button>
              </Group>

              {activeSections.map(section => {
                const cards = templateCards.filter(item => item.templateId === activeTemplate.id && item.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder);
                return (
                  <Card key={section.id} withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={700}>{section.name}</Text>
                        <Group gap={4}>
                          <ActionIcon variant="light" color="gray" title="Move section up" disabled={activeSections[0]?.id === section.id} onClick={() => {
                            const index = activeSections.findIndex(item => item.id === section.id);
                            if (index <= 0) return;
                            const ids = activeSections.map(item => item.id);
                            [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                            reorderSections.mutate({ templateId: activeTemplate.id, sectionIds: ids });
                          }}>↑</ActionIcon>
                          <ActionIcon variant="light" color="gray" title="Move section down" disabled={activeSections[activeSections.length - 1]?.id === section.id} onClick={() => {
                            const index = activeSections.findIndex(item => item.id === section.id);
                            if (index < 0 || index >= activeSections.length - 1) return;
                            const ids = activeSections.map(item => item.id);
                            [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                            reorderSections.mutate({ templateId: activeTemplate.id, sectionIds: ids });
                          }}>↓</ActionIcon>
                          <ActionIcon variant="light" color="blue" title="Rename section" onClick={() => { setRenameTarget({ type: "section", id: section.id, name: section.name }); setRenameValue(section.name); }}>✎</ActionIcon>
                          <DeleteActionIcon onClick={() => setDeleteTarget({ type: "section", id: section.id, name: section.name })} />
                        </Group>
                      </Group>
                      {cards.length === 0 ? <Text size="xs" c="dimmed">No Assets.</Text> : cards.map(card => {
                        const asset = assets.find(item => item.id === card.assetId);
                        const label = asset?.sensor?.name ?? asset?.name ?? asset?.externalId ?? card.assetId;
                        return (
                          <Group key={card.id} justify="space-between" p={4}>
                            <Group gap="xs"><Badge variant="light" color="gray">Asset</Badge><Text size="sm">{label}</Text></Group>
                            <Group gap={4}>
                              <ActionIcon variant="light" color="gray" title="Move Asset up" disabled={cards[0]?.id === card.id} onClick={() => {
                                const sectionIndex = cards.findIndex(item => item.id === card.id);
                                if (sectionIndex <= 0) return;
                                const allCards = activeSections.flatMap(activeSection => templateCards.filter(item => item.templateId === activeTemplate.id && item.sectionId === activeSection.id).sort((a, b) => a.sortOrder - b.sortOrder));
                                const left = allCards.findIndex(item => item.id === cards[sectionIndex - 1]!.id);
                                const right = allCards.findIndex(item => item.id === card.id);
                                [allCards[left], allCards[right]] = [allCards[right], allCards[left]];
                                reorderAssets.mutate({ templateId: activeTemplate.id, cardIds: allCards.map(item => item.id) });
                              }}>↑</ActionIcon>
                              <ActionIcon variant="light" color="gray" title="Move Asset down" disabled={cards[cards.length - 1]?.id === card.id} onClick={() => {
                                const sectionIndex = cards.findIndex(item => item.id === card.id);
                                if (sectionIndex < 0 || sectionIndex >= cards.length - 1) return;
                                const allCards = activeSections.flatMap(activeSection => templateCards.filter(item => item.templateId === activeTemplate.id && item.sectionId === activeSection.id).sort((a, b) => a.sortOrder - b.sortOrder));
                                const left = allCards.findIndex(item => item.id === card.id);
                                const right = allCards.findIndex(item => item.id === cards[sectionIndex + 1]!.id);
                                [allCards[left], allCards[right]] = [allCards[right], allCards[left]];
                                reorderAssets.mutate({ templateId: activeTemplate.id, cardIds: allCards.map(item => item.id) });
                              }}>↓</ActionIcon>
                              <DeleteActionIcon onClick={() => setDeleteTarget({ type: "asset", id: card.id, name: label })} />
                            </Group>
                          </Group>
                        );
                      })}
                    </Stack>
                  </Card>
                );
              })}

              <Group align="flex-end" wrap="nowrap">
                <Select label="Section" data={activeSections.map(section => ({ value: section.id, label: section.name }))} value={assetSectionId} onChange={setAssetSectionId} style={{ width: 220 }} />
                <Select label="Asset" searchable data={assetOptions} value={assetId} onChange={setAssetId} style={{ flex: 1 }} />
                <Button variant="light" color="green" disabled={!assetSectionId || !assetId} onClick={() => activeTemplate && assetSectionId && assetId && addAsset.mutate({ templateId: activeTemplate.id, sectionId: assetSectionId, assetId })}>+ Add Asset</Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal opened={renameTarget !== null} onClose={() => setRenameTarget(null)} title={renameTarget?.type === "template" ? "Rename template" : "Rename section"} centered>
        <Stack>
          <TextInput label="Name" value={renameValue} onChange={event => setRenameValue(event.currentTarget.value)} data-autofocus />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button variant="light" color="blue" disabled={!renameValue.trim()} onClick={() => {
              if (!renameTarget || !activeTemplate) return;
              if (renameTarget.type === "template") renameTemplate.mutate({ id: renameTarget.id, name: renameValue.trim() });
              else renameSection.mutate({ templateId: activeTemplate.id, sectionId: renameTarget.id, name: renameValue.trim() });
            }}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Confirmation required" centered>
        <Stack>
          <Alert color="red" variant="light">
            {deleteTarget?.type === "template" ? `Delete template \"${deleteTarget.name}\"? Detach or delete its instances first.` : deleteTarget?.type === "section" ? `Delete section \"${deleteTarget.name}\" and its template Assets?` : `Remove Asset \"${deleteTarget?.name}\" from this template?`}
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="light" color="red" onClick={() => {
              if (!deleteTarget || !activeTemplate) return;
              if (deleteTarget.type === "template") deleteTemplate.mutate(deleteTarget.id);
              else if (deleteTarget.type === "section") deleteSection.mutate({ templateId: activeTemplate.id, sectionId: deleteTarget.id });
              else deleteAsset.mutate({ templateId: activeTemplate.id, cardId: deleteTarget.id });
            }}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
