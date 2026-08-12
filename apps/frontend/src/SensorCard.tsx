import {
  Card,
  Group,
  SimpleGrid,
  Text,
  Title
} from "@mantine/core";

import type { Measurement } from "./types";

interface Props {
  measurement: Measurement;
}

export function SensorCard({
  measurement
}: Props) {

  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
    >

      <Title order={3}>
        {measurement.sensorName ??
          measurement.sensorUid}
      </Title>

      {measurement.sensorName && (
        <Text
          size="xs"
          c="dimmed"
        >
          Sensor UID: {measurement.sensorUid}
        </Text>
      )}

      <Text
        size="xs"
        c="dimmed"
        mb="md"
      >
        Last measurement:
        {" "}
        {new Date(
          measurement.time
        ).toLocaleString()}
      </Text>

      <SimpleGrid cols={2}>

        <div>
          <Text c="dimmed" size="sm">
            Temperature
          </Text>

          <Text size="xl" fw={600}>
            {measurement.temperature ?? "-"} °C
          </Text>
        </div>

        <div>
          <Text c="dimmed" size="sm">
            Humidity
          </Text>

          <Text size="xl" fw={600}>
            {measurement.humidity ?? "-"} %
          </Text>
        </div>

        <div>
          <Text c="dimmed" size="sm">
            Battery
          </Text>

          <Text size="lg">
            {measurement.battery ?? "-"} %
          </Text>
        </div>

        <div>
          <Text c="dimmed" size="sm">
            RSSI
          </Text>

          <Text size="lg">
            {measurement.rssi ?? "-"} dBm
          </Text>
        </div>

      </SimpleGrid>

    </Card>
  );
}