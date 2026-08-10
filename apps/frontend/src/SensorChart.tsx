import ReactECharts from "echarts-for-react";

import type {
  Measurement
} from "./types";

interface Props {
  measurements: Measurement[];
}

export function SensorChart({
  measurements
}: Props) {

  const option = {

    tooltip: {
      trigger: "axis"
    },

    legend: {
      data: [
        "Température",
        "Humidité"
      ]
    },

    xAxis: {
      type: "time"
    },

    yAxis: [
      {
        type: "value",
        name: "°C"
      },
      {
        type: "value",
        name: "%",
        position: "right"
      }
    ],

    series: [
      {
        name: "Température",
        type: "line",
        smooth: true,
        showSymbol: false,

        data:
          measurements
            .filter(
              m =>
                m.temperature !== null
            )
            .map(
              m => [
                m.time,
                m.temperature
              ]
            )
      },

      {
        name: "Humidité",
        type: "line",
        smooth: true,
        showSymbol: false,
        yAxisIndex: 1,

        data:
          measurements
            .filter(
              m =>
                m.humidity !== null
            )
            .map(
              m => [
                m.time,
                m.humidity
              ]
            )
      }
    ]
  };

  return (
    <ReactECharts
      option={option}
      style={{
        height: 420
      }}
    />
  );
}