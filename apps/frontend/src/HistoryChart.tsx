import ReactECharts from "echarts-for-react";

import {
  useComputedColorScheme
} from "@mantine/core";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

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

export function HistoryChart({
  hours,
  series
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
          item => item.unit ?? "Value"
        )
      )
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
        (unit, index) => ({
          type: "value",
          name: unit,
          position:
            index === 0 ? "left" : "right",
          offset:
            index <= 1
              ? 0
              : (index - 1) * 55,
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
        })
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
              item.unit ?? "Value"
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
