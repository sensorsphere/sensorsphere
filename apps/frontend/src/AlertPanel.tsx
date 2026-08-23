import React from "react";

import { activeFilterControlStyle } from "./filterStyles";
import { BadgeSelect } from "./BadgeSelect";

import { NavigationIcon } from "./NavigationIcon";

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Table,
  Tabs,
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
  acknowledgeAlert,
  createAlertRule,
  deleteAlertRule,
  getActiveAlerts,
  getAlertHistory,
  getAlertRules,
  updateAlertRule,
  type ActiveAlert,
  type AlertEvent,
  type AlertConditionType,
  type AlertRule,
  type AlertSeverity,
  type CreateAlertRuleInput,
  type UpdateAlertRuleInput
} from "./alerts-api";

import {
  getAssets
} from "./api";

import type {
  Asset
} from "./types";

import {
  usePersistentState
} from "./preferences/usePersistentState";

interface RuleFormState {
  id: string | null;

  name: string;
  description: string;

  enabled: boolean;

  severity: AlertSeverity;
  conditionType: AlertConditionType;

  assetId: string;
  assetMetricId: string;

  thresholdMin: number | "";
  thresholdMax: number | "";

  durationSeconds: number;
  cooldownSeconds: number;
}

function emptyRuleForm():
RuleFormState {

  return {
    id:
      null,

    name:
      "",

    description:
      "",

    enabled:
      true,

    severity:
      "WARNING",

    conditionType:
      "ABOVE",

    assetId:
      "",

    assetMetricId:
      "",

    thresholdMin:
      "",

    thresholdMax:
      "",

    durationSeconds:
      0,

    cooldownSeconds:
      0
  };
}

function ruleToForm(
  rule: AlertRule
): RuleFormState {

  return {
    id:
      rule.id,

    name:
      rule.name,

    description:
      rule.description
      ?? "",

    enabled:
      rule.enabled,

    severity:
      rule.severity,

    conditionType:
      rule.conditionType,

    assetId:
      rule.assetId
      ?? "",

    assetMetricId:
      rule.assetMetricId
      ?? "",

    thresholdMin:
      rule.thresholdMin
      ?? "",

    thresholdMax:
      rule.thresholdMax
      ?? "",

    durationSeconds:
      rule.durationSeconds,

    cooldownSeconds:
      rule.cooldownSeconds
  };
}

function assetLabel(
  asset: Asset
): string {

  return (
    asset.sensor?.name
    ?? asset.name
    ?? asset.externalId
  );
}

function severityColor(
  severity: AlertSeverity
): string {

  switch (severity) {
    case "CRITICAL":
      return "red";

    case "WARNING":
      return "yellow";

    case "INFO":
      return "blue";
  }
}

function statusColor(
  status: ActiveAlert["status"]
): string {

  switch (status) {
    case "ACTIVE":
      return "red";

    case "ACKNOWLEDGED":
      return "yellow";

    case "RESOLVED":
      return "green";
  }
}

function formatDuration(
  seconds: number
): string {

  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  return `${hours} h`;
}

function conditionLabel(
  condition: AlertConditionType,
  rule: AlertRule
): string {

  switch (condition) {
    case "ABOVE":
      return `Above ${rule.thresholdMin ?? "—"}`;

    case "BELOW":
      return `Below ${rule.thresholdMin ?? "—"}`;

    case "BETWEEN":
      return `Between ${rule.thresholdMin ?? "—"} and ${rule.thresholdMax ?? "—"}`;

    case "OUTSIDE":
      return `Outside ${rule.thresholdMin ?? "—"} to ${rule.thresholdMax ?? "—"}`;

    case "OFFLINE":
      return `Offline for ${formatDuration(rule.durationSeconds)}`;

    case "NO_DATA":
      return `No data for ${formatDuration(rule.durationSeconds)}`;
  }
}

function ruleNeedsMetric(
  conditionType: AlertConditionType
): boolean {

  return (
    conditionType !== "OFFLINE" &&
    conditionType !== "NO_DATA"
  );
}

function ruleNeedsOneThreshold(
  conditionType: AlertConditionType
): boolean {

  return (
    conditionType === "ABOVE" ||
    conditionType === "BELOW"
  );
}

function ruleNeedsTwoThresholds(
  conditionType: AlertConditionType
): boolean {

  return (
    conditionType === "BETWEEN" ||
    conditionType === "OUTSIDE"
  );
}

