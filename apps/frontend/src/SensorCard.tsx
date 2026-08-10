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
        {measurement.sensor_uid}
      </Title>

      <Text
        size="xs"
        c="dimmed"
        mb="md"
      >
        Dernière mesure :
        {" "}
        {new Date(
          measurement.time
        ).toLocaleString()}
      </Text>

      <SimpleGrid cols={2}>

        <div>
          <Text c="dimmed" size="sm">
            Température
          </Text>

          <Text size="xl" fw={600}>
            {measurement.temperature ?? "-"} °C
          </Text>
        </div>

        <div>
          <Text c="dimmed" size="sm">
            Humidité
          </Text>

          <Text size="xl" fw={600}>
            {measurement.humidity ?? "-"} %
          </Text>
        </div>

        <div>
          <Text c="dimmed" size="sm">
            Batterie
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