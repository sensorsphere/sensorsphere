import React from "react";

import { NavigationIcon } from "./NavigationIcon";
import { ResetFiltersAction } from "./ResetFiltersAction";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  TextInput,
  Tooltip,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core";

import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";

import {
  deleteAllGatewayCoverageGateways,
  deleteGatewayCoverageGateway,
  deleteGatewayCoverageSensor,
  getGatewayCoverage,
  getGateways,
  getLocations,
  getSensors,
  resetGatewayCoverage,
  resetGatewayCoverageGateway,
  resetGatewayCoverageSensor,
  updateGatewayCoverageLocation,
  updateSensor
} from "./api";

import type {
  GatewayCoverageRow
} from "./types";

const AUTO_REFRESH_SECONDS = 30;

const STORAGE_PREFIX =
  "sensorsphere.gatewayCoverage";

const PERIOD_STORAGE_KEY =
  `${STORAGE_PREFIX}.period`;

const SENSOR_SORT_STORAGE_KEY =
  `${STORAGE_PREFIX}.sensorSort`;

const GATEWAY_SORT_STORAGE_KEY =
  `${STORAGE_PREFIX}.gatewaySort`;

const SUGGESTED_GATEWAY_FILTER_STORAGE_KEY =
  `${STORAGE_PREFIX}.suggestedGatewayFilter`;

const SENSOR_FILTER_STORAGE_KEY =
  `${STORAGE_PREFIX}.sensorFilter`;

const RECOMMENDATION_FILTER_STORAGE_KEY =
  `${STORAGE_PREFIX}.recommendationFilter`;

const ASSIGNMENT_MATCH_FILTER_STORAGE_KEY =
  `${STORAGE_PREFIX}.assignmentMatchFilter`;

const ASSIGNMENT_FILTER_STORAGE_KEY =
  `${STORAGE_PREFIX}.assignmentFilter`;

const PERIOD_VALUES =
  new Set([
    String(5 / 60),
    String(10 / 60),
    String(15 / 60),
    "0.5",
    "1",
    "6",
    "24",
    "168"
  ]);

type SortDirection =
  "asc" | "desc";

type SensorSort = {
  mode: "name" | "gatewayRssi";
  direction: SortDirection;
  gatewayId?: string;
};

type AssignmentMatchStatus =
  | "MATCH"
  | "MISMATCH"
  | "UNASSIGNED"
  | "NO RECOMMENDATION";

type AssignmentFilter =
  | "ASSIGNED"
  | "UNASSIGNED";

type GatewaySort = {
  mode: "name" | "wifiRssi" | "sensorRssi";
  direction: SortDirection;
  sensorUid?: string;
};

function loadPeriod(): string {
  if (typeof window === "undefined") {
    return "24";
  }

  const value =
    window.localStorage.getItem(
      PERIOD_STORAGE_KEY
    );

  return value && PERIOD_VALUES.has(value)
    ? value
    : "24";
}

function loadSensorFilter(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return (
    window.localStorage.getItem(
      SENSOR_FILTER_STORAGE_KEY
    ) ?? ""
  );
}

function loadSensorSort(): SensorSort {
  const fallback: SensorSort = {
    mode: "name",
    direction: "asc"
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw =
      window.localStorage.getItem(
        SENSOR_SORT_STORAGE_KEY
      );

    if (!raw) return fallback;

    const value =
      JSON.parse(raw) as Partial<SensorSort>;

    if (
      (value.mode === "name" ||
        value.mode === "gatewayRssi") &&
      (value.direction === "asc" ||
        value.direction === "desc")
    ) {
      return {
        mode: value.mode,
        direction: value.direction,
        ...(typeof value.gatewayId === "string"
          ? { gatewayId: value.gatewayId }
          : {})
      };
    }
  } catch {
    // Ignore invalid persisted UI state.
  }

  return fallback;
}

function loadGatewaySort(): GatewaySort {
  const fallback: GatewaySort = {
    mode: "name",
    direction: "asc"
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw =
      window.localStorage.getItem(
        GATEWAY_SORT_STORAGE_KEY
      );

    if (!raw) return fallback;

    const value =
      JSON.parse(raw) as Partial<GatewaySort>;

    if (
      (value.mode === "name" ||
        value.mode === "wifiRssi" ||
        value.mode === "sensorRssi") &&
      (value.direction === "asc" ||
        value.direction === "desc")
    ) {
      return {
        mode: value.mode,
        direction: value.direction,
        ...(typeof value.sensorUid === "string"
          ? { sensorUid: value.sensorUid }
          : {})
      };
    }
  } catch {
    // Ignore invalid persisted UI state.
  }

  return fallback;
}

function qualityLabel(
  rssi: number
): string {
  if (rssi >= -65) return "Excellent";
  if (rssi >= -75) return "Good";
  if (rssi >= -85) return "Fair";
  return "Weak";
}

function qualityColor(
  rssi: number
): string {
  if (rssi >= -65) return "green";
  if (rssi >= -75) return "teal";
  if (rssi >= -85) return "yellow";
  return "red";
}

function ageSeconds(
  value: string | null | undefined
): number | null {
  if (!value) return null;

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / 1000
    )
  );
}

