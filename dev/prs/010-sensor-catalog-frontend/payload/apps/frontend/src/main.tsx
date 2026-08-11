import React from "react";
import ReactDOM from "react-dom/client";

import {
  AppShell,
  Container,
  Group,
  Loader,
  MantineProvider,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";

import "@mantine/core/styles.css";

import {
  QueryClient,
  QueryClientProvider,
  useQuery
} from "@tanstack/react-query";

import {
  getHistory,
  getLatestMeasurements,
  getSensors
} from "./api";

import {
  SensorCard
} from "./SensorCard";

import {
  SensorCatalog
} from "./SensorCatalog";

import {
  SensorChart
} from "./SensorChart";

import "./styles.css";

const queryClient =
  new QueryClient();

function Dashboard() {

  const [
    selectedSensor,
    setSelectedSensor
  ] =
    React.useState<string>("");

  const [
    hours,
    setHours
  ] =
    React.useState(24);

  const sensorsQuery =
    useQuery({
      queryKey:
        ["sensors"],

      queryFn:
        getSensors,

      refetchInterval:
        30_000
    });

  const latestQuery =
    useQuery({
      queryKey:
        ["latest"],

      queryFn:
        getLatestMeasurements,

      refetchInterval:
        30_000
    });

  React.useEffect(() => {

    if (
      !selectedSensor &&
      sensorsQuery.data?.length
    ) {

      setSelectedSensor(
        sensorsQuery.data[0].uid
      );
    }

  }, [
    sensorsQuery.data,
    selectedSensor
  ]);

  const historyQuery =
    useQuery({
      queryKey: [
        "history",
        selectedSensor,
        hours
      ],

      queryFn:
        () =>
          getHistory(
            selectedSensor,
            hours
          ),

      enabled:
        Boolean(
          selectedSensor
        ),

      refetchInterval:
        60_000
    });

  if (
    latestQuery.isLoading ||
    sensorsQuery.isLoading
  ) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (
    latestQuery.isError ||
    sensorsQuery.isError
  ) {
    return (
      <Container py="xl">
        <Text c="red">
          Unable to load SensorSphere data.
        </Text>
      </Container>
    );
  }

  const latest =
    latestQuery.data ?? [];

  const sensors =
    sensorsQuery.data ?? [];

  return (
    <AppShell
      header={{
        height: 64
      }}
    >

      <AppShell.Header>

        <Container
          size="xl"
          h="100%"
        >

          <Group
            h="100%"
            justify="space-between"
          >

            <Title order={2}>
              SensorSphere
            </Title>

            <Text c="dimmed">
              Environmental monitoring
            </Text>

          </Group>

        </Container>

      </AppShell.Header>

      <AppShell.Main>

        <Container
          size="xl"
          py="xl"
        >

          <Stack gap="xl">

            <div>

              <Title
                order={2}
                mb="md"
              >
                Latest measurements
              </Title>

              <SimpleGrid
                cols={{
                  base: 1,
                  sm: 2
                }}
              >

                {latest.map(
                  measurement => (

                    <SensorCard
                      key={
                        measurement.sensorUid
                      }
                      measurement={
                        measurement
                      }
                    />

                  )
                )}

              </SimpleGrid>

            </div>

            <div>

              <Group
                justify="space-between"
                mb="md"
              >

                <Title order={2}>
                  History
                </Title>

                <SegmentedControl
                  value={
                    String(hours)
                  }

                  onChange={
                    value =>
                      setHours(
                        Number(value)
                      )
                  }

                  data={[
                    {
                      label: "24 h",
                      value: "24"
                    },
                    {
                      label: "7 days",
                      value: "168"
                    },
                    {
                      label: "30 days",
                      value: "720"
                    }
                  ]}
                />

              </Group>

              {sensors.length > 0 && (

                <SegmentedControl
                  mb="md"

                  value={
                    selectedSensor
                  }

                  onChange={
                    setSelectedSensor
                  }

                  data={
                    sensors.map(
                      sensor => ({
                        label:
                          sensor.name
                          ?? sensor.uid,

                        value:
                          sensor.uid
                      })
                    )
                  }
                />

              )}

              {historyQuery.isLoading
                ? <Loader />

                : (
                  <SensorChart
                    measurements={
                      historyQuery.data
                      ?? []
                    }
                  />
                )}

            </div>

            <SensorCatalog />

          </Stack>

        </Container>

      </AppShell.Main>

    </AppShell>
  );
}

ReactDOM
  .createRoot(
    document.getElementById(
      "root"
    )!
  )
  .render(
    <React.StrictMode>

      <MantineProvider>

        <QueryClientProvider
          client={queryClient}
        >

          <Dashboard />

        </QueryClientProvider>

      </MantineProvider>

    </React.StrictMode>
  );
