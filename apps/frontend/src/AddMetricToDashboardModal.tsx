import React from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addSimpleDashboardCard,
  createSimpleDashboard,
  createSimpleDashboardSection,
  getSimpleDashboards
} from "./api";
import type { Asset, AssetMetric } from "./types";

interface Props {
  opened: boolean;
  asset: Asset | null;
  metric: AssetMetric | null;
  onClose: () => void;
}

export function AddMetricToDashboardModal({ opened, asset, metric, onClose }: Props) {
  const queryClient = useQueryClient();
  const dashboardsQuery = useQuery({
    queryKey: ["simple-dashboards"],
    queryFn: getSimpleDashboards,
    enabled: opened
  });
  const [dashboardId, setDashboardId] = React.useState<string | null>(null);
  const [sectionId, setSectionId] = React.useState<string | null>(null);
  const [creatingDashboard, setCreatingDashboard] = React.useState(false);
  const [newDashboardName, setNewDashboardName] = React.useState("");
  const [creatingSection, setCreatingSection] = React.useState(false);
  const [newSectionName, setNewSectionName] = React.useState("");

  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const sections = dashboardsQuery.data?.sections ?? [];
  const selectedSections = sections
    .filter(section => section.dashboardId === dashboardId)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  React.useEffect(() => {
    if (!opened) {
      setCreatingDashboard(false);
      setCreatingSection(false);
      setNewDashboardName("");
      setNewSectionName("");
      return;
    }
    const firstDashboard = dashboards[0];
    if (!firstDashboard) {
      setDashboardId(null);
      setSectionId(null);
      return;
    }
    setDashboardId(current => current && dashboards.some(item => item.id === current) ? current : firstDashboard.id);
  }, [opened, dashboards]);

  React.useEffect(() => {
    if (!dashboardId) {
      setSectionId(null);
      return;
    }
    if (sectionId && sections.some(section => section.id === sectionId && section.dashboardId === dashboardId)) {
      return;
    }
    const firstSection = sections
      .filter(section => section.dashboardId === dashboardId)
      .sort((left, right) => left.sortOrder - right.sortOrder)[0];
    setSectionId(firstSection?.id ?? null);
  }, [dashboardId, sectionId, sections]);

  const createDashboardMutation = useMutation({
    mutationFn: () => createSimpleDashboard(newDashboardName.trim()),
    onSuccess: async created => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      const refreshed = await queryClient.fetchQuery({
        queryKey: ["simple-dashboards"],
        queryFn: getSimpleDashboards
      });
      setDashboardId(created.id);
      const firstSection = refreshed.sections
        .filter(section => section.dashboardId === created.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)[0];
      setSectionId(firstSection?.id ?? null);
      setCreatingDashboard(false);
      setNewDashboardName("");
    }
  });

  const createSectionMutation = useMutation({
    mutationFn: () => {
      if (!dashboardId) throw new Error("Select a dashboard first.");
      return createSimpleDashboardSection(dashboardId, newSectionName.trim());
    },
    onSuccess: async created => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      setSectionId(created.id);
      setCreatingSection(false);
      setNewSectionName("");
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!dashboardId || !sectionId || !metric) {
        throw new Error("Dashboard, section and metric are required.");
      }
      return addSimpleDashboardCard(dashboardId, metric.id, sectionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      onClose();
    }
  });

  const createDashboard = React.useCallback(() => {
    if (!newDashboardName.trim() || createDashboardMutation.isPending) return;
    createDashboardMutation.mutate();
  }, [createDashboardMutation, newDashboardName]);

  const createSection = React.useCallback(() => {
    if (!dashboardId || !newSectionName.trim() || createSectionMutation.isPending) return;
    createSectionMutation.mutate();
  }, [createSectionMutation, dashboardId, newSectionName]);

  React.useEffect(() => {
    if (!opened) return undefined;
    const handleSave = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      if (creatingDashboard) {
        createDashboard();
      } else if (creatingSection) {
        createSection();
      } else if (dashboardId && sectionId && metric && !addMutation.isPending) {
        addMutation.mutate();
      }
    };
    window.addEventListener("keydown", handleSave, true);
    return () => window.removeEventListener("keydown", handleSave, true);
  }, [
    addMutation,
    createDashboard,
    createSection,
    creatingDashboard,
    creatingSection,
    dashboardId,
    metric,
    opened,
    sectionId
  ]);

  const errors = [
    createDashboardMutation.error,
    createSectionMutation.error,
    addMutation.error
  ].filter((error): error is Error => error instanceof Error);

  return (
    <Modal opened={opened} onClose={onClose} title="Add metric to dashboard" centered>
      <Stack gap="md">
        <div>
          <Text size="xs" c="dimmed">Asset</Text>
          <Text fw={600}>{asset?.name ?? asset?.externalId ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Metric</Text>
          <Text fw={600}>{metric ? `${metric.displayName}${metric.unit ? ` (${metric.unit})` : ""}` : "—"}</Text>
        </div>

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Select
            style={{ flex: 1 }}
            label="Dashboard"
            placeholder="Select dashboard"
            value={dashboardId}
            onChange={value => {
              setDashboardId(value);
              setSectionId(null);
              setCreatingSection(false);
              setNewSectionName("");
            }}
            data={dashboards.map(dashboard => ({ value: dashboard.id, label: dashboard.name }))}
            disabled={dashboardsQuery.isLoading || creatingDashboard}
          />
          <ActionIcon
            color="green"
            variant="light"
            size="lg"
            title="Create dashboard"
            aria-label="Create dashboard"
            onClick={() => {
              setCreatingDashboard(true);
              setNewDashboardName("");
            }}
          >
            +
          </ActionIcon>
        </Group>

        {creatingDashboard && (
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              label="New dashboard name"
              value={newDashboardName}
              onChange={event => setNewDashboardName(event.currentTarget.value)}
              autoFocus
            />
            <ActionIcon
              color="green"
              variant="light"
              size="lg"
              title="Create dashboard"
              aria-label="Create dashboard"
              loading={createDashboardMutation.isPending}
              disabled={!newDashboardName.trim()}
              onClick={createDashboard}
            >
              ✓
            </ActionIcon>
            <ActionIcon
              color="gray"
              variant="light"
              size="lg"
              title="Cancel"
              aria-label="Cancel dashboard creation"
              onClick={() => {
                setCreatingDashboard(false);
                setNewDashboardName("");
              }}
            >
              ×
            </ActionIcon>
          </Group>
        )}

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Select
            style={{ flex: 1 }}
            label="Section"
            placeholder="Select section"
            value={sectionId}
            onChange={setSectionId}
            data={selectedSections.map(section => ({ value: section.id, label: section.name }))}
            disabled={!dashboardId || selectedSections.length === 0 || creatingSection}
          />
          <ActionIcon
            color="green"
            variant="light"
            size="lg"
            title="Create section"
            aria-label="Create section"
            disabled={!dashboardId}
            onClick={() => {
              setCreatingSection(true);
              setNewSectionName("");
            }}
          >
            +
          </ActionIcon>
        </Group>

        {creatingSection && (
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              label="New section name"
              value={newSectionName}
              onChange={event => setNewSectionName(event.currentTarget.value)}
              autoFocus
            />
            <ActionIcon
              color="green"
              variant="light"
              size="lg"
              title="Create section"
              aria-label="Create section"
              loading={createSectionMutation.isPending}
              disabled={!newSectionName.trim()}
              onClick={createSection}
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
                setCreatingSection(false);
                setNewSectionName("");
              }}
            >
              ×
            </ActionIcon>
          </Group>
        )}

        {dashboards.length === 0 && !dashboardsQuery.isLoading && !creatingDashboard && (
          <Alert color="blue" variant="light">Create a dashboard with the + button above.</Alert>
        )}
        {errors.length > 0 && (
          <Alert color="red" variant="light">{errors[0].message}</Alert>
        )}
        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={onClose}>Cancel</Button>
          <Button
            variant="light"
            color="green"
            disabled={!dashboardId || !sectionId || !metric || creatingDashboard || creatingSection}
            loading={addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            Add to dashboard
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
