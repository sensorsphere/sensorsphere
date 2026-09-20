import React from "react";
import { ActionIcon, Tooltip } from "@mantine/core";

export function FilterClearAction({ active, onClear }: { active: boolean; onClear: () => void }) {
  if (!active) return null;

  return (
    <Tooltip label="Clear filter">
      <ActionIcon
        size="xs"
        variant="subtle"
        color="gray"
        aria-label="Clear filter"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClear();
        }}
      >
        ×
      </ActionIcon>
    </Tooltip>
  );
}
