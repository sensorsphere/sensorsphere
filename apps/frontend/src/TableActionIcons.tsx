import React from "react";

import {
  ActionIcon,
  Tooltip
} from "@mantine/core";

interface TableActionIconProps {
  label: string;
  color: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
}

function TableActionIcon({
  label,
  color,
  onClick,
  icon,
  disabled = false,
  loading = false
}: TableActionIconProps) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        size="sm"
        color={color}
        variant="light"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function BanIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.7 5.7 12.6 12.6" />
    </svg>
  );
}

function ReactivateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 11" />
      <path d="m4 13 2.3 4.6A7 7 0 0 0 17.9 15" />
    </svg>
  );
}

export function EditActionIcon({
  onClick
}: {
  onClick: () => void;
}) {
  return (
    <TableActionIcon
      label="Edit"
      color="blue"
      onClick={onClick}
      icon={<PencilIcon />}
    />
  );
}

export function DeleteActionIcon({
  onClick
}: {
  onClick: () => void;
}) {
  return (
    <TableActionIcon
      label="Delete"
      color="red"
      onClick={onClick}
      icon={<TrashIcon />}
    />
  );
}

export function BlacklistActionIcon({
  onClick
}: {
  onClick: () => void;
}) {
  return (
    <TableActionIcon
      label="Blacklist"
      color="red"
      onClick={onClick}
      icon={<BanIcon />}
    />
  );
}

export function ReactivateActionIcon({
  onClick,
  loading = false
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <TableActionIcon
      label="Reactivate"
      color="green"
      onClick={onClick}
      loading={loading}
      icon={<ReactivateIcon />}
    />
  );
}
