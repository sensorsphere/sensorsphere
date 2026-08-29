import React from "react";

import {
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title
} from "@mantine/core";

import {
  useQuery
} from "@tanstack/react-query";

import {
  getModuleVersions
} from "./api";

import {
  MODULE_CHANGELOG,
  MODULE_NAME,
  MODULE_VERSION
} from "./module_version";

import type {
  ModuleChangeType,
  ModuleVersionInfo
} from "./types";

const CHANGE_TYPES: Array<{
  value: ModuleChangeType;
  label: string;
}> = [
  { value: "added", label: "Added" },
  { value: "changed", label: "Changed" },
  { value: "fixed", label: "Fixed" },
  { value: "removed", label: "Removed" },
  { value: "deprecated", label: "Deprecated" },
  { value: "security", label: "Security" }
];

const CHANGE_COLORS:
Record<ModuleChangeType, string> = {
  added: "green",
  changed: "blue",
  fixed: "orange",
  removed: "red",
  deprecated: "yellow",
  security: "grape"
};

function formatReleasedAt(
  releasedAt: string
): string {
  const value = new Date(releasedAt);

  return Number.isNaN(value.getTime())
    ? releasedAt
    : value.toLocaleString();
}

function moduleLabel(
  module: string
): string {
  if (module === "frontend") {
    return "Frontend";
  }

  if (module === "api") {
    return "API";
  }

  if (module === "ingestion-service") {
    return "Ingestion service";
  }

  return module;
}

export function VersionsPanel() {
  const [moduleFilter, setModuleFilter] =
    React.useState<string | null>(null);

  const [changeType, setChangeType] =
    React.useState<ModuleChangeType | null>(null);

  const versionsQuery =
    useQuery({
      queryKey: ["module-versions"],
      queryFn: getModuleVersions,
      refetchInterval: 60_000
    });

  if (versionsQuery.isLoading) {
    return <Loader />;
  }

  if (versionsQuery.isError) {
    return (
      <Alert
        color="red"
        title="Unable to load module versions"
      >
        Backend module version information could not be loaded.
      </Alert>
    );
  }

  const frontend: ModuleVersionInfo = {
    module: MODULE_NAME,
    version: MODULE_VERSION,
    changelog: MODULE_CHANGELOG
  };

  const modules = [
    frontend,
    ...(versionsQuery.data ?? [])
  ];

  const moduleOptions =
    modules.map(module => ({
      value: module.module,
      label: moduleLabel(module.module)
    }));

  const visibleModules =
    moduleFilter === null
      ? modules
      : modules.filter(
          module =>
            module.module === moduleFilter
        );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="end">
        <div>
          <Title order={2}>Versions & changelog</Title>
          <Text size="sm" c="dimmed">
            Runtime versions and release history for SensorSphere modules.
          </Text>
        </div>

        <Group gap="sm" align="end">
          <Select
            label="Module"
            placeholder="All modules"
            clearable
            value={moduleFilter}
            onChange={setModuleFilter}
            data={moduleOptions}
            w={190}
          />

          <Select
            label="Change type"
            placeholder="All changes"
            clearable
            value={changeType}
            onChange={value =>
              setChangeType(
                value as ModuleChangeType | null
              )
            }
            data={CHANGE_TYPES}
            w={190}
          />
        </Group>
      </Group>

      {visibleModules.map(module => (
        <Card key={module.module} withBorder radius="md" p="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={3}>
                {moduleLabel(module.module)}
              </Title>
              <Badge variant="light" size="lg">
                {module.version ?? "Not reported"}
              </Badge>
            </Group>

            {Object.entries(module.changelog)
              .sort(([left], [right]) =>
                right.localeCompare(
                  left,
                  undefined,
                  { numeric: true }
                )
              )
              .map(([version, entry]) => {
                const changes =
                  entry.changes.filter(change =>
                    changeType === null ||
                    change.type === changeType
                  );

                if (changes.length === 0) {
                  return null;
                }

                return (
                  <Stack key={version} gap="xs">
                    <Group gap="xs">
                      <Text fw={700}>{version}</Text>
                      <Text size="sm" c="dimmed">
                        {formatReleasedAt(entry.releasedAt)}
                      </Text>
                      <Badge variant="outline" color="gray">
                        {entry.patch}
                      </Badge>
                    </Group>

                    {changes.map((change, index) => (
                      <Group
                        key={`${version}-${change.type}-${index}`}
                        gap="xs"
                        align="flex-start"
                        wrap="nowrap"
                      >
                        <Badge
                          variant="light"
                          color={CHANGE_COLORS[change.type]}
                          miw={86}
                        >
                          {change.type}
                        </Badge>
                        <Text size="sm">
                          {change.description}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                );
              })}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
