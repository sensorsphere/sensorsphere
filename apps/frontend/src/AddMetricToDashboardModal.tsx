import React from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addSimpleDashboardCard, getSimpleDashboards } from "./api";
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

  const dashboards = dashboardsQuery.data?.dashboards ?? [];
  const sections = dashboardsQuery.data?.sections ?? [];
  const selectedSections = sections
    .filter(section => section.dashboardId === dashboardId)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  React.useEffect(() => {
    if (!opened) return;
    const firstDashboard = dashboards[0];
    if (!firstDashboard) return;
    setDashboardId(current => current && dashboards.some(item => item.id === current) ? current : firstDashboard.id);
  }, [opened, dashboards]);

  React.useEffect(() => {
    if (!dashboardId) {
      setSectionId(null);
      return;
    }
    const firstSection = sections
      .filter(section => section.dashboardId === dashboardId)
      .sort((left, right) => left.sortOrder - right.sortOrder)[0];
    setSectionId(firstSection?.id ?? null);
  }, [dashboardId, sections]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!dashboardId || !metric) throw new Error("Dashboard and metric are required.");
      return addSimpleDashboardCard(dashboardId, metric.id, sectionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["simple-dashboards"] });
      onClose();
    }
  });

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
        <Select
          label="Dashboard"
          placeholder="Select dashboard"
          value={dashboardId}
          onChange={setDashboardId}
          data={dashboards.map(dashboard => ({ value: dashboard.id, label: dashboard.name }))}
          disabled={dashboardsQuery.isLoading || dashboards.length === 0}
        />
        <Select
          label="Section"
          placeholder="Select section"
          value={sectionId}
          onChange={setSectionId}
          data={selectedSections.map(section => ({ value: section.id, label: section.name }))}
          disabled={!dashboardId || selectedSections.length === 0}
        />
        {dashboards.length === 0 && !dashboardsQuery.isLoading && (
          <Alert color="blue" variant="light">Create a dashboard first from the Dashboards page.</Alert>
        )}
        {addMutation.isError && (
          <Alert color="red" variant="light">
            {addMutation.error instanceof Error ? addMutation.error.message : "Unable to add metric card."}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="light" color="gray" onClick={onClose}>Cancel</Button>
          <Button
            variant="light"
            color="green"
            disabled={!dashboardId || !sectionId || !metric}
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