function toCreateInput(
  form: RuleFormState
): CreateAlertRuleInput {

  return {
    name:
      form.name.trim(),

    description:
      form.description.trim()
        ? form.description.trim()
        : null,

    enabled:
      form.enabled,

    severity:
      form.severity,

    conditionType:
      form.conditionType,

    assetId:
      form.assetId.trim(),

    assetMetricId:
      ruleNeedsMetric(
        form.conditionType
      )
        ? form.assetMetricId.trim()
        : null,

    thresholdMin:
      ruleNeedsOneThreshold(
        form.conditionType
      ) ||
      ruleNeedsTwoThresholds(
        form.conditionType
      )
        ? Number(
            form.thresholdMin
          )
        : null,

    thresholdMax:
      ruleNeedsTwoThresholds(
        form.conditionType
      )
        ? Number(
            form.thresholdMax
          )
        : null,

    durationSeconds:
      form.durationSeconds,

    cooldownSeconds:
      form.cooldownSeconds
  };
}

function toUpdateInput(
  form: RuleFormState
): UpdateAlertRuleInput {

  return toCreateInput(
    form
  );
}

export function AlertPanel() {

  const queryClient =
    useQueryClient();

  const [
    ruleForm,
    setRuleForm
  ] =
    React.useState<
      RuleFormState | null
    >(
      null
    );

  const assetsQuery =
    useQuery({
      queryKey:
        ["assets"],

      queryFn:
        getAssets,

      refetchInterval:
        30_000
    });

  const [
    activeAlertTab,
    setActiveAlertTab
  ] =
    usePersistentState<
      "active"
      | "history"
      | "rules"
    >(
      "alerts.tab",
      "active",
      (
        value
      ): value is
        "active"
        | "history"
        | "rules" =>
          value === "active" ||
          value === "history" ||
          value === "rules"
    );

  const [
    historyStatus,
    setHistoryStatus
  ] =
    usePersistentState<
      "ALL"
      | AlertEvent["status"]
    >(
      "alerts.history.status",
      "ALL",
      (
        value
      ): value is
        "ALL"
        | AlertEvent["status"] =>
          value === "ALL" ||
          value === "ACTIVE" ||
          value === "ACKNOWLEDGED" ||
          value === "RESOLVED"
    );

  const [
    historyLimit,
    setHistoryLimit
  ] =
    usePersistentState<number>(
      "alerts.history.limit",
      50,
      (
        value
      ): value is number =>
        value === 20 ||
        value === 50 ||
        value === 100
    );

  const rulesQuery =
    useQuery({
      queryKey:
        ["alert-rules"],

      queryFn:
        getAlertRules,

      refetchInterval:
        30_000
    });

  const activeAlertsQuery =
    useQuery({
      queryKey:
        ["active-alerts"],

      queryFn:
        getActiveAlerts,

      refetchInterval:
        15_000
    });

  const refreshRules =
    async (): Promise<void> => {

      await queryClient
        .invalidateQueries({
          queryKey:
            ["alert-rules"]
        });
    };

  const alertHistoryQuery =
    useQuery({
      queryKey: [
        "alert-history",
        historyStatus,
        historyLimit
      ],

      queryFn:
        () =>
          getAlertHistory(
            historyLimit,
            historyStatus ===
              "ALL"
              ? undefined
              : historyStatus
          ),

      refetchInterval:
        30_000
    });

  const acknowledgeMutation =
    useMutation({
      mutationFn:
        acknowledgeAlert,

      onSuccess:
        async () => {

          await queryClient
            .invalidateQueries({
              queryKey:
                ["active-alerts"]
            });
        }
    });

  const createMutation =
    useMutation({
      mutationFn:
        createAlertRule,

      onSuccess:
        async () => {

          setRuleForm(
            null
          );

          await refreshRules();
        }
    });

  const updateMutation =
    useMutation({
      mutationFn:
        ({
          id,
          input
        }: {
          id: string;
          input: UpdateAlertRuleInput;
        }) =>
          updateAlertRule(
            id,
            input
          ),

      onSuccess:
        async () => {

          setRuleForm(
            null
          );

          await refreshRules();
        }
    });

  const deleteMutation =
    useMutation({
      mutationFn:
        deleteAlertRule,

      onSuccess:
        refreshRules
    });

  const toggleMutation =
    useMutation({
      mutationFn:
        ({
          id,
          enabled
        }: {
          id: string;
          enabled: boolean;
        }) =>
          updateAlertRule(
            id,
            {
              enabled
            }
          ),

      onSuccess:
        refreshRules
    });

  if (
    assetsQuery.isLoading ||
    rulesQuery.isLoading ||
    activeAlertsQuery.isLoading ||
    alertHistoryQuery.isLoading
  ) {
    return (
      <Loader />
    );
  }

  if (
    assetsQuery.isError ||
    rulesQuery.isError ||
    activeAlertsQuery.isError ||
    alertHistoryQuery.isError
  ) {
    return (
      <Alert
        color="red"
        title="Unable to load alerts"
      >
        The alert engine data could not be loaded.
      </Alert>
    );
  }

  const assets =
    assetsQuery.data
    ?? [];

  const rules =
    rulesQuery.data
    ?? [];

  const sortedAssets =
    [...assets].sort(
      (a, b) =>
        assetLabel(a).localeCompare(
          assetLabel(b),
          undefined,
          { sensitivity: "base" }
        )
    );

  const sortedRules =
    [...rules].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          { sensitivity: "base" }
        )
    );

  const activeAlerts =
    activeAlertsQuery.data
    ?? [];

  const alertHistory =
    alertHistoryQuery.data
    ?? [];

  const selectedAsset =
    ruleForm
      ? assets.find(
          asset =>
            asset.id ===
            ruleForm.assetId
        )
      : undefined;

  const formError =
    createMutation.error
    ?? updateMutation.error;

  const saveRule =
    (): void => {

      if (!ruleForm) {
        return;
      }

      if (ruleForm.id) {
        updateMutation.mutate({
          id:
            ruleForm.id,

          input:
            toUpdateInput(
              ruleForm
            )
        });

        return;
      }

      createMutation.mutate(
        toCreateInput(
          ruleForm
        )
      );
    };

  const formValid =
    ruleForm !== null &&
    ruleForm.name.trim().length > 0 &&
    ruleForm.assetId.trim().length > 0 &&
    (
      !ruleNeedsMetric(
        ruleForm.conditionType
      ) ||
      ruleForm.assetMetricId
        .trim()
        .length > 0
    ) &&
    (
      !ruleNeedsOneThreshold(
        ruleForm.conditionType
      ) ||
      ruleForm.thresholdMin !== ""
    ) &&
    (
      !ruleNeedsTwoThresholds(
        ruleForm.conditionType
      ) ||
      (
        ruleForm.thresholdMin !== "" &&
        ruleForm.thresholdMax !== "" &&
        Number(
          ruleForm.thresholdMin
        ) <
        Number(
          ruleForm.thresholdMax
        )
      )
    );

  return (
    <>
      <Tabs
        value={
          activeAlertTab
        }
        onChange={
          value =>
            value &&
            setActiveAlertTab(
              value as
                "active"
                | "history"
                | "rules"
            )
        }
        keepMounted={false}
      >
        <Tabs.List mb="md">

          <Tabs.Tab value="active">
            Active
            {
              activeAlerts.length > 0
                ? ` (${activeAlerts.length})`
                : ""
            }
          </Tabs.Tab>

          <Tabs.Tab value="history">
            History
          </Tabs.Tab>

          <Tabs.Tab value="rules">
            Rules
            {
              rules.length > 0
                ? ` (${rules.length})`
                : ""
            }
          </Tabs.Tab>

        </Tabs.List>

        <Tabs.Panel
          value="active"
          pt="sm"
        >
        <div>

          <Group
            justify="space-between"
            mb="md"
          >
            <div>
              <Group gap="xs">
                <NavigationIcon page="alerts" size={24} />
                <Title order={2}>
                  Active alerts
                </Title>
              </Group>

              <Text c="dimmed">
                Current conditions requiring attention
              </Text>
            </div>

            <Badge
              color={
                activeAlerts.length > 0
                  ? "red"
                  : "green"
              }
              variant="light"
            >
              {
                activeAlerts.length > 0
                  ? `${activeAlerts.length} active`
                  : "All clear"
              }
            </Badge>
          </Group>

          {
            activeAlerts.length === 0
              ? (
                <Alert
                  color="green"
                  title="No active alerts"
                >
                  No alert condition is currently active.
                </Alert>
              )
              : (
                <SimpleGrid
                  cols={{
                    base: 1,
                    md: 2
                  }}
                >
                  {
                    activeAlerts.map(
                      alert => (
                        <Card
                          key={alert.id}
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
                                  {alert.assetDisplayName}
                                </Text>

                                <Text
                                  size="sm"
                                  c="dimmed"
                                >
                                  {alert.ruleName}
                                </Text>
                              </div>

                              <Group gap="xs">
                                <Badge
                                  color={
                                    severityColor(
                                      alert.severity
                                    )
                                  }
                                >
                                  {alert.severity}
                                </Badge>

                                <Badge
                                  color={
                                    statusColor(
                                      alert.status
                                    )
                                  }
                                  variant="light"
                                >
                                  {alert.status}
                                </Badge>
                              </Group>
                            </Group>

                            <Text size="sm">
                              {alert.message}
                            </Text>

                            {
                              alert.metricDisplayName && (
                                <Text
                                  size="sm"
                                  c="dimmed"
                                >
                                  {alert.metricDisplayName}:{" "}
                                  {
                                    alert.currentValue
                                    ?? "—"
                                  }
                                  {
                                    alert.unit
                                      ? ` ${alert.unit}`
                                      : ""
                                  }
                                </Text>
                              )
                            }

                            <Text
                              size="xs"
                              c="dimmed"
                            >
                              Opened:{" "}
                              {
                                new Date(
                                  alert.openedAt
                                ).toLocaleString()
                              }
                            </Text>

                            {
                              alert.status ===
                                "ACTIVE" && (
                                <Group justify="flex-end">
                                  <Button
                                    size="xs"
                                    variant="light"
                                    loading={
                                      acknowledgeMutation
                                        .isPending &&
                                      acknowledgeMutation
                                        .variables ===
                                      alert.id
                                    }
                                    onClick={
                                      () =>
                                        acknowledgeMutation
                                          .mutate(
                                            alert.id
                                          )
                                    }
                                  >
                                    Acknowledge
                                  </Button>
                                </Group>
                              )
                            }

                          </Stack>
                        </Card>
                      )
                    )
                  }
                </SimpleGrid>
              )
          }

        </div>

        </Tabs.Panel>

        <Tabs.Panel
          value="history"
          pt="sm"
        >
        <div>

          <Group
            justify="space-between"
            mb="md"
          >
            <div>
              <Group gap="xs">
                <NavigationIcon page="alerts" size={24} />
                <Title order={2}>
                  Alert history
                </Title>
              </Group>

              <Text c="dimmed">
                Recent alert events
              </Text>
            </div>

            <Group gap="xs">

              <SegmentedControl
                size="xs"
                value={
                  historyStatus
                }
                onChange={
                  value =>
                    setHistoryStatus(
                      value as
                        "ALL"
                        | AlertEvent["status"]
                    )
                }
                data={[
                  "ALL",
                  "ACTIVE",
                  "ACKNOWLEDGED",
                  "RESOLVED"
                ]}
                style={activeFilterControlStyle(historyStatus !== "ALL")}
              />

              <Select
                size="xs"
                value={
                  String(
                    historyLimit
                  )
                }
                onChange={
                  value =>
                    value &&
                    setHistoryLimit(
                      Number(value)
                    )
                }
                data={[
                  {
                    value: "20",
                    label: "20"
                  },
                  {
                    value: "50",
                    label: "50"
                  },
                  {
                    value: "100",
                    label: "100"
                  }
                ]}
              />

            </Group>
          </Group>

          {
            alertHistory.length === 0
              ? (
                <Alert
                  color="blue"
                  title="No alert history"
                >
                  No alert event matches the selected filter.
                </Alert>
              )
              : (
                <Card
                  withBorder
                  radius="md"
                  padding={0}
                >
                  <Table
                    striped
                    highlightOnHover
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>
                          Opened
                        </Table.Th>
                        <Table.Th>
                          Asset
                        </Table.Th>
                        <Table.Th>
                          Rule
                        </Table.Th>
                        <Table.Th>
                          Severity
                        </Table.Th>
                        <Table.Th>
                          Status
                        </Table.Th>
                        <Table.Th>
                          Value
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>

                    <Table.Tbody>
                      {
                        alertHistory.map(
                          event => {

                            const asset =
                              assets.find(
                                current =>
                                  current.id ===
                                  event.assetId
                              );

                            const rule =
                              rules.find(
                                current =>
                                  current.id ===
                                  event.ruleId
                              );

                            const metric =
                              asset?.metrics.find(
                                current =>
                                  current.id ===
                                  event.assetMetricId
                              );

                            return (
                              <Table.Tr
                                key={
                                  event.id
                                }
                              >
                                <Table.Td>
                                  {
                                    new Date(
                                      event.openedAt
                                    ).toLocaleString()
                                  }
                                </Table.Td>

                                <Table.Td>
                                  {
                                    asset
                                      ? assetLabel(
                                          asset
                                        )
                                      : event.assetId
                                  }
                                </Table.Td>

                                <Table.Td>
                                  {
                                    rule?.name
                                    ?? event.ruleId
                                  }
                                </Table.Td>

                                <Table.Td>
                                  <Badge
                                    color={
                                      severityColor(
                                        event.severity
                                      )
                                    }
                                  >
                                    {
                                      event.severity
                                    }
                                  </Badge>
                                </Table.Td>

                                <Table.Td>
                                  <Badge
                                    color={
                                      statusColor(
                                        event.status
                                      )
                                    }
                                    variant="light"
                                  >
                                    {
                                      event.status
                                    }
                                  </Badge>
                                </Table.Td>

                                <Table.Td>
                                  {
                                    event.currentValue
                                    ?? "—"
                                  }
                                  {
                                    metric?.unit
                                      ? ` ${metric.unit}`
                                      : ""
                                  }
                                </Table.Td>
                              </Table.Tr>
                            );
                          }
                        )
                      }
                    </Table.Tbody>
                  </Table>
                </Card>
              )
          }

        </div>

        </Tabs.Panel>

        <Tabs.Panel
          value="rules"
          pt="sm"
        >
        <div>

          <Group
            justify="space-between"
            mb="md"
          >
            <div>
              <Group gap="xs">
                <NavigationIcon page="alerts" size={24} />
                <Title order={2}>
                  Alert rules
                </Title>
              </Group>

              <Text c="dimmed">
                Configured monitoring conditions
              </Text>
            </div>

            <Group gap="xs">
              <Badge variant="light">
                {rules.length} rules
              </Badge>

              <Button
                size="xs"
                onClick={
                  () =>
                    setRuleForm(
                      emptyRuleForm()
                    )
                }
              >
                New rule
              </Button>
            </Group>
          </Group>

          {
            rules.length === 0
              ? (
                <Alert
                  color="blue"
                  title="No alert rules"
                >
                  Create your first alert rule.
                </Alert>
              )
              : (
                <SimpleGrid
                  cols={{
                    base: 1,
                    md: 2
                  }}
                >
                  {
                    sortedRules.map(
                      rule => (
                        <Card
                          key={rule.id}
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
                                >
                                  {rule.name}
                                </Text>

                                {
                                  rule.description && (
                                    <Text
                                      size="sm"
                                      c="dimmed"
                                    >
                                      {rule.description}
                                    </Text>
                                  )
                                }
                              </div>

                              <Group gap="xs">
                                <Badge
                                  color={
                                    severityColor(
                                      rule.severity
                                    )
                                  }
                                >
                                  {rule.severity}
                                </Badge>

                                <Badge
                                  color={
                                    rule.enabled
                                      ? "green"
                                      : "gray"
                                  }
                                  variant="light"
                                >
                                  {
                                    rule.enabled
                                      ? "Enabled"
                                      : "Disabled"
                                  }
                                </Badge>
                              </Group>
                            </Group>

                            <Text size="sm">
                              {
                                conditionLabel(
                                  rule.conditionType,
                                  rule
                                )
                              }
                            </Text>

                            {
                              (() => {

                                const asset =
                                  assets.find(
                                    current =>
                                      current.id ===
                                      rule.assetId
                                  );

                                const metric =
                                  asset?.metrics.find(
                                    current =>
                                      current.id ===
                                      rule.assetMetricId
                                  );

                                return (
                                  <>
                                    <Text
                                      size="xs"
                                      c="dimmed"
                                    >
                                      Asset:{" "}
                                      {
                                        asset
                                          ? assetLabel(
                                              asset
                                            )
                                          : rule.assetId
                                            ?? "—"
                                      }
                                    </Text>

                                    {
                                      rule.assetMetricId && (
                                        <Text
                                          size="xs"
                                          c="dimmed"
                                        >
                                          Metric:{" "}
                                          {
                                            metric
                                              ? metric.displayName
                                              : rule.assetMetricId
                                          }
                                        </Text>
                                      )
                                    }
                                  </>
                                );
                              })()
                            }

                            <Group justify="flex-end">
                              <Button
                                size="xs"
                                variant="default"
                                loading={
                                  toggleMutation.isPending &&
                                  toggleMutation.variables?.id ===
                                  rule.id
                                }
                                onClick={
                                  () =>
                                    toggleMutation
                                      .mutate({
                                        id:
                                          rule.id,

                                        enabled:
                                          !rule.enabled
                                      })
                                }
                              >
                                {
                                  rule.enabled
                                    ? "Disable"
                                    : "Enable"
                                }
                              </Button>

                              <Button
                                size="xs"
                                variant="default"
                                onClick={
                                  () => {
                                    const copy =
                                      ruleToForm(rule);

                                    setRuleForm({
                                      ...copy,
                                      id: null,
                                      name:
                                        `Copy of ${rule.name}`,
                                      enabled: false
                                    });
                                  }
                                }
                              >
                                Copy
                              </Button>

                              <Button
                                size="xs"
                                variant="light"
                                onClick={
                                  () =>
                                    setRuleForm(
                                      ruleToForm(
                                        rule
                                      )
                                    )
                                }
                              >
                                Edit
                              </Button>

                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                loading={
                                  deleteMutation.isPending &&
                                  deleteMutation.variables ===
                                  rule.id
                                }
                                onClick={
                                  () => {
                                    if (
                                      window.confirm(
                                        `Delete alert rule "${rule.name}"?`
                                      )
                                    ) {
                                      deleteMutation
                                        .mutate(
                                          rule.id
                                        );
                                    }
                                  }
                                }
                              >
                                Delete
                              </Button>
                            </Group>

                          </Stack>
                        </Card>
                      )
                    )
                  }
                </SimpleGrid>
              )
          }

        </div>

        </Tabs.Panel>

      </Tabs>

      <Modal
        opened={
          ruleForm !== null
        }
        onClose={
          () =>
            setRuleForm(
              null
            )
        }
        title={
          ruleForm?.id
            ? "Edit alert rule"
            : "New alert rule"
        }
        size="lg"
      >
        {
          ruleForm && (
            <Stack>

              <TextInput
                label="Name"
                required
                value={
                  ruleForm.name
                }
                onChange={
                  event =>
                    setRuleForm({
                      ...ruleForm,

                      name:
                        event.currentTarget
                          .value
                    })
                }
              />

              <Textarea
                label="Description"
                value={
                  ruleForm.description
                }
                onChange={
                  event =>
                    setRuleForm({
                      ...ruleForm,

                      description:
                        event.currentTarget
                          .value
                    })
                }
              />

              <SimpleGrid cols={2}>

                <BadgeSelect
                  badgeColor={value => severityColor(value as AlertSeverity)}
                  label="Severity"
                  value={
                    ruleForm.severity
                  }
                  data={[
                    "INFO",
                    "WARNING",
                    "CRITICAL"
                  ]}
                  onChange={
                    value =>
                      value &&
                      setRuleForm({
                        ...ruleForm,

                        severity:
                          value as
                          AlertSeverity
                      })
                  }
                />

                <Select
                  label="Condition"
                  value={
                    ruleForm.conditionType
                  }
                  data={[
                    "ABOVE",
                    "BELOW",
                    "BETWEEN",
                    "OUTSIDE",
                    "OFFLINE",
                    "NO_DATA"
                  ]}
                  onChange={
                    value =>
                      value &&
                      setRuleForm({
                        ...ruleForm,

                        conditionType:
                          value as
                          AlertConditionType,

                        assetMetricId:
                          (
                            value ===
                              "OFFLINE" ||
                            value ===
                              "NO_DATA"
                          )
                            ? ""
                            : ruleForm
                                .assetMetricId,

                        thresholdMin:
                          (
                            value ===
                              "OFFLINE" ||
                            value ===
                              "NO_DATA"
                          )
                            ? ""
                            : ruleForm
                                .thresholdMin,

                        thresholdMax:
                          (
                            value ===
                              "BETWEEN" ||
                            value ===
                              "OUTSIDE"
                          )
                            ? ruleForm
                                .thresholdMax
                            : ""
                      })
                  }
                />

              </SimpleGrid>

              <Select
                label="Asset"
                required
                searchable
                placeholder="Select an asset"
                value={
                  ruleForm.assetId
                  || null
                }
                data={
                  sortedAssets.map(
                    asset => ({
                      value:
                        asset.id,

                      label:
                        `${assetLabel(asset)} · ${asset.externalId}`
                    })
                  )
                }
                onChange={
                  value =>
                    setRuleForm({
                      ...ruleForm,

                      assetId:
                        value
                        ?? "",

                      assetMetricId:
                        ""
                    })
                }
              />

              {
                ruleNeedsMetric(
                  ruleForm.conditionType
                ) && (
                  <Select
                    label="Metric"
                    required
                    searchable
                    placeholder={
                      selectedAsset
                        ? "Select a metric"
                        : "Select an asset first"
                    }
                    disabled={
                      !selectedAsset
                    }
                    value={
                      ruleForm.assetMetricId
                      || null
                    }
                    data={
                      selectedAsset
                        ? selectedAsset.metrics
                            .filter(
                              metric =>
                                metric.enabled
                            )
                            .sort(
                              (a, b) =>
                                a.displayName.localeCompare(
                                  b.displayName,
                                  undefined,
                                  { sensitivity: "base" }
                                )
                            )
                            .map(
                              metric => ({
                                value:
                                  metric.id,

                                label:
                                  metric.unit
                                    ? `${metric.displayName} (${metric.unit})`
                                    : metric.displayName
                              })
                            )
                        : []
                    }
                    onChange={
                      value =>
                        setRuleForm({
                          ...ruleForm,

                          assetMetricId:
                            value
                            ?? ""
                        })
                    }
                  />
                )
              }

              {
                (
                  ruleNeedsOneThreshold(
                    ruleForm.conditionType
                  ) ||
                  ruleNeedsTwoThresholds(
                    ruleForm.conditionType
                  )
                ) && (
                  <NumberInput
                    label="Threshold"
                    value={
                      ruleForm.thresholdMin
                    }
                    onChange={
                      value =>
                        setRuleForm({
                          ...ruleForm,

                          thresholdMin:
                            typeof value ===
                              "number"
                              ? value
                              : ""
                        })
                    }
                  />
                )
              }

              {
                ruleNeedsTwoThresholds(
                  ruleForm.conditionType
                ) && (
                  <NumberInput
                    label="Upper threshold"
                    value={
                      ruleForm.thresholdMax
                    }
                    onChange={
                      value =>
                        setRuleForm({
                          ...ruleForm,

                          thresholdMax:
                            typeof value ===
                              "number"
                              ? value
                              : ""
                        })
                    }
                  />
                )
              }

              <SimpleGrid cols={2}>

                <NumberInput
                  label="Duration"
                  description="Seconds before triggering"
                  min={0}
                  value={
                    ruleForm.durationSeconds
                  }
                  suffix=" s"
                  onChange={
                    value =>
                      setRuleForm({
                        ...ruleForm,

                        durationSeconds:
                          typeof value ===
                            "number"
                            ? value
                            : 0
                      })
                  }
                />

                <NumberInput
                  label="Cooldown"
                  description="Seconds before another event"
                  min={0}
                  value={
                    ruleForm.cooldownSeconds
                  }
                  suffix=" s"
                  onChange={
                    value =>
                      setRuleForm({
                        ...ruleForm,

                        cooldownSeconds:
                          typeof value ===
                            "number"
                            ? value
                            : 0
                      })
                  }
                />

              </SimpleGrid>

              <Checkbox
                label="Enabled"
                checked={
                  ruleForm.enabled
                }
                onChange={
                  event =>
                    setRuleForm({
                      ...ruleForm,

                      enabled:
                        event.currentTarget
                          .checked
                    })
                }
              />

              {
                formError && (
                  <Text c="red">
                    {
                      formError instanceof Error
                        ? formError.message
                        : "Unable to save alert rule."
                    }
                  </Text>
                )
              }

              <Group justify="flex-end">

                <Button
                  variant="default"
                  onClick={
                    () =>
                      setRuleForm(
                        null
                      )
                  }
                >
                  Cancel
                </Button>

                <Button
                  disabled={
                    !formValid
                  }
                  loading={
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                  onClick={
                    saveRule
                  }
                >
                  Save
                </Button>

              </Group>

            </Stack>
          )
        }
      </Modal>
    </>
  );
}
