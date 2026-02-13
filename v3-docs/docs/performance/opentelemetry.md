---
title: OpenTelemetry
description: Observability in Meteor with OpenTelemetry - Introduction and Overview
---

# OpenTelemetry in Meteor

## Introduction

### What is OpenTelemetry?

OpenTelemetry (OTel) is a vendor-neutral, open-source observability framework for instrumenting, generating, collecting, and exporting telemetry data (traces, metrics, and logs). It has become the industry standard for observability, backed by the Cloud Native Computing Foundation (CNCF).

To be clear, it's like MontiAPM, DataDog, NewRelic, etc., but open-source and vendor-neutral. You can use OpenTelemetry to send your telemetry data to any backend that supports the OpenTelemetry protocol (OTLP), including commercial solutions or open-source backends.

### Why OpenTelemetry for Meteor?

Meteor philosophy is let the developer focus on building features rather than worrying about infrastructure. However, as applications grow in complexity, understanding their behavior becomes crucial. Observability helps developers gain insights into application performance, identify bottlenecks, and troubleshoot issues effectively.

For Meteor developers, OpenTelemetry provides a powerful way to understand what's happening inside your application—from tracking DDP method calls and publications to monitoring database queries and HTTP requests.

### The Observability Stack

In this tutorial, we'll set up the following components:

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Meteor App     │────▶│  OpenTelemetry       │────▶│  Tempo DB   │
│  (OTel SDK)     │     │  Collector           │     │  (Traces)   │
└─────────────────┘     └──────────────────────┘     └─────────────┘
   Collect metrics             Data hub                     ▲
                                   │ insert                 │ query
                                   │                        │
                                   ▼                        |
                        ┌─────────────────────┐         ┌─────────────────────┐
                        │  Prometheus DB      │◀─────── │  Grafana            │
                        │  (Metrics)          │ query   │  (Visualization)    │
                        └─────────────────────┘         └─────────────────────┘

```

**Components overview:**

| Component | Purpose | Port |
|-----------|---------|------|
| **OpenTelemetry Collector** | Receives, processes, and exports telemetry data | 4317 (gRPC), 4318 (HTTP) |
| **Tempo** | Distributed tracing backend for storing and querying traces | 3200 |
| **Prometheus** | Time-series database for metrics | 9090 |
| **Grafana** | Visualization and dashboards | 3000 |

### Data Flow

1. Your Meteor application sends telemetry data (traces and metrics) to the **OpenTelemetry Collector** using the OTLP protocol
2. The Collector processes the data (batching, adding attributes) and routes it to the appropriate backends
3. **Traces** are sent to Tempo for storage and querying
4. **Metrics** are exposed in Prometheus format and scraped by Prometheus
5. **Grafana** connects to both Tempo and Prometheus to provide unified visualization

## Prerequisites

Before we begin, make sure you have the following installed:

- **Docker** (version 20.10 or later)
- **Docker Compose** (version 2.0 or later)
- A Meteor application (we'll cover the app instrumentation in Part 2)

Verify your installation:

```bash
docker --version
docker compose version
```

## Quick Start

To quickly set up the observability infrastructure, you can use the provided [Docker Compose file](https://github.com/meteor/performance/blob/otel/otel/docker-compose.yaml) and [configuration files](https://github.com/meteor/performance/tree/otel/otel/infra) we have in our GitHub. This setup is intended for local development and testing.

Bring the `infra` folder and the `docker-compose.yaml` file to your Meteor project root folder. Then run:

```bash
docker compose up -d
```

Ensure all services are running by accessing:
- Grafana: `http://localhost:3000` (default user: `admin`, password: `admin`)
- Prometheus: `http://localhost:9090`
- Tempo: `http://localhost:3200/ready`

Below you can see the details about this infra setup in the [Infrastructure](./otel-infrastructure.md) section.

## Documentation Structure

This documentation is divided into the following sections:

1. **[Infrastructure Setup](./otel-infrastructure.md)** - Configure the observability stack (Collector, Tempo, Prometheus, Grafana)
2. **[Basic Instrumentation](./otel-instrumentation.md)** - Install and configure meteor-otel, enable automatic tracing
3. **[Advanced Features](./otel-advanced.md)** - Custom spans, events, and business metrics
