import React from "react";
import ReactDOM from "react-dom/client";

import {
  AppShell,
  Button,
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
  getLatestMeasurements
} from "./api";

import {
  SensorCard
} from "./SensorCard";

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

  const latestQuery =
    useQuery({
      queryKey: ["latest"],
      queryFn:
        getLatestMeasurements,
      refetchInterval: 30_000
    });

  React.useEffect(() => {

    if (
      !selectedSensor &&
      latestQuery.data?.length
    ) {
      setSelectedSensor(
        latestQuery.data[0].sensorUid
      );
    }

  }, [
    latestQuery.data,
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
        Boolean(selectedSensor),

      refetchInterval:
        60_000
    });

  if (latestQuery.isLoading) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (latestQuery.isError) {
    return (
      <Container py="xl">
        <Text c="red">
          Impossible de charger
          les capteurs.
        </Text>
      </Container>
    );
  }

  const latest =
    latestQuery.data ?? [];

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
              Dashboard capteurs
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
                Dernières mesures
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
                  Historique
                </Title>

                <SegmentedControl
                  value={String(hours)}
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
                      label: "7 jours",
                      value: "168"
                    },
                    {
                      label: "30 jours",
                      value: "720"
                    }
                  ]}
                />

              </Group>


              <SegmentedControl
                mb="md"

                value={
                  selectedSensor
                }

                onChange={
                  setSelectedSensor
                }

                data={
                  latest.map(
                    sensor => ({
                      label:
                        sensor.sensorUid,

                      value:
                        sensor.sensorUid
                    })
                  )
                }
              />


              {historyQuery.isLoading
                ? <Loader />

                : (
                  <SensorChart
                    measurements={
                      historyQuery.data ?? []
                    }
                  />
                )}

            </div>

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