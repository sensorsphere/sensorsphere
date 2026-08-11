# SensorSphere v0.1 Release Plan

## Goal

SensorSphere v0.1 provides a stable first product slice for organizing physical
assets and visualizing IoT telemetry independently of acquisition protocol.

The release must demonstrate this flow:

```text
Location
  -> Asset
    -> Metric
      -> Observation
        -> History
          -> Visualization
```

## Release Scope

### 1. Inventory Foundation

Required:

- hierarchical locations;
- location CRUD;
- assets;
- asset-to-location assignment;
- metrics associated with assets.

Exit criteria:

- a user can create a physical hierarchy;
- assets can be attached to locations;
- the hierarchy can be retrieved through the API.

### 2. Telemetry Foundation

Required:

- normalized observation model;
- latest observation retrieval;
- observation history;
- BLE ingestion;
- MQTT ingestion.

Exit criteria:

- different acquisition protocols produce the same normalized observation
  model;
- protocol details do not leak into inventory domain APIs.

### 3. Time-Series Experience

Required:

- historical query by asset or metric;
- configurable time range;
- basic aggregation;
- simple time-series visualization.

Exit criteria:

- a user can select an asset and inspect metric history for a chosen period.

### 4. Basic Dashboard

Required:

- location navigation;
- asset list;
- latest values;
- at least one configurable historical chart.

Exit criteria:

- the main SensorSphere workflow can be demonstrated from the frontend without
  direct database access.

## Engineering Requirements

v0.1 is not complete unless:

- Docker builds are reproducible;
- database migrations are tracked and validated;
- critical API paths have integration tests;
- repository documentation is written in English;
- no known destructive migration is required for normal upgrade;
- API health and SensorSphere Doctor are green.

## Explicitly Out of Scope

The following are not required for v0.1:

- AI and natural-language interaction;
- forecasting;
- multi-tenancy;
- enterprise authentication;
- advanced role-based authorization;
- complex reporting;
- plugin marketplace;
- mobile applications.

## Current Progress

### Locations

- [x] List
- [x] Tree
- [x] Get by ID
- [x] Create
- [x] Move
- [ ] Update
- [ ] Delete

### Assets

- [ ] Location-aware asset model
- [ ] CRUD completion
- [ ] Location assignment

### Telemetry

- [ ] Normalized observation contract
- [ ] Latest values
- [ ] History
- [ ] BLE adapter
- [ ] MQTT adapter

### Frontend

- [ ] Location tree
- [ ] Asset navigation
- [ ] Historical chart
- [ ] Basic dashboard

## Release Principle

SensorSphere v0.1 prioritizes a small, coherent, demonstrable product over a
large collection of partially implemented capabilities.
