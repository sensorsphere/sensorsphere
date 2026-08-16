import {
  ActionIcon,
  Tooltip
} from "@mantine/core";

interface Props {
  active: boolean;
  onReset: () => void;
}

export function ResetFiltersAction({
  active,
  onReset
}: Props) {

  return (
    <Tooltip label="Reset all filters">
      <ActionIcon
        variant={
          active
            ? "light"
            : "subtle"
        }
        color={
          active
            ? "blue"
            : "gray"
        }
        size="lg"
        disabled={!active}
        aria-label="Reset all filters"
        onClick={onReset}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: 18,
            lineHeight: 1
          }}
        >
          ↺
        </span>
      </ActionIcon>
    </Tooltip>
  );
}
