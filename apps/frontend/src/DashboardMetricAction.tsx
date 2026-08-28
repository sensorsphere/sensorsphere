import React from "react";
import { ActionIcon, Badge, Group, HoverCard, Stack, Text } from "@mantine/core";
import { NavigationIcon } from "./NavigationIcon";

export function DashboardMetricAction({
  usages,
  onClick,
  title
}: {
  usages: readonly string[];
  onClick: () => void;
  title: string;
}) {
  const usageCount = usages.length;
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
      <HoverCard width={260} shadow="md" openDelay={250} closeDelay={100} position="top" withArrow>
        <HoverCard.Target>
          <Badge
            size="xs"
            variant="light"
            color={usageCount > 0 ? "orange" : "gray"}
            px={6}
            style={{ cursor: "default" }}
          >
            {usageCount}
          </Badge>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          {usageCount > 0 ? (
            <Stack gap={4}>
              <Text size="xs" fw={600}>Used in</Text>
              {usages.map(usage => (
                <Text key={usage} size="xs">• {usage}</Text>
              ))}
            </Stack>
          ) : (
            <Text size="xs">Not used in any dashboard</Text>
          )}
        </HoverCard.Dropdown>
      </HoverCard>
    </Group>
  );
}