function relativeSince(
  value: string | null | undefined
): string {
  const seconds = ageSeconds(value);

  if (seconds === null) return "—";
  if (seconds < 10) return "a few seconds ago";
  if (seconds < 60) return `${seconds} sec ago`;

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes} min ago`;

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h ago`;

  const days =
    Math.floor(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ageColor(
  value: string | null | undefined
): string {
  const seconds = ageSeconds(value);

  if (seconds === null) return "dimmed";
  if (seconds > 5 * 60) return "red";
  if (seconds > 2 * 60) return "orange";
  return "dimmed";
}

function exactDate(
  value: string | null | undefined
): string {
  return value
    ? new Date(value).toLocaleString()
    : "—";
}


function periodLabel(
  value: string
): string {
  const labels: Record<string, string> = {
    [String(5 / 60)]: "5m",
    [String(10 / 60)]: "10m",
    [String(15 / 60)]: "15m",
    "0.5": "30m",
    "1": "1h",
    "6": "6h",
    "24": "24h",
    "168": "7d"
  };

  return labels[value] ?? value;
}

function minimumSamplesForPeriod(
  value: string
): number {
  const minimums: Record<string, number> = {
    [String(5 / 60)]: 4,
    [String(10 / 60)]: 8,
    [String(15 / 60)]: 12,
    "0.5": 20,
    "1": 40,
    "6": 120,
    "24": 240,
    "168": 500
  };

  return minimums[value] ?? 4;
}

function recommendationInfo(
  rows: GatewayCoverageRow[],
  totalGateways: number,
  selectedPeriod: string
): {
  gatewayId: string | null;
  status: string;
  detailLines: string[];
  color: string;
} {
  const minimumSamples =
    minimumSamplesForPeriod(
      selectedPeriod
    );

  const candidates =
    rows
      .filter(
        row =>
          Number.isFinite(row.avgRssi)
      )
      .slice()
      .sort(
        (left, right) =>
          right.avgRssi - left.avgRssi
      );

  const period =
    periodLabel(selectedPeriod);

  const gatewayWord =
    (count: number) =>
      count === 1 ? "gateway" : "gateways";

  if (candidates.length === 0) {
    return {
      gatewayId: null,
      status: "NO SUGGESTION",
      detailLines: [
        `No RSSI data in last ${period}`,
        `0/${totalGateways} gateways with data`
      ],
      color: "gray"
    };
  }

  const eligible =
    candidates.filter(
      row =>
        row.sampleCount >= minimumSamples
    );

  const insufficientCount =
    candidates.length - eligible.length;

  const coverageLines = [
    `${candidates.length}/${totalGateways} ${gatewayWord(totalGateways)} with data`,
    `${eligible.length}/${totalGateways} ${gatewayWord(totalGateways)} eligible`,
    ...(insufficientCount > 0
      ? [
          `${insufficientCount} ${gatewayWord(insufficientCount)} insufficient samples`
        ]
      : [])
  ];

  if (eligible.length === 0) {
    const bestSoFar =
      candidates.reduce(
        (best, current) =>
          current.sampleCount > best.sampleCount
            ? current
            : best,
        candidates[0]
      );

    return {
      gatewayId: null,
      status: "NO RELIABLE SUGGESTION",
      detailLines: [
        `Best data so far: ${bestSoFar.gatewayId}`,
        `${bestSoFar.sampleCount} samples available`,
        ...coverageLines
      ],
      color: "orange"
    };
  }

  const winner =
    eligible[0];

  const commonDetails = [
    `${winner.sampleCount} samples in last ${period}`,
    ...coverageLines
  ];

  const runnerUp =
    eligible[1];

  if (!runnerUp) {
    return {
      gatewayId: winner.gatewayId,
      status: "ONLY ELIGIBLE GATEWAY",
      detailLines: commonDetails,
      color: "blue"
    };
  }

  const leadDb =
    winner.avgRssi - runnerUp.avgRssi;

  if (leadDb < 3) {
    return {
      gatewayId: winner.gatewayId,
      status: `AMBIGUOUS · +${leadDb.toFixed(1)} dB`,
      detailLines: commonDetails,
      color: "yellow"
    };
  }

  if (leadDb < 8) {
    return {
      gatewayId: winner.gatewayId,
      status: `PREFERRED · +${leadDb.toFixed(1)} dB`,
      detailLines: commonDetails,
      color: "teal"
    };
  }

  return {
    gatewayId: winner.gatewayId,
    status: `STRONG · +${leadDb.toFixed(1)} dB`,
    detailLines: commonDetails,
    color: "green"
  };
}

export function GatewayCoveragePanel() {
  const queryClient =
    useQueryClient();

  const [hours, setHours] =
    React.useState(loadPeriod);

  const [resetOpened, setResetOpened] =
    React.useState(false);

  const [deleteAllOpened, setDeleteAllOpened] =
    React.useState(false);

  const [sensorSort, setSensorSort] =
    React.useState<SensorSort>(
      loadSensorSort
    );

  const [gatewaySort, setGatewaySort] =
    React.useState<GatewaySort>(
      loadGatewaySort
    );

  const [sensorFilter, setSensorFilter] =
    React.useState(loadSensorFilter);

  const [suggestedGatewayFilter, setSuggestedGatewayFilter] =
    React.useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(
        SUGGESTED_GATEWAY_FILTER_STORAGE_KEY
      );
    });

  const [recommendationFilter, setRecommendationFilter] =
    React.useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(
        RECOMMENDATION_FILTER_STORAGE_KEY
      );
    });

  const [assignmentMatchFilter, setAssignmentMatchFilter] =
    React.useState<AssignmentMatchStatus | null>(() => {
      if (typeof window === "undefined") return null;

      const value = window.localStorage.getItem(
        ASSIGNMENT_MATCH_FILTER_STORAGE_KEY
      );

      return value === "MATCH" ||
        value === "MISMATCH" ||
        value === "UNASSIGNED" ||
        value === "NO RECOMMENDATION"
        ? value
        : null;
    });

  const [assignmentFilter, setAssignmentFilter] =
    React.useState<AssignmentFilter | null>(() => {
      if (typeof window === "undefined") return null;

      const value = window.localStorage.getItem(
        ASSIGNMENT_FILTER_STORAGE_KEY
      );

      return value === "ASSIGNED" || value === "UNASSIGNED"
        ? value
        : null;
    });

  const [copiedSensorUid, setCopiedSensorUid] =
    React.useState<string | null>(null);

  const [locationGatewayId, setLocationGatewayId] =
    React.useState<string | null>(null);

  const [locationIdDraft, setLocationIdDraft] =
    React.useState<string | null>(null);

  React.useEffect(
    () => {
      window.localStorage.setItem(
        PERIOD_STORAGE_KEY,
        hours
      );
    },
    [hours]
  );

  React.useEffect(
    () => {
      window.localStorage.setItem(
        SENSOR_SORT_STORAGE_KEY,
        JSON.stringify(sensorSort)
      );
    },
    [sensorSort]
  );

  React.useEffect(
    () => {
      window.localStorage.setItem(
        GATEWAY_SORT_STORAGE_KEY,
        JSON.stringify(gatewaySort)
      );
    },
    [gatewaySort]
  );

  React.useEffect(
    () => {
      if (sensorFilter) {
        window.localStorage.setItem(
          SENSOR_FILTER_STORAGE_KEY,
          sensorFilter
        );
      } else {
        window.localStorage.removeItem(
          SENSOR_FILTER_STORAGE_KEY
        );
      }
    },
    [sensorFilter]
  );

  React.useEffect(
    () => {
      if (suggestedGatewayFilter === null) {
        window.localStorage.removeItem(
          SUGGESTED_GATEWAY_FILTER_STORAGE_KEY
        );
      } else {
        window.localStorage.setItem(
          SUGGESTED_GATEWAY_FILTER_STORAGE_KEY,
          suggestedGatewayFilter
        );
      }
    },
    [suggestedGatewayFilter]
  );

  React.useEffect(
    () => {
      if (recommendationFilter === null) {
        window.localStorage.removeItem(
          RECOMMENDATION_FILTER_STORAGE_KEY
        );
      } else {
        window.localStorage.setItem(
          RECOMMENDATION_FILTER_STORAGE_KEY,
          recommendationFilter
        );
      }
    },
    [recommendationFilter]
  );

  React.useEffect(
    () => {
      if (assignmentMatchFilter === null) {
        window.localStorage.removeItem(
          ASSIGNMENT_MATCH_FILTER_STORAGE_KEY
        );
      } else {
        window.localStorage.setItem(
          ASSIGNMENT_MATCH_FILTER_STORAGE_KEY,
          assignmentMatchFilter
        );
      }
    },
    [assignmentMatchFilter]
  );

  React.useEffect(
    () => {
      if (assignmentFilter === null) {
        window.localStorage.removeItem(
          ASSIGNMENT_FILTER_STORAGE_KEY
        );
      } else {
        window.localStorage.setItem(
          ASSIGNMENT_FILTER_STORAGE_KEY,
          assignmentFilter
        );
      }
    },
    [assignmentFilter]
  );

  const [gatewayAction, setGatewayAction] =
    React.useState<{
      type: "reset" | "delete";
      gatewayId: string;
    } | null>(null);

  const [sensorAction, setSensorAction] =
    React.useState<{
      type: "reset" | "delete";
      sensorUid: string;
    } | null>(null);

  const [assignmentSensorUid, setAssignmentSensorUid] =
    React.useState<string | null>(null);

  const [assignmentGatewayIdDraft, setAssignmentGatewayIdDraft] =
    React.useState<string | null>(null);

  const query =
    useQuery({
      queryKey: [
        "gateway-coverage",
        hours
      ],
      queryFn: () =>
        getGatewayCoverage(
          Number(hours)
        ),
      refetchInterval: AUTO_REFRESH_SECONDS * 1000
    });

  const sensorsQuery =
    useQuery({
      queryKey: ["sensors"],
      queryFn: getSensors
    });

  const functionalGatewaysQuery =
    useQuery({
      queryKey: ["gateways"],
      queryFn: getGateways
    });

  const locationsQuery =
    useQuery({
      queryKey: ["locations"],
      queryFn: getLocations,
      enabled: locationGatewayId !== null
    });

  const rows =
    query.data?.rows ?? [];

  const sensorByUid =
    new Map(
      (sensorsQuery.data ?? []).map(
        sensor => [sensor.uid, sensor]
      )
    );

  const sensorNameByUid =
    new Map(
      (sensorsQuery.data ?? []).map(
        sensor => [sensor.uid, sensor.name]
      )
    );

  const sensorDisplayName =
    (sensorUid: string): string =>
      sensorNameByUid.get(sensorUid)?.trim() || sensorUid;

  const gatewaySummaries =
    query.data?.gateways ?? [];

  const gatewayById =
    new Map(
      gatewaySummaries.map(
        gateway => [
          gateway.gatewayId,
          gateway
        ]
      )
    );

  const bySensorGateway =
    new Map(
      rows.map(row => [
        `${row.sensorUid}\u0000${row.gatewayId}`,
        row
      ])
    );

  const compareNullableNumber = (
    left: number | null | undefined,
    right: number | null | undefined,
    direction: "asc" | "desc"
  ): number => {
    const leftMissing =
      left === null || left === undefined;
    const rightMissing =
      right === null || right === undefined;

    if (leftMissing && rightMissing) return 0;
    if (leftMissing) return 1;
    if (rightMissing) return -1;

    return direction === "asc"
      ? left - right
      : right - left;
  };

  const gateways =
    gatewaySummaries
      .map(gateway => gateway.gatewayId)
      .sort((left, right) => {
        if (gatewaySort.mode === "name") {
          return gatewaySort.direction === "asc"
            ? left.localeCompare(right)
            : right.localeCompare(left);
        }

        if (gatewaySort.mode === "wifiRssi") {
          const result =
            compareNullableNumber(
              gatewayById.get(left)?.wifiRssi,
              gatewayById.get(right)?.wifiRssi,
              gatewaySort.direction
            );

          return result !== 0
            ? result
            : left.localeCompare(right);
        }

        const sensorUid =
          gatewaySort.sensorUid;

        const result =
          compareNullableNumber(
            sensorUid
              ? bySensorGateway.get(
                  `${sensorUid}\u0000${left}`
                )?.avgRssi
              : null,
            sensorUid
              ? bySensorGateway.get(
                  `${sensorUid}\u0000${right}`
                )?.avgRssi
              : null,
            gatewaySort.direction
          );

        return result !== 0
          ? result
          : left.localeCompare(right);
      });

  const normalizedSensorFilter =
    sensorFilter.trim().toLocaleLowerCase();

  const rowsBySensor =
    new Map<string, GatewayCoverageRow[]>();

  for (const row of rows) {
    const current =
      rowsBySensor.get(row.sensorUid) ?? [];
    current.push(row);
    rowsBySensor.set(row.sensorUid, current);
  }

  const suggestionBySensorUid =
    new Map(
      Array.from(rowsBySensor.entries()).map(
        ([sensorUid, sensorRows]) => [
          sensorUid,
          recommendationInfo(
            sensorRows,
            gateways.length,
            hours
          )
        ]
      )
    );

  const allSensorUids =
    Array.from(
      new Set(
        rows.map(row => row.sensorUid)
      )
    );

  const assignedSensorCount =
    allSensorUids.filter(
      sensorUid => Boolean(sensorByUid.get(sensorUid)?.gateway)
    ).length;

  const unassignedSensorCount =
    allSensorUids.length - assignedSensorCount;

  const functionalGatewayByGatewayId =
    new Map(
      (functionalGatewaysQuery.data ?? []).map(
        gateway => [gateway.gatewayId, gateway]
      )
    );

  const assignmentGatewayOptions =
    (functionalGatewaysQuery.data ?? [])
      .slice()
      .sort((left, right) =>
        left.name.localeCompare(right.name)
      )
      .map(gateway => ({
        value: gateway.id,
        label: `${gateway.name} · ${gateway.gatewayId} · ${gateway.location?.name ?? "[No location]"}`
      }));

  const suggestedCountByGateway =
    new Map(
      gateways.map(gateway => [
        gateway,
        allSensorUids.filter(
          sensorUid =>
            suggestionBySensorUid.get(sensorUid)?.gatewayId === gateway
        ).length
      ])
    );

  const assignmentMatchStatus =
    (sensorUid: string): AssignmentMatchStatus => {
      const assignedGateway =
        sensorByUid.get(sensorUid)?.gateway ?? null;
      const suggestion =
        suggestionBySensorUid.get(sensorUid);

      if (!assignedGateway) {
        return "UNASSIGNED";
      }

      if (!suggestion?.gatewayId) {
        return "NO RECOMMENDATION";
      }

      return suggestion.gatewayId === assignedGateway.gatewayId
        ? "MATCH"
        : "MISMATCH";
    };

  const matchSensorCount =
    allSensorUids.filter(
      sensorUid => assignmentMatchStatus(sensorUid) === "MATCH"
    ).length;

  const mismatchSensorCount =
    allSensorUids.filter(
      sensorUid => assignmentMatchStatus(sensorUid) === "MISMATCH"
    ).length;

  const noRecommendationSensorCount =
    allSensorUids.filter(
      sensorUid =>
        assignmentMatchStatus(sensorUid) === "NO RECOMMENDATION"
    ).length;

  const sensors =
    allSensorUids
      .filter(sensorUid => {
        const name =
          sensorDisplayName(sensorUid).toLocaleLowerCase();

        const matchesSensorFilter =
          !normalizedSensorFilter ||
          name.includes(normalizedSensorFilter) ||
          sensorUid.toLocaleLowerCase().includes(normalizedSensorFilter);

        if (!matchesSensorFilter) return false;

        const isAssigned =
          Boolean(sensorByUid.get(sensorUid)?.gateway);

        if (
          assignmentFilter === "ASSIGNED" &&
          !isAssigned
        ) {
          return false;
        }

        if (
          assignmentFilter === "UNASSIGNED" &&
          isAssigned
        ) {
          return false;
        }

        const suggestion =
          suggestionBySensorUid.get(sensorUid);

        if (recommendationFilter !== null) {
          const recommendationMatches =
            recommendationFilter === "STRONG"
              ? suggestion?.status.startsWith("STRONG")
              : recommendationFilter === "PREFERRED"
                ? suggestion?.status.startsWith("PREFERRED")
                : recommendationFilter === "AMBIGUOUS"
                  ? suggestion?.status.startsWith("AMBIGUOUS")
                  : suggestion?.status === recommendationFilter;

          if (!recommendationMatches) return false;
        }

        if (
          assignmentMatchFilter !== null &&
          assignmentMatchStatus(sensorUid) !== assignmentMatchFilter
        ) {
          return false;
        }

        if (suggestedGatewayFilter === null) return true;

        if (suggestedGatewayFilter === "__no_reliable__") {
          return suggestion?.status === "NO RELIABLE SUGGESTION";
        }

        if (suggestedGatewayFilter === "__no_suggestion__") {
          return suggestion?.status === "NO SUGGESTION";
        }

        return suggestion?.gatewayId === suggestedGatewayFilter;
      })
      .sort((left, right) => {
        if (sensorSort.mode === "name") {
          const leftName = sensorDisplayName(left);
          const rightName = sensorDisplayName(right);
          const result = leftName.localeCompare(rightName);

          if (result !== 0) {
            return sensorSort.direction === "asc"
              ? result
              : -result;
          }

          return left.localeCompare(right);
        }

        const gatewayId =
          sensorSort.gatewayId;

        const result =
          compareNullableNumber(
            gatewayId
              ? bySensorGateway.get(
                  `${left}\u0000${gatewayId}`
                )?.avgRssi
              : null,
            gatewayId
              ? bySensorGateway.get(
                  `${right}\u0000${gatewayId}`
                )?.avgRssi
              : null,
            sensorSort.direction
          );

        return result !== 0
          ? result
          : sensorDisplayName(left).localeCompare(
              sensorDisplayName(right)
            );
      });

  const sensorCountByGateway =
    new Map(
      gateways.map(
        gateway => [
          gateway,
          new Set(
            rows
              .filter(
                row =>
                  row.gatewayId === gateway
              )
              .map(row => row.sensorUid)
          ).size
        ]
      )
    );

  const setGatewayOrder = (
    mode: "name" | "wifiRssi"
  ) => {
    setGatewaySort(current => ({
      mode,
      direction:
        current.mode === mode
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : mode === "name"
            ? "asc"
            : "desc"
    }));
  };

  const sortGatewaysForSensor = (
    sensorUid: string
  ) => {
    setGatewaySort(current => ({
      mode: "sensorRssi",
      sensorUid,
      direction:
        current.mode === "sensorRssi" &&
        current.sensorUid === sensorUid
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : "desc"
    }));
  };

  const sortSensorsForGateway = (
    gatewayId: string
  ) => {
    setSensorSort(current => ({
      mode: "gatewayRssi",
      gatewayId,
      direction:
        current.mode === "gatewayRssi" &&
        current.gatewayId === gatewayId
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : "desc"
    }));
  };
  const resetSorting = () => {
    setGatewaySort({
      mode: "name",
      direction: "asc"
    });
    setSensorSort({
      mode: "name",
      direction: "asc"
    });
  };

  const filtersActive =
    assignmentFilter !== null ||
    sensorFilter.trim().length > 0 ||
    suggestedGatewayFilter !== null ||
    recommendationFilter !== null ||
    assignmentMatchFilter !== null;

  const resetFilters = () => {
    setAssignmentFilter(null);
    setSensorFilter("");
    setSuggestedGatewayFilter(null);
    setRecommendationFilter(null);
    setAssignmentMatchFilter(null);
  };

  const copySensorUid =
    async (sensorUid: string) => {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(sensorUid);
      } else {
        const textarea =
          document.createElement("textarea");

        textarea.value = sensorUid;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setCopiedSensorUid(sensorUid);

      window.setTimeout(
        () => {
          setCopiedSensorUid(current =>
            current === sensorUid ? null : current
          );
        },
        1200
      );
    };

  const openLocationEditor =
    (
      gatewayId: string,
      locationId: string | null | undefined
    ) => {
      setLocationGatewayId(gatewayId);
      setLocationIdDraft(locationId ?? null);
    };

  const locationOptions =
    (locationsQuery.data ?? [])
      .slice()
      .sort((left, right) =>
        left.name.localeCompare(right.name)
      )
      .map(location => ({
        value: location.id,
        label: `${location.name} · ${location.type}`
      }));

  const openSensorAssignment =
    (
      sensorUid: string,
      targetGatewayId?: string | null
    ) => {
      const sensor = sensorByUid.get(sensorUid);
      const targetGateway = targetGatewayId
        ? functionalGatewayByGatewayId.get(targetGatewayId)
        : null;

      setAssignmentSensorUid(sensorUid);
      setAssignmentGatewayIdDraft(
        targetGateway?.id ?? sensor?.gateway?.id ?? null
      );
    };

  const resetMutation =
    useMutation({
      mutationFn:
        resetGatewayCoverage,

      onSuccess:
        async () => {
          setResetOpened(false);

          await queryClient
            .invalidateQueries({
              queryKey: [
                "gateway-coverage"
              ]
            });
        }
    });

  const deleteAllMutation =
    useMutation({
      mutationFn:
        deleteAllGatewayCoverageGateways,

      onSuccess:
        async () => {
          setDeleteAllOpened(false);

          await queryClient
            .invalidateQueries({
              queryKey: [
                "gateway-coverage"
              ]
            });
        }
    });

  const updateGatewayLocationMutation =
    useMutation({
      mutationFn: ({
        gatewayId,
        locationId
      }: {
        gatewayId: string;
        locationId: string | null;
      }) =>
        updateGatewayCoverageLocation(
          gatewayId,
          locationId
        ),

      onSuccess:
        async () => {
          setLocationGatewayId(null);
          setLocationIdDraft(null);

          await queryClient.invalidateQueries({
            queryKey: ["gateway-coverage"]
          });
        }
    });

  const resetGatewayMutation =
    useMutation({
      mutationFn:
        resetGatewayCoverageGateway,

      onSuccess:
        async () => {
          setGatewayAction(null);
          await queryClient.invalidateQueries({
            queryKey: ["gateway-coverage"]
          });
        }
    });

  const deleteGatewayMutation =
    useMutation({
      mutationFn:
        deleteGatewayCoverageGateway,

      onSuccess:
        async () => {
          setGatewayAction(null);
          await queryClient.invalidateQueries({
            queryKey: ["gateway-coverage"]
          });
        }
    });

  const resetSensorMutation =
    useMutation({
      mutationFn:
        resetGatewayCoverageSensor,

      onSuccess:
        async () => {
          setSensorAction(null);
          await queryClient.invalidateQueries({
            queryKey: ["gateway-coverage"]
          });
        }
    });

  const deleteSensorMutation =
    useMutation({
      mutationFn:
        deleteGatewayCoverageSensor,

      onSuccess:
        async () => {
          setSensorAction(null);
          await queryClient.invalidateQueries({
            queryKey: ["gateway-coverage"]
          });
        }
    });

  const updateSensorAssignmentMutation =
    useMutation({
      mutationFn: ({
        sensorId,
        gatewayId
      }: {
        sensorId: string;
        gatewayId: string | null;
      }) =>
        updateSensor(sensorId, {
          gatewayId
        }),

      onSuccess:
        async () => {
          setAssignmentSensorUid(null);
          setAssignmentGatewayIdDraft(null);

          await queryClient.invalidateQueries({
            queryKey: ["sensors"]
          });
        }
    });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Group gap="xs">
            <NavigationIcon page="gateway-coverage" size={24} />
            <Title order={2}>Gateway Coverage</Title>
          </Group>
          <Text c="dimmed">
            Compare BLE RSSI received by each candidate ESP gateway.
          </Text>
        </div>

        <Group gap="sm">
          <SegmentedControl
            value={hours}
            onChange={setHours}
            data={[
              { label: "5m", value: String(5 / 60) },
              { label: "10m", value: String(10 / 60) },
              { label: "15m", value: String(15 / 60) },
              { label: "30m", value: "0.5" },
              { label: "1h", value: "1" },
              { label: "6h", value: "6" },
              { label: "24h", value: "24" },
              { label: "7d", value: "168" }
            ]}
          />

          <Button
            color="blue"
            variant="light"
            loading={query.isFetching}
            onClick={
              () => void query.refetch()
            }
          >
            Refresh (auto {AUTO_REFRESH_SECONDS} s)
          </Button>

          <Button
            color="orange"
            variant="light"
            onClick={
              () => setResetOpened(true)
            }
          >
            Reset
          </Button>

          <Button
            color="red"
            variant="light"
            onClick={
              () => setDeleteAllOpened(true)
            }
          >
            Delete
          </Button>
        </Group>
      </Group>

      {query.isLoading && <Loader />}

      {query.isError && (
        <Alert color="red" title="Coverage data unavailable">
          {query.error instanceof Error
            ? query.error.message
            : "Unable to load gateway coverage data."}
        </Alert>
      )}

      {!query.isLoading && !query.isError && rows.length === 0 && (
        <Alert title="No coverage samples yet">
          Waiting for MQTT topics such as
          {" "}
          sensors/ble_gateway/ble-gateway-01/sensor/rssi_c8_ac_73/state.
        </Alert>
      )}

      {gatewaySummaries.length > 0 && (
        <Card withBorder padding="md" pt={6}>
          <Group justify="space-between" mb="xs" align="flex-end">
            <Stack gap={1}>
              <Text fw={600}>
                BLE Gateways: {gateways.length}
              </Text>
              <Text fw={600}>
                Sensors: {sensors.length} / {allSensorUids.length} / Assigned: {assignedSensorCount} / Unassigned: {unassignedSensorCount} / Match: {matchSensorCount} / Mismatch: {mismatchSensorCount} / No recommendation: {noRecommendationSensorCount}
              </Text>
            </Stack>
            <Group gap="xs" align="flex-end">
              <Select
                size="xs"
                label="Assignment"
                placeholder="All"
                clearable
                value={assignmentFilter}
                onChange={value =>
                  setAssignmentFilter(
                    value === "ASSIGNED" || value === "UNASSIGNED"
                      ? value
                      : null
                  )
                }
                data={[
                  { value: "ASSIGNED", label: "Assigned" },
                  { value: "UNASSIGNED", label: "Not assigned" }
                ]}
                aria-label="Filter sensors by gateway assignment"
              />
              <TextInput
                size="xs"
                label="Sensor filter"
                placeholder="Name or UID"
                value={sensorFilter}
                onChange={event =>
                  setSensorFilter(event.currentTarget.value)
                }
                rightSection={
                  sensorFilter
                    ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        px={4}
                        onClick={() => setSensorFilter("")}
                        aria-label="Clear sensor filter"
                      >
                        ×
                      </Button>
                    )
                    : undefined
                }
              />
              <ResetFiltersAction
                active={filtersActive}
                onReset={resetFilters}
              />
              <Button
                size="compact-sm"
                variant="light"
                color="gray"
                onClick={resetSorting}
              >
                Reset sorting
              </Button>
            </Group>
          </Group>

          <Group
            gap={6}
            mb="sm"
            wrap="wrap"
          >
            <Text size="xs" c="dimmed" fw={600}>
              RSSI quality
            </Text>

            <Badge
              size="xs"
              variant="light"
              color={qualityColor(-65)}
            >
              Excellent ≥ -65 dBm
            </Badge>

            <Badge
              size="xs"
              variant="light"
              color={qualityColor(-70)}
            >
              Good -75 to &lt; -65 dBm
            </Badge>

            <Badge
              size="xs"
              variant="light"
              color={qualityColor(-80)}
            >
              Fair -85 to &lt; -75 dBm
            </Badge>

            <Badge
              size="xs"
              variant="light"
              color={qualityColor(-90)}
            >
              Weak &lt; -85 dBm
            </Badge>
          </Group>

          <Table.ScrollContainer minWidth={720}>
            <Table
              striped
              highlightOnHover
              verticalSpacing="xs"
              style={{
                tableLayout: "fixed",
                width: "100%",
                minWidth: `${176 + gateways.length * 208 + 157}px`
              }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th
                    style={{
                      width: 176,
                      minWidth: 176
                    }}
                  >
                    <Stack gap={6}>
                      <Text size="xs" c="dimmed" fw={600}>
                        Gateway order
                      </Text>

                      <Group gap={4} wrap="wrap">
                        <Button
                          size="compact-xs"
                          color={gatewaySort.mode === "name" ? "blue" : "gray"}
                          variant={gatewaySort.mode === "name" ? "light" : "subtle"}
                          onClick={() => setGatewayOrder("name")}
                        >
                          Name {
                            gatewaySort.mode === "name"
                              ? gatewaySort.direction === "asc"
                                ? "A→Z"
                                : "Z→A"
                              : "A↔Z"
                          }
                        </Button>

                        <Button
                          size="compact-xs"
                          color={gatewaySort.mode === "wifiRssi" ? "blue" : "gray"}
                          variant={gatewaySort.mode === "wifiRssi" ? "light" : "subtle"}
                          onClick={() => setGatewayOrder("wifiRssi")}
                        >
                          WiFi RSSI {
                            gatewaySort.mode === "wifiRssi"
                              ? gatewaySort.direction === "desc"
                                ? "→"
                                : "←"
                              : "↔"
                          }
                        </Button>
                      </Group>

                      <Text size="xs" c="dimmed" fw={600} mt={2}>
                        Sensor order
                      </Text>

                      <Button
                        color={sensorSort.mode === "name" ? "blue" : "gray"}
                        variant={sensorSort.mode === "name" ? "light" : "subtle"}
                        size="compact-sm"
                        px={6}
                        onClick={() =>
                          setSensorSort(current => ({
                            mode: "name",
                            direction:
                              current.mode === "name" &&
                              current.direction === "asc"
                                ? "desc"
                                : "asc"
                          }))
                        }
                      >
                        Sensor name ({sensors.length}) {
                          sensorSort.mode === "name"
                            ? sensorSort.direction === "asc"
                              ? "A→Z"
                              : "Z→A"
                            : "A↔Z"
                        }
                      </Button>

                      {gatewaySort.mode === "sensorRssi" && (
                        <Text size="xs" c="blue">
                          Gateway order: {gatewaySort.sensorUid} RSSI {
                            gatewaySort.direction === "desc" ? "→" : "←"
                          }
                        </Text>
                      )}

                      {sensorSort.mode === "gatewayRssi" && (
                        <Text size="xs" c="blue">
                          Sensor order: {sensorSort.gatewayId} RSSI {
                            sensorSort.direction === "desc" ? "↓" : "↑"
                          }
                        </Text>
                      )}
                    </Stack>
                  </Table.Th>
                  {gateways.map(gateway => {
                    const summary =
                      gatewayById.get(gateway);

                    return (
                      <Table.Th
                        key={gateway}
                        style={{
                          width: 208,
                          minWidth: 208
                        }}
                      >
                        <Stack gap={3}>
                          <Group gap={4} wrap="nowrap">
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color={
                                suggestedGatewayFilter === gateway
                                  ? "blue"
                                  : "white"
                              }
                              aria-label={`Filter suggested gateway ${gateway}`}
                              title={
                                suggestedGatewayFilter === gateway
                                  ? `Clear suggested gateway filter ${gateway}`
                                  : `Filter suggestions on ${gateway}`
                              }
                              onClick={() =>
                                setSuggestedGatewayFilter(current =>
                                  current === gateway ? null : gateway
                                )
                              }
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2 3h12L9.5 8v4L6.5 14V8L2 3Z"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </ActionIcon>
                            <Tooltip
                              multiline
                              withArrow
                              label={
                                <Stack gap={2}>
                                  <Text size="xs">Board: {summary?.boardId ?? "—"}</Text>
                                  <Text size="xs">MAC: {summary?.macAddress ?? "—"}</Text>
                                  <Text size="xs">IP: {summary?.ipAddress ?? "—"}</Text>
                                  <Text size="xs">SSID: {summary?.wifiSsid ?? "—"}</Text>
                                  <Text size="xs">Build: {summary?.buildDate ?? "—"}</Text>
                                </Stack>
                              }
                            >
                              <Text fw={600} style={{ cursor: "help" }}>
                                {gateway}
                              </Text>
                            </Tooltip>
                            <Button
                              size="compact-xs"
                              color={
                                sensorSort.mode === "gatewayRssi" &&
                                sensorSort.gatewayId === gateway
                                  ? "blue"
                                  : "gray"
                              }
                              variant={
                                sensorSort.mode === "gatewayRssi" &&
                                sensorSort.gatewayId === gateway
                                  ? "light"
                                  : "subtle"
                              }
                              onClick={() =>
                                sortSensorsForGateway(gateway)
                              }
                              title={`Sort sensors by RSSI received through ${gateway}`}
                            >
                              RSSI {
                                sensorSort.mode === "gatewayRssi" &&
                                sensorSort.gatewayId === gateway
                                  ? sensorSort.direction === "asc" ? "↑" : "↓"
                                  : "↕"
                              }
                            </Button>
                          </Group>
                          <Group gap={4} wrap="nowrap">
                            <Text
                              size="xs"
                              c={summary?.locationName ? "blue" : "dimmed"}
                              fw={500}
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 168
                              }}
                              title={summary?.locationName ?? "[No location]"}
                            >
                              {summary?.locationName ?? "[No location]"}
                            </Text>
                            <ActionIcon
                              size="xs"
                              color="green"
                              variant="subtle"
                              aria-label={`Edit location for ${gateway}`}
                              title={`Edit location for ${gateway}`}
                              onClick={() =>
                                openLocationEditor(
                                  gateway,
                                  summary?.locationId
                                )
                              }
                            >
                              ✎
                            </ActionIcon>
                          </Group>
                          <Group gap="xs">
                            <Text size="xs" c="dimmed" fw={400}>
                              WiFi:
                            </Text>
                            {summary?.wifiRssi !== null && summary?.wifiRssi !== undefined
                              ? (
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color={qualityColor(summary.wifiRssi)}
                                  title={exactDate(summary.wifiRssiSeenAt)}
                                >
                                  {summary.wifiRssi.toFixed(0)} dBm · {qualityLabel(summary.wifiRssi)}
                                </Badge>
                              )
                              : (
                                <Text size="xs" c="dimmed">—</Text>
                              )}
                          </Group>
                          <Text
                            size="xs"
                            c="dimmed"
                            fw={400}
                          >
                            {
                              summary?.sensorCount
                              ?? sensorCountByGateway.get(gateway)
                              ?? 0
                            } sensors / {
                              suggestedCountByGateway.get(gateway) ?? 0
                            } suggested
                          </Text>
                          <Text
                            size="xs"
                            c={ageColor(summary?.lastSeenAt)}
                            fw={400}
                            style={{
                              whiteSpace: "nowrap"
                            }}
                            title={
                              exactDate(
                                summary?.lastSeenAt
                              )
                            }
                          >
                            {
                              relativeSince(
                                summary?.lastSeenAt
                              )
                            }
                          </Text>
                          <Group gap={4} wrap="nowrap">
                            <Button
                              size="compact-xs"
                              color="orange"
                              variant="light"
                              onClick={() =>
                                setGatewayAction({
                                  type: "reset",
                                  gatewayId: gateway
                                })
                              }
                            >
                              Reset
                            </Button>
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              onClick={() =>
                                setGatewayAction({
                                  type: "delete",
                                  gatewayId: gateway
                                })
                              }
                            >
                              Delete
                            </Button>
                          </Group>
                        </Stack>
                      </Table.Th>
                    );
                  })}
                  <Table.Th
                    style={{
                      width: 157,
                      minWidth: 157
                    }}
                  >
                    <Stack gap={4}>
                      <Text fw={600}>Suggested gateway</Text>
                      <Select
                        size="xs"
                        value={suggestedGatewayFilter}
                        onChange={setSuggestedGatewayFilter}
                        placeholder="All gateways"
                        clearable
                        data={[
                          ...gateways.map(gateway => ({
                            value: gateway,
                            label: gateway
                          })),
                          {
                            value: "__no_reliable__",
                            label: "No reliable suggestion"
                          },
                          {
                            value: "__no_suggestion__",
                            label: "No suggestion"
                          }
                        ]}
                        aria-label="Filter by suggested gateway"
                      />
                      <Select
                        size="xs"
                        label="Recommendation"
                        value={recommendationFilter}
                        onChange={setRecommendationFilter}
                        placeholder="All recommendations"
                        clearable
                        data={[
                          "STRONG",
                          "PREFERRED",
                          "AMBIGUOUS",
                          "ONLY ELIGIBLE GATEWAY",
                          "NO RELIABLE SUGGESTION",
                          "NO SUGGESTION"
                        ]}
                        aria-label="Filter by recommendation"
                      />
                      <Select
                        size="xs"
                        label="Assignment match"
                        value={assignmentMatchFilter}
                        onChange={value =>
                          setAssignmentMatchFilter(
                            value as AssignmentMatchStatus | null
                          )
                        }
                        placeholder="All assignment states"
                        clearable
                        data={[
                          "MATCH",
                          "MISMATCH",
                          "UNASSIGNED",
                          "NO RECOMMENDATION"
                        ]}
                        aria-label="Filter by gateway assignment match"
                      />
                      <Text size="xs" c="dimmed">
                        Minimum samples for suggestion: {minimumSamplesForPeriod(hours)}
                      </Text>
                    </Stack>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {sensors.map(sensorUid => {
                  const sensorRows =
                    rowsBySensor.get(sensorUid) ?? [];

                  const suggestion =
                    suggestionBySensorUid.get(sensorUid)
                    ?? recommendationInfo(
                      sensorRows,
                      gateways.length,
                      hours
                    );

                  const suggestedGatewayRow =
                    suggestion.gatewayId
                      ? bySensorGateway.get(
                          `${sensorUid}\u0000${suggestion.gatewayId}`
                        )
                      : undefined;

                  const assignedGateway =
                    sensorByUid.get(sensorUid)?.gateway ?? null;

                  const assignmentStatus =
                    assignmentMatchStatus(sensorUid);

                  const assignmentColor =
                    assignmentStatus === "MATCH"
                      ? "green"
                      : assignmentStatus === "MISMATCH"
                        ? "red"
                        : assignmentStatus === "NO RECOMMENDATION"
                          ? "orange"
                          : "gray";

                  return (
                    <Table.Tr key={sensorUid}>
                      <Table.Td
                        style={{
                          width: 176,
                          minWidth: 176
                        }}
                      >
                        <Stack gap={2}>
                          {sensorDisplayName(sensorUid) !== sensorUid && (
                            <Text
                              c="dimmed"
                              lh={1.1}
                              style={{
                                fontSize: 11
                              }}
                            >
                              {sensorDisplayName(sensorUid)}
                            </Text>
                          )}
                          <Group gap={4} wrap="nowrap">
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color={
                                sensorFilter.trim().toLocaleLowerCase() ===
                                sensorUid.toLocaleLowerCase()
                                  ? "blue"
                                  : "white"
                              }
                              aria-label={`Filter sensor ${sensorUid}`}
                              title={
                                sensorFilter.trim().toLocaleLowerCase() ===
                                sensorUid.toLocaleLowerCase()
                                  ? `Clear sensor filter ${sensorUid}`
                                  : `Filter on ${sensorUid}`
                              }
                              onClick={() =>
                                setSensorFilter(current =>
                                  current.trim().toLocaleLowerCase() ===
                                  sensorUid.toLocaleLowerCase()
                                    ? ""
                                    : sensorUid
                                )
                              }
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2 3h12L9.5 8v4L6.5 14V8L2 3Z"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </ActionIcon>
                            <Text size="sm" fw={600}>
                              {sensorUid}
                            </Text>
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color={
                                copiedSensorUid === sensorUid
                                  ? "green"
                                  : "gray"
                              }
                              style={{
                                opacity: copiedSensorUid === sensorUid ? 1 : 0.3
                              }}
                              aria-label={`Copy ${sensorUid}`}
                              title={
                                copiedSensorUid === sensorUid
                                  ? "Copied"
                                  : "Copy sensor UID"
                              }
                              onClick={() =>
                                void copySensorUid(sensorUid)
                              }
                            >
                              {copiedSensorUid === sensorUid ? (
                                "✓"
                              ) : (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <rect
                                    x="5"
                                    y="5"
                                    width="9"
                                    height="9"
                                    rx="2"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                  />
                                  <path
                                    d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                            </ActionIcon>
                            <Button
                              size="compact-xs"
                              color={
                                gatewaySort.mode === "sensorRssi" &&
                                gatewaySort.sensorUid === sensorUid
                                  ? "blue"
                                  : "gray"
                              }
                              variant={
                                gatewaySort.mode === "sensorRssi" &&
                                gatewaySort.sensorUid === sensorUid
                                  ? "light"
                                  : "subtle"
                              }
                              onClick={() =>
                                sortGatewaysForSensor(sensorUid)
                              }
                              title={`Sort gateways by RSSI for ${sensorUid}`}
                            >
                              RSSI {
                                gatewaySort.mode === "sensorRssi" &&
                                gatewaySort.sensorUid === sensorUid
                                  ? gatewaySort.direction === "desc"
                                    ? "→"
                                    : "←"
                                  : "↔"
                              }
                            </Button>
                          </Group>
                          <Text
                            size="xs"
                            c={assignedGateway ? "blue" : "dimmed"}
                            fw={500}
                            title={
                              assignedGateway
                                ? `${assignedGateway.name} · ${assignedGateway.gatewayId}`
                                : "No gateway assigned"
                            }
                          >
                            Assigned: {
                              assignedGateway
                                ? `${assignedGateway.name} · ${assignedGateway.gatewayId}`
                                : "—"
                            }
                          </Text>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="blue"
                            px={0}
                            style={{ alignSelf: "flex-start" }}
                            onClick={() =>
                              openSensorAssignment(sensorUid)
                            }
                          >
                            Change
                          </Button>
                          <Group gap={4} wrap="nowrap">
                            <Button
                              size="compact-xs"
                              color="orange"
                              variant="light"
                              onClick={() =>
                                setSensorAction({
                                  type: "reset",
                                  sensorUid
                                })
                              }
                            >
                              Reset
                            </Button>
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="light"
                              onClick={() =>
                                setSensorAction({
                                  type: "delete",
                                  sensorUid
                                })
                              }
                            >
                              Delete
                            </Button>
                          </Group>
                        </Stack>
                      </Table.Td>

                      {gateways.map(gateway => {
                        const row =
                          bySensorGateway.get(
                            `${sensorUid}\u0000${gateway}`
                          );

                        if (!row) {
                          return (
                            <Table.Td
                              key={gateway}
                              style={{
                                width: 208,
                                minWidth: 208
                              }}
                            >
                              —
                            </Table.Td>
                          );
                        }

                        return (
                          <Table.Td
                            key={gateway}
                            style={{
                              width: 208,
                              minWidth: 208
                            }}
                          >
                            <Stack gap={2}>
                              <Group gap="xs">
                                <Text fw={row.rank === 1 ? 700 : 500}>
                                  {row.avgRssi.toFixed(1)} dBm
                                </Text>
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color={qualityColor(row.avgRssi)}
                                >
                                  {qualityLabel(row.avgRssi)}
                                </Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                min {row.minRssi.toFixed(0)} · max {row.maxRssi.toFixed(0)} · σ {row.stddevRssi.toFixed(1)}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {row.sampleCount} samples in last {periodLabel(hours)}
                              </Text>
                              <Text
                                size="xs"
                                c={ageColor(row.lastSeenAt)}
                                style={{
                                  whiteSpace: "nowrap"
                                }}
                                title={
                                  exactDate(
                                    row.lastSeenAt
                                  )
                                }
                              >
                                {relativeSince(row.lastSeenAt)}
                              </Text>
                            </Stack>
                          </Table.Td>
                        );
                      })}

                      <Table.Td
                        style={{
                          width: 157,
                          minWidth: 157
                        }}
                      >
                        <Stack gap={1}>
                          <Group gap={4} wrap="nowrap">
                            {suggestion.gatewayId && (
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color={
                                  suggestedGatewayFilter === suggestion.gatewayId
                                    ? "blue"
                                    : "white"
                                }
                                aria-label={`Filter suggested gateway ${suggestion.gatewayId}`}
                                title={
                                  suggestedGatewayFilter === suggestion.gatewayId
                                    ? `Clear suggested gateway filter ${suggestion.gatewayId}`
                                    : `Filter on ${suggestion.gatewayId}`
                                }
                                onClick={() =>
                                  setSuggestedGatewayFilter(current =>
                                    current === suggestion.gatewayId
                                      ? null
                                      : suggestion.gatewayId
                                  )
                                }
                              >
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M2 3h12L9.5 8v4L6.5 14V8L2 3Z"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </ActionIcon>
                            )}
                            <Text fw={600}>
                              {suggestion.gatewayId ?? "—"}
                            </Text>
                          </Group>
                          {suggestedGatewayRow && (
                            <Group gap={4} wrap="nowrap">
                              <Text
                                size="sm"
                                fw={600}
                              >
                                {suggestedGatewayRow.avgRssi.toFixed(1)} dBm
                              </Text>

                              <Badge
                                size="xs"
                                variant="light"
                                color={
                                  qualityColor(
                                    suggestedGatewayRow.avgRssi
                                  )
                                }
                              >
                                {
                                  qualityLabel(
                                    suggestedGatewayRow.avgRssi
                                  )
                                }
                              </Badge>
                            </Group>
                          )}

                          <Badge
                            size="xs"
                            variant="light"
                            color={suggestion.color}
                          >
                            {suggestion.status}
                          </Badge>
                          <Badge
                            size="xs"
                            variant="light"
                            color={assignmentColor}
                          >
                            {assignmentStatus}
                          </Badge>
                          {assignmentStatus === "MISMATCH" && assignedGateway && (
                            <Text size="xs" c="dimmed" lh={1.25}>
                              Assigned: {assignedGateway.gatewayId}
                            </Text>
                          )}
                          {assignmentStatus === "NO RECOMMENDATION" && assignedGateway && (
                            <Text size="xs" c="dimmed" lh={1.25}>
                              Assigned: {assignedGateway.gatewayId}
                            </Text>
                          )}
                          {suggestion.gatewayId && assignmentStatus !== "MATCH" && (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="blue"
                              mt={2}
                              disabled={
                                !functionalGatewayByGatewayId.has(
                                  suggestion.gatewayId
                                )
                              }
                              title={
                                functionalGatewayByGatewayId.has(suggestion.gatewayId)
                                  ? `Assign ${sensorUid} to ${suggestion.gatewayId}`
                                  : `${suggestion.gatewayId} is not present in the functional gateway registry`
                              }
                              onClick={() =>
                                openSensorAssignment(
                                  sensorUid,
                                  suggestion.gatewayId
                                )
                              }
                            >
                              Assign suggested
                            </Button>
                          )}
                          {suggestion.detailLines.map(
                            (line, index) => (
                              <Text
                                key={`${index}-${line}`}
                                size="xs"
                                c="dimmed"
                                lh={1.25}
                                style={{
                                  whiteSpace: "normal"
                                }}
                              >
                                {line}
                              </Text>
                            )
                          )}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <Modal
        opened={assignmentSensorUid !== null}
        onClose={() => {
          setAssignmentSensorUid(null);
          setAssignmentGatewayIdDraft(null);
        }}
        title="Assign sensor to gateway"
        centered
      >
        {(() => {
          const sensor = assignmentSensorUid
            ? sensorByUid.get(assignmentSensorUid)
            : undefined;
          const suggestion = assignmentSensorUid
            ? suggestionBySensorUid.get(assignmentSensorUid)
            : undefined;
          const suggestedGateway = suggestion?.gatewayId
            ? functionalGatewayByGatewayId.get(suggestion.gatewayId)
            : undefined;

          return (
            <Stack gap="md">
              <div>
                <Text fw={600}>
                  {sensor?.name?.trim() || assignmentSensorUid || "Sensor"}
                </Text>
                <Text size="xs" c="dimmed">
                  {assignmentSensorUid}
                </Text>
              </div>

              <Text size="sm">
                Current: {sensor?.gateway
                  ? `${sensor.gateway.name} · ${sensor.gateway.gatewayId}`
                  : "Unassigned"}
              </Text>

              <Text size="sm">
                Suggested: {suggestedGateway
                  ? `${suggestedGateway.name} · ${suggestedGateway.gatewayId} · ${suggestedGateway.location?.name ?? "[No location]"}`
                  : suggestion?.gatewayId ?? "No recommendation"}
              </Text>

              <Select
                label="Gateway"
                placeholder="Select a gateway"
                data={assignmentGatewayOptions}
                value={assignmentGatewayIdDraft}
                onChange={setAssignmentGatewayIdDraft}
                searchable
                clearable
                disabled={functionalGatewaysQuery.isLoading}
                nothingFoundMessage="No gateway found"
              />

              {functionalGatewaysQuery.isError && (
                <Alert color="red" title="Unable to load gateways">
                  {functionalGatewaysQuery.error instanceof Error
                    ? functionalGatewaysQuery.error.message
                    : "Unable to load gateways."}
                </Alert>
              )}

              {updateSensorAssignmentMutation.isError && (
                <Alert color="red" title="Unable to update sensor assignment">
                  {updateSensorAssignmentMutation.error instanceof Error
                    ? updateSensorAssignmentMutation.error.message
                    : "Update failed."}
                </Alert>
              )}

              <Text size="xs" c="dimmed">
                Saving changes the functional SensorSphere sensor/gateway assignment only. Gateway Coverage data is not modified.
              </Text>

              <Group justify="space-between">
                <Button
                  color="orange"
                  variant="light"
                  disabled={!sensor?.gateway}
                  loading={updateSensorAssignmentMutation.isPending}
                  onClick={() => {
                    if (!sensor) return;

                    updateSensorAssignmentMutation.mutate({
                      sensorId: sensor.id,
                      gatewayId: null
                    });
                  }}
                >
                  Unassign
                </Button>

                <Group gap="sm">
                  <Button
                    variant="default"
                    onClick={() => {
                      setAssignmentSensorUid(null);
                      setAssignmentGatewayIdDraft(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="blue"
                    loading={updateSensorAssignmentMutation.isPending}
                    disabled={
                      !sensor ||
                      !assignmentGatewayIdDraft ||
                      assignmentGatewayIdDraft === sensor.gateway?.id
                    }
                    onClick={() => {
                      if (!sensor || !assignmentGatewayIdDraft) return;

                      updateSensorAssignmentMutation.mutate({
                        sensorId: sensor.id,
                        gatewayId: assignmentGatewayIdDraft
                      });
                    }}
                  >
                    Assign
                  </Button>
                </Group>
              </Group>
            </Stack>
          );
        })()}
      </Modal>

      <Modal
        opened={sensorAction !== null}
        onClose={() => setSensorAction(null)}
        title={
          sensorAction?.type === "delete"
            ? "Delete sensor coverage"
            : "Reset sensor coverage"
        }
        centered
      >
        <Stack gap="md">
          <Text>
            {sensorAction?.type === "delete"
              ? `Delete all Gateway Coverage RSSI data for ${sensorAction.sensorUid}? The SensorSphere sensor itself will not be deleted.`
              : `Reset all Gateway Coverage RSSI samples for ${sensorAction?.sensorUid ?? "this sensor"}? The SensorSphere sensor itself will be kept.`}
          </Text>

          {(resetSensorMutation.isError || deleteSensorMutation.isError) && (
            <Alert color="red" title="Sensor coverage operation failed">
              {(() => {
                const error =
                  resetSensorMutation.error
                  ?? deleteSensorMutation.error;

                return error instanceof Error
                  ? error.message
                  : "Operation failed.";
              })()}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setSensorAction(null)}
            >
              Cancel
            </Button>
            <Button
              color={sensorAction?.type === "delete" ? "red" : "orange"}
              loading={
                resetSensorMutation.isPending ||
                deleteSensorMutation.isPending
              }
              onClick={() => {
                if (!sensorAction) return;

                if (sensorAction.type === "delete") {
                  deleteSensorMutation.mutate(sensorAction.sensorUid);
                } else {
                  resetSensorMutation.mutate(sensorAction.sensorUid);
                }
              }}
            >
              {sensorAction?.type === "delete"
                ? "Delete sensor coverage"
                : "Reset sensor data"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={locationGatewayId !== null}
        onClose={() => {
          setLocationGatewayId(null);
          setLocationIdDraft(null);
        }}
        title="BLE gateway location"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {locationGatewayId}
          </Text>

          <Select
            label="Location"
            placeholder="Select a location"
            data={locationOptions}
            value={locationIdDraft}
            onChange={setLocationIdDraft}
            clearable
            searchable
            disabled={locationsQuery.isLoading}
            nothingFoundMessage="No location found"
          />

          {locationsQuery.isError && (
            <Alert color="red" title="Unable to load locations">
              {locationsQuery.error instanceof Error
                ? locationsQuery.error.message
                : "Unable to load locations."}
            </Alert>
          )}

          {updateGatewayLocationMutation.isError && (
            <Alert color="red" title="Unable to update gateway location">
              {updateGatewayLocationMutation.error instanceof Error
                ? updateGatewayLocationMutation.error.message
                : "Update failed."}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setLocationGatewayId(null);
                setLocationIdDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="green"
              loading={updateGatewayLocationMutation.isPending}
              disabled={
                !locationGatewayId ||
                locationsQuery.isLoading ||
                locationsQuery.isError
              }
              onClick={() => {
                if (!locationGatewayId) return;

                updateGatewayLocationMutation.mutate({
                  gatewayId: locationGatewayId,
                  locationId: locationIdDraft
                });
              }}
            >
              Save location
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={gatewayAction !== null}
        onClose={() => setGatewayAction(null)}
        title={
          gatewayAction?.type === "delete"
            ? "Delete BLE gateway"
            : "Reset BLE gateway coverage"
        }
        centered
      >
        <Stack gap="md">
          <Text>
            {gatewayAction?.type === "delete"
              ? `Delete ${gatewayAction.gatewayId} and all of its coverage data?`
              : `Reset all sensor RSSI samples for ${gatewayAction?.gatewayId ?? "this gateway"}? The gateway itself and its board/MAC/WiFi information will be kept.`}
          </Text>

          {(resetGatewayMutation.isError || deleteGatewayMutation.isError) && (
            <Alert color="red" title="Gateway operation failed">
              {(() => {
                const error =
                  resetGatewayMutation.error
                  ?? deleteGatewayMutation.error;

                return error instanceof Error
                  ? error.message
                  : "Operation failed.";
              })()}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setGatewayAction(null)}
            >
              Cancel
            </Button>
            <Button
              color={gatewayAction?.type === "delete" ? "red" : "orange"}
              loading={
                resetGatewayMutation.isPending ||
                deleteGatewayMutation.isPending
              }
              onClick={() => {
                if (!gatewayAction) return;

                if (gatewayAction.type === "delete") {
                  deleteGatewayMutation.mutate(gatewayAction.gatewayId);
                } else {
                  resetGatewayMutation.mutate(gatewayAction.gatewayId);
                }
              }}
            >
              {gatewayAction?.type === "delete" ? "Delete gateway" : "Reset sensor data"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={resetOpened}
        onClose={
          () => setResetOpened(false)
        }
        title="Reset gateway coverage"
        centered
      >
        <Stack gap="md">
          <Text>
            Reset coverage for all BLE gateways? All sensor RSSI
            samples will be deleted, while each gateway and its
            board/MAC/WiFi information will be kept.
          </Text>

          {resetMutation.isError && (
            <Alert
              color="red"
              title="Unable to reset coverage data"
            >
              {
                resetMutation.error
                  instanceof Error
                    ? resetMutation.error.message
                    : "Reset failed."
              }
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                () => setResetOpened(false)
              }
            >
              Cancel
            </Button>

            <Button
              color="orange"
              loading={resetMutation.isPending}
              onClick={
                () => resetMutation.mutate()
              }
            >
              Reset all gateways
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteAllOpened}
        onClose={
          () => setDeleteAllOpened(false)
        }
        title="Delete all BLE gateways"
        centered
      >
        <Stack gap="md">
          <Text>
            Delete all BLE gateways and all associated coverage data?
            This removes gateway metadata and every recorded sensor RSSI
            sample. This cannot be undone.
          </Text>

          {deleteAllMutation.isError && (
            <Alert
              color="red"
              title="Unable to delete BLE gateways"
            >
              {
                deleteAllMutation.error
                  instanceof Error
                    ? deleteAllMutation.error.message
                    : "Delete failed."
              }
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={
                () => setDeleteAllOpened(false)
              }
            >
              Cancel
            </Button>

            <Button
              color="red"
              loading={deleteAllMutation.isPending}
              onClick={
                () => deleteAllMutation.mutate()
              }
            >
              Delete all gateways
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
