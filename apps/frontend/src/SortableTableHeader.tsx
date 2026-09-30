import React from "react";

import {
  Group,
  Table,
  Text
} from "@mantine/core";

export type SortDirection = "asc" | "desc";

interface SortableTableHeaderProps {
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  align?: "left" | "right";
}

export function SortableTableHeader({
  active,
  direction,
  onClick,
  children,
  style,
  align = "left"
}: SortableTableHeaderProps) {
  return (
    <Table.Th
      onClick={onClick}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: align, ...style }}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <Group gap={5} wrap="nowrap" justify={align === "right" ? "flex-end" : undefined}>
        <Text component="span" size="sm" fw={600}>{children}</Text>
        <Text component="span" size="xs" c={active ? "blue" : "dimmed"}>
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </Text>
      </Group>
    </Table.Th>
  );
}

export function compareTableValues(
  left: string | number | boolean | null | undefined,
  right: string | number | boolean | null | undefined,
  direction: SortDirection
): number {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  let result: number;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else if (typeof left === "boolean" && typeof right === "boolean") {
    result = Number(left) - Number(right);
  } else {
    result = String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
      numeric: true
    });
  }

  return direction === "asc" ? result : -result;
}
