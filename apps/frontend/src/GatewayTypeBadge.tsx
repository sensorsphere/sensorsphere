import { Badge } from "@mantine/core";

import type { GatewayType } from "./types";

export function GatewayTypeBadge({
  type,
  size = "sm"
}: {
  type: Pick<GatewayType, "name" | "color">;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  return (
    <Badge size={size} variant="light" color={type.color || "#7950f2"}>
      {type.name}
    </Badge>
  );
}
