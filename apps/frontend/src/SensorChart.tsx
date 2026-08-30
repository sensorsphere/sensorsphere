import ReactECharts from "echarts-for-react";

import {
  useComputedColorScheme
} from "@mantine/core";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

interface Props {
  hours: number;
  toTimestamp: number;

  temperature:
    ObservationHistoryPoint[];
  humidity:
    ObservationHistoryPoint[];

  temperatureAggregates?:
    ObservationAggregatePoint[];

  humidityAggregates?:
    ObservationAggregatePoint[];
}

function rawSeries(
  observations:
    ObservationHistoryPoint[]
) {

  return observations
    .filter(
      observation =>
        typeof observation.value ===
        "number"
    )
    .map(
      observation => [
        observation.time,
        observation.value
      ]
    );
}

function aggregateSeries(
  observations:
    ObservationAggregatePoint[]
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

export function SensorChart({
  hours,
  toTimestamp,
  temperature,
  humidity,
  temperatureAggregates = [],
  humidityAggregates = []
}: Props) {

  const colorScheme =
    useComputedColorScheme("light");

  const dark =
    colorScheme === "dark";

  const temperatureData =
    temperatureAggregates.length > 0
      ? aggregateSeries(
          temperatureAggregates
        )
      : rawSeries(
          temperature
        );

  const humidityData =
    humidityAggregates.length > 0
      ? aggregateSeries(
          humidityAggregates
        )
      : rawSeries(
          humidity
        );

  const to =
    new Date(toTimestamp);

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const option = {

    tooltip: {
      trigger: "axis",
      backgroundColor: dark ? "#202328" : "#ffffff",
      borderColor: dark ? "#343940" : "#e3eaf4",
      textStyle: {
        color: dark ? "#f1f3f5" : "#202124"
      }
    },

    legend: {
      data: [
        "Temperature",
        "Humidity"
      ],
      textStyle: {
        color: dark ? "#c9cdd2" : "#495057"
      }
    },

    xAxis: {
      type: "time",
      min:
        from.getTime(),
      max:
        to.getTime(),
      axisLabel: {
        color: dark ? "#aeb4bc" : "#6b7280"
      },
      splitLine: {
        lineStyle: {
          color: dark ? "#292d32" : "#edf1f6"
        }
      }
    },

    yAxis: [
      {
        type: "value",
        name: "°C",
        axisLabel: { color: dark ? "#aeb4bc" : "#6b7280" },
        nameTextStyle: { color: dark ? "#aeb4bc" : "#6b7280" },
        splitLine: {
          lineStyle: { color: dark ? "#292d32" : "#edf1f6" }
        }
      },
      {
        type: "value",
        name: "%",
        position: "right",
        axisLabel: { color: dark ? "#aeb4bc" : "#6b7280" },
        nameTextStyle: { color: dark ? "#aeb4bc" : "#6b7280" },
        splitLine: { show: false }
      }
    ],

    series: [
      {
        name: "Temperature",
        type: "line",
        smooth: true,
        showSymbol: false,
        data:
          temperatureData
      },

      {
        name: "Humidity",
        type: "line",
        smooth: true,
        showSymbol: false,
        yAxisIndex: 1,
        data:
          humidityData
      }
    ]
  };

  return (
    <ReactECharts
      key={colorScheme}
      option={option}
      style={{
        height: 420
      }}
    />
  );
}