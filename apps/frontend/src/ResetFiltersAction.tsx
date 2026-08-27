import { Button } from "@mantine/core";

interface Props {
  active: boolean;
  onReset: () => void;
}

export function ResetFiltersAction({
  active,
  onReset
}: Props) {
  return (
    <Button
      size="xs"
      variant="light"
      color="blue"
      disabled={!active}
      onClick={onReset}
    >
      Reset filters
    </Button>
  );
}
