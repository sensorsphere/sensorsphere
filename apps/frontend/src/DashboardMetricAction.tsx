import React from "react";
import { ActionIcon, Badge, Group } from "@mantine/core";
import { NavigationIcon } from "./NavigationIcon";

export function DashboardMetricAction({
  usageCount,
  onClick,
  title
}: {
  usageCount: number;
  onClick: () => void;
  title: string;
}) {
  return (
    <Group gap={2} wrap="nowrap">
      <ActionIcon
        size="compact-sm"
        variant="subtle"
        color="gray"
        title={title}
        aria-label={title}
        onClick={onClick}
      >
        <NavigationIcon page="dashboards" size={15} />
      </ActionIcon>
      <Badge size="xs" variant="light" color="orange" px={6}>
        {usageCount}
      </Badge>
    </Group>
  );
}
