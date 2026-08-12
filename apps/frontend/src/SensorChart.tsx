import ReactECharts from "echarts-for-react";

import type {
  ObservationAggregatePoint,
  ObservationHistoryPoint
} from "./types";

interface Props {
  hours: number;

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
  temperature,
  humidity,
  temperatureAggregates = [],
  humidityAggregates = []
}: Props) {

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
    new Date();

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const option = {

    tooltip: {
      trigger: "axis"
    },

    legend: {
      data: [
        "Temperature",
        "Humidity"
      ]
    },

    xAxis: {
      type: "time",
      min:
        from.getTime(),
      max:
        to.getTime()
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
      option={option}
      style={{
        height: 420
      }}
    />
  );
}