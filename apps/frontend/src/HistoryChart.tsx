import ReactECharts from "echarts-for-react";

import {
  useComputedColorScheme
} from "@mantine/core";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

export type HistoryYAxisMode =
  | "auto"
  | "fixed";

export interface HistoryYAxisConfig {
  mode: HistoryYAxisMode;
  min?: number;
  max?: number;
}

export interface HistoryYAxisBounds {
  min: number;
  max: number;
}

export interface HistoryChartSeries {
  id: string;
  name: string;
  unit: string | null;
  color: string;
  history: ObservationHistoryPoint[];
  aggregates: ObservationAggregatePoint[];
}

interface Props {
  hours: number;
  series: HistoryChartSeries[];
  yAxes?: Record<string, HistoryYAxisConfig>;
}

function rawSeries(
  observations: ObservationHistoryPoint[]
) {
  return observations
    .filter(
      observation =>
        typeof observation.value === "number"
    )
    .map(
      observation => [
        observation.time,
        observation.value
      ]
    );
}

function aggregateSeries(
  observations: ObservationAggregatePoint[]
) {
  return observations
    .filter(
      observation =>
        observation.avg !== null
    )
    .map(
      observation => [
        observation.bucketStart,
        observation.avg
      ]
    );
}

export function historyYAxisKey(
  unit: string | null
): string {
  return unit ?? "Value";
}

function numericSeriesValues(
  item: HistoryChartSeries
): number[] {
  return item.aggregates.length > 0
    ? item.aggregates
        .filter(
          point =>
            point.avg !== null &&
            Number.isFinite(point.avg)
        )
        .map(point => point.avg as number)
    : item.history
        .filter(
          point =>
            typeof point.value === "number" &&
            Number.isFinite(point.value)
        )
        .map(point => point.value as number);
}

function niceStep(
  span: number
): number {
  if (
    !Number.isFinite(span) ||
    span <= 0
  ) {
    return 1;
  }

  const roughStep =
    span / 6;

  const magnitude =
    10 ** Math.floor(
      Math.log10(roughStep)
    );

  const normalized =
    roughStep / magnitude;

  const niceNormalized =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;

  return niceNormalized * magnitude;
}

function autoBounds(
  values: number[]
): HistoryYAxisBounds | null {
  if (values.length === 0) {
    return null;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const center =
    (minimum + maximum) / 2;
  const dataSpan =
    maximum - minimum;

  const minimumSpan =
    Math.max(
      Math.abs(center) * 0.05,
      0.1
    );

  const paddedSpan =
    Math.max(
      dataSpan * 1.2,
      minimumSpan
    );

  const rawMinimum =
    center - paddedSpan / 2;
  const rawMaximum =
    center + paddedSpan / 2;
  const step =
    niceStep(paddedSpan);

  let axisMinimum =
    Math.floor(
      rawMinimum / step
    ) * step;

  let axisMaximum =
    Math.ceil(
      rawMaximum / step
    ) * step;

  if (axisMinimum === axisMaximum) {
    axisMinimum -= step;
    axisMaximum += step;
  }

  const precision =
    Math.max(
      0,
      -Math.floor(
        Math.log10(step)
      ) + 2
    );

  axisMinimum = Number(
    axisMinimum.toFixed(precision)
  );

  axisMaximum = Number(
    axisMaximum.toFixed(precision)
  );

  return {
    min: axisMinimum,
    max: axisMaximum
  };
}

export function computeHistoryYAxisBounds(
  series: HistoryChartSeries[]
): Record<string, HistoryYAxisBounds> {
  const valuesByAxis =
    new Map<string, number[]>();

  series.forEach(item => {
    const key =
      historyYAxisKey(item.unit);

    const existing =
      valuesByAxis.get(key) ?? [];

    existing.push(
      ...numericSeriesValues(item)
    );

    valuesByAxis.set(
      key,
      existing
    );
  });

  const bounds:
    Record<string, HistoryYAxisBounds> = {};

  valuesByAxis.forEach(
    (values, key) => {
      const current =
        autoBounds(values);

      if (current) {
        bounds[key] = current;
      }
    }
  );

  return bounds;
}

export function HistoryChart({
  hours,
  series,
  yAxes = {}
}: Props) {

  const colorScheme =
    useComputedColorScheme(
      "light",
      {
        getInitialValueInEffect:
          false
      }
    );

  const dark =
    colorScheme === "dark";

  const units =
    Array.from(
      new Set(
        series.map(
          item =>
            historyYAxisKey(item.unit)
        )
      )
    );

  const autoYAxisBounds =
    computeHistoryYAxisBounds(
      series
    );

  const to = new Date();
  const from = new Date(
    to.getTime() -
      hours * 60 * 60 * 1000
  );

  const option = {
    animation: false,
    backgroundColor: "transparent",

    tooltip: {
      trigger: "axis",
      backgroundColor:
        dark ? "#202328" : "#ffffff",
      borderColor:
        dark ? "#343940" : "#e3eaf4",
      textStyle: {
        color:
          dark ? "#f1f3f5" : "#202124"
      }
    },

    legend: {
      type: "scroll",
      top: 4,
      left: "center",
      right: 16,
      itemGap: 18,
      data:
        series.map(item => item.name),
      textStyle: {
        color:
          dark ? "#c9cdd2" : "#495057"
      }
    },

    grid: {
      left: 70,
      right:
        units.length > 1 ? 70 : 30,
      top: 58,
      bottom: 58,
      containLabel: true
    },

    xAxis: {
      type: "time",
      min: from.getTime(),
      max: to.getTime(),
      axisLabel: {
        color:
          dark ? "#aeb4bc" : "#6b7280"
      },
      axisLine: {
        lineStyle: {
          color:
            dark ? "#3a3f46" : "#dce3ec"
        }
      },
      splitLine: {
        lineStyle: {
          color:
            dark ? "#292d32" : "#edf1f6"
        }
      }
    },

    yAxis:
      units.map(
        (unit, index) => {
          const config =
            yAxes[unit];

          const fixedBoundsValid =
            config?.mode === "fixed" &&
            typeof config.min === "number" &&
            Number.isFinite(config.min) &&
            typeof config.max === "number" &&
            Number.isFinite(config.max) &&
            config.min < config.max;

          const bounds =
            fixedBoundsValid
              ? {
                  min: config.min,
                  max: config.max
                }
              : autoYAxisBounds[unit];

          return {
            type: "value",
            name: unit,
            position:
              index === 0 ? "left" : "right",
            offset:
              index <= 1
                ? 0
                : (index - 1) * 55,
            min:
              bounds?.min,
            max:
              bounds?.max,
            axisLabel: {
              color:
                dark ? "#aeb4bc" : "#6b7280"
            },
            nameTextStyle: {
              color:
                dark ? "#aeb4bc" : "#6b7280"
            },
            splitLine: {
              show: index === 0,
              lineStyle: {
                color:
                  dark ? "#292d32" : "#edf1f6"
              }
            }
          };
        }
      ),

    series:
      series.map(item => ({
        id: item.id,
        name: item.name,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2.5,
          color: item.color
        },
        itemStyle: {
          color: item.color
        },
        yAxisIndex:
          Math.max(
            0,
            units.indexOf(
              historyYAxisKey(
                item.unit
              )
            )
          ),
        data:
          item.aggregates.length > 0
            ? aggregateSeries(
                item.aggregates
              )
            : rawSeries(
                item.history
              )
      }))
  };

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{
        height: 390
      }}
    />
  );
}
