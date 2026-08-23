import React from "react";

import {
  Badge,
  Select,
  type SelectProps
} from "@mantine/core";

type BadgeSelectProps = Omit<SelectProps, "renderOption"> & {
  badgeColor: (value: string) => string;
};

function findLabel(data: SelectProps["data"], value: string | null | undefined): string | null {
  if (!value || !data) return null;

  for (const item of data as any[]) {
    if (typeof item === "string") {
      if (item === value) return item;
      continue;
    }

    if (item && typeof item === "object" && Array.isArray(item.items)) {
      const nested = findLabel(item.items, value);
      if (nested) return nested;
      continue;
    }

    if (item?.value === value) {
      return String(item.label ?? item.value);
    }
  }

  return value;
}

export function BadgeSelect({
  badgeColor,
  data,
  value,
  styles,
  ...props
}: BadgeSelectProps) {
  const selectedLabel = findLabel(data, value);
  const selectedWidth = selectedLabel
    ? Math.min(230, Math.max(62, selectedLabel.length * 7.2 + 30))
    : undefined;

  const baseStyles = typeof styles === "function" ? undefined : styles;

  return (
    <Select
      {...props}
      data={data}
      value={value}
      renderOption={({ option }) => (
        <Badge
          size="sm"
          variant="light"
          color={badgeColor(option.value)}
        >
          {option.label}
        </Badge>
      )}
      leftSection={
        selectedLabel ? (
          <Badge
            size="sm"
            variant="light"
            color={badgeColor(String(value))}
            maw={210}
          >
            {selectedLabel}
          </Badge>
        ) : undefined
      }
      leftSectionWidth={selectedWidth}
      styles={{
        ...(baseStyles as any),
        input: {
          ...((baseStyles as any)?.input ?? {}),
          ...(selectedLabel
            ? {
                color: "transparent",
                paddingLeft: selectedWidth ? selectedWidth + 8 : undefined
              }
            : {})
        },
        section: {
          ...((baseStyles as any)?.section ?? {}),
          ...(selectedLabel
            ? {
                justifyContent: "flex-start",
                paddingLeft: 8
              }
            : {})
        }
      }}
    />
  );
}
