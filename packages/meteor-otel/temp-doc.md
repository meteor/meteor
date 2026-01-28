NOTE: This is a temporary documentation file for the "meteor-otel", the main ideia is dive it in many files later. The final destination for this file is the open telemetry section in the Meteor Performance docs

# Observability in Meteor with OpenTelemetry: Infrastructure Setup

## Index

// part 1
- [Observability in Meteor with OpenTelemetry: Infrastructure Setup](#observability-in-meteor-with-opentelemetry-infrastructure-setup)
  - [Introduction](#introduction)
    - [What is OpenTelemetry?](#what-is-opentelemetry)
    - [Why OpenTelemetry for Meteor?](#why-opentelemetry-for-meteor)
    - [The Observability Stack](#the-observability-stack)
    - [Data Flow](#data-flow)
  - [Prerequisites](#prerequisites)
  - [Short infra setup](#short-infra-setup)
// part 2
  - [Project Structure](#project-structure)
  - [Configuring the OpenTelemetry Collector](#configuring-the-opentelemetry-collector)
    - [Why Use a Collector?](#why-use-a-collector)
    - [Collector Architecture](#collector-architecture)
    - [The Configuration File](#the-configuration-file)
    - [Configuration Breakdown](#configuration-breakdown)
    - [Verifying the Collector](#verifying-the-collector)
  - [Configuring Tempo (Traces)](#configuring-tempo-traces)
    - [Why Tempo?](#why-tempo)
    - [The Configuration File](#the-configuration-file-1)
    - [Configuration Breakdown](#configuration-breakdown-1)
    - [The Trace Data Flow in Tempo](#the-trace-data-flow-in-tempo)
    - [Verifying Tempo](#verifying-tempo)
  - [Configuring Prometheus (Metrics)](#configuring-prometheus-metrics)
    - [Why Prometheus?](#why-prometheus)
    - [How Metrics Flow in Our Stack](#how-metrics-flow-in-our-stack)
    - [The Configuration File](#the-configuration-file-2)
    - [Configuration Breakdown](#configuration-breakdown-2)
    - [Prometheus Feature Flags](#prometheus-feature-flags)
    - [Understanding Exemplars](#understanding-exemplars)
    - [Adding More Scrape Targets](#adding-more-scrape-targets)
    - [Verifying Prometheus](#verifying-prometheus)
  - [Configuring Grafana (Visualization)](#configuring-grafana-visualization)
    - [Why Grafana?](#why-grafana)
    - [Grafana Provisioning](#grafana-provisioning)
    - [Datasources Configuration](#datasources-configuration)
    - [Datasources Breakdown](#datasources-breakdown)
    - [Dashboards Provisioning](#dashboards-provisioning)
    - [Grafana Environment Variables](#grafana-environment-variables)
    - [The Explore Traces Plugin](#the-explore-traces-plugin)
    - [Using Grafana](#using-grafana)
    - [Verifying Grafana](#verifying-grafana)
  - [Docker Compose: Putting It All Together](#docker-compose-putting-it-all-together)
    - [The Complete Docker Compose File](#the-complete-docker-compose-file)
    - [Understanding the Docker Compose File](#understanding-the-docker-compose-file)
    - [Starting the Stack](#starting-the-stack)
    - [Verifying the Stack](#verifying-the-stack)
    - [Troubleshooting](#troubleshooting)
    - [Next Steps](#next-steps)
// part 3
- [Part 2: Instrumenting Your Meteor Application with OpenTelemetry](#part-2-instrumenting-your-meteor-application-with-opentelemetry)
  - [Introduction](#introduction-1)
    - [What We Built So Far](#what-we-built-so-far)
    - [Introducing meteor-otel](#introducing-meteor-otel)
    - [What meteor-otel Provides](#what-meteor-otel-provides)
    - [Understanding the Instrumentation Flow](#understanding-the-instrumentation-flow)
    - [What You'll Learn in This Tutorial](#what-youll-learn-in-this-tutorial)
    - [Prerequisites](#prerequisites-1)
  - [Installation and Initial Configuration](#installation-and-initial-configuration)
    - [Installing the Package](#installing-the-package)
    - [Configuring Environment Variables](#configuring-environment-variables)
    - [Initializing OpenTelemetry](#initializing-opentelemetry)
    - [Understanding initOtel Options](#understanding-initotel-options)
    - [What Happens After initOtel()](#what-happens-after-initotel)
    - [Verifying the Connection](#verifying-the-connection)
    - [A Complete Minimal Example](#a-complete-minimal-example)
  - [Enabling Automatic Tracing for Methods](#enabling-automatic-tracing-for-methods)
    - [The `{ otel: true }` Option](#the-otel-true-option)
    - [What Gets Traced Automatically](#what-gets-traced-automatically)
    - [Span Attributes](#span-attributes)
    - [Example: Tracing Multiple Methods](#example-tracing-multiple-methods)
    - [Verifying Traces in Grafana](#verifying-traces-in-grafana)
    - [Error Handling in Traces](#error-handling-in-traces)
    - [What You Have Now](#what-you-have-now)
  - [Enabling Automatic Tracing for Publications](#enabling-automatic-tracing-for-publications)
  - [Enriching Spans with Events and Attributes](#enriching-spans-with-events-and-attributes)
    - [What is addEvent()?](#what-is-addevent)
    - [Using addEvent()](#using-addevent)
    - [addEvent() API](#addevent-api)
    - [Best Practices for Events](#best-practices-for-events)
    - [Event Naming Conventions](#event-naming-conventions)
    - [Viewing Events in Grafana](#viewing-events-in-grafana)
  - [Custom Spans with withSpan](#custom-spans-with-withspan)
    - [When to Use Custom Spans](#when-to-use-custom-spans)
    - [Using withSpan()](#using-withspan)
    - [withSpan() API](#withspan-api)
    - [Adding Attributes to Spans](#adding-attributes-to-spans)
    - [Error Handling](#error-handling)
    - [Nested Spans](#nested-spans)
    - [Synchronous Version: withSpanSync()](#synchronous-version-withspansync)
    - [Events vs Custom Spans: When to Use Each](#events-vs-custom-spans-when-to-use-each)
    - [Viewing Custom Spans in Grafana](#viewing-custom-spans-in-grafana)
  - [Custom Metrics with createMetricsRecorder](#custom-metrics-with-createmetricsrecorder)
    - [Why Custom Metrics?](#why-custom-metrics)
    - [Creating a Metrics Recorder](#creating-a-metrics-recorder)
    - [Metric Types](#metric-types)
    - [Complete Example: E-commerce Metrics](#complete-example-e-commerce-metrics)
    - [Metric Attributes Best Practices](#metric-attributes-best-practices)
    - [Querying Custom Metrics in Grafana](#querying-custom-metrics-in-grafana)
    - [API Reference](#api-reference)

## Introduction

### What is OpenTelemetry?

OpenTelemetry (OTel) is a vendor-neutral, open-source observability framework for instrumenting, generating, collecting, and exporting telemetry data (traces, metrics, and logs). It has become the industry standard for observability, backed by the Cloud Native Computing Foundation (CNCF).

To be clear, it's like MontiAPM, DataDog, NewRelic, etc., but open-source and vendor-neutral. You can use OpenTelemetry to send your telemetry data to any backend that supports the OpenTelemetry protocol (OTLP), including commercial solutions or open-source backends.

### Why OpenTelemetry for Meteor?

Meteor philosophi is let the developer focus on building features rather than worrying about infrastructure. However, as applications grow in complexity, understanding their behavior becomes crucial. Observability helps developers gain insights into application performance, identify bottlenecks, and troubleshoot issues effectively.

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

## Short infra setup

To quickly set up the observability infrastructure, you can use the provided [Docker Compose file](https://github.com/meteor/performance/blob/otel/otel/docker-compose.yaml) and [configuration files](https://github.com/meteor/performance/tree/otel/otel/infra) we have in our github. This setup is intended for local development and testing.

Bring the `infra` folder and the `docker-compose.yaml` file to your Meteor project root folder. Then run:

```bash
docker compose up -d
```

Ensure all services are running by accessing:
- Grafana: `http://localhost:3000` (default user: `admin`, password: `admin`)
- Prometheus: `http://localhost:9090`
- Tempo: `http://localhost:3200/ready`

Bellow you can se the details about this infra setup.

## Project Structure

Create the following directory structure for your infrastructure files:

```
your-meteor-project/
├── docker-compose.yaml
└── infra/
    ├── otel-collector-config.yml
    ├── prometheus.yaml
    ├── tempo.yaml
    └── grafana/
        └── provisioning/
            ├── datasources/
            │   └── datasources.yaml
            └── dashboards/
                └── dashboards.yml
```

Create the directories:

```bash
mkdir -p infra/grafana/provisioning/datasources
mkdir -p infra/grafana/provisioning/dashboards
```

## Configuring the OpenTelemetry Collector

The OpenTelemetry Collector is the heart of our observability pipeline. It acts as a vendor-agnostic proxy that receives telemetry data from your application, processes it, and exports it to various backends.

### Why Use a Collector?

You might wonder: "Why not send data directly from my app to Tempo and Prometheus?" Here's why the Collector is valuable:

- **Decoupling**: Your app doesn't need to know about the backends. Change backends without changing your app code.
- **Processing**: Apply transformations, filtering, and enrichment to your data.
- **Batching**: Efficiently batch data before sending to backends, reducing network overhead.
- **Reliability**: Buffer data during backend outages.
- **Multiple exports**: Send the same data to multiple destinations (e.g., both Tempo and a commercial APM).

### Collector Architecture

The Collector has four main components:

```
┌─────────────────────────────────────────────────────────────┐
│                   OpenTelemetry Collector                    │
│                                                             │
│  ┌───────────┐    ┌────────────┐    ┌───────────────────┐  │
│  │ Receivers │───▶│ Processors │───▶│     Exporters     │  │
│  └───────────┘    └────────────┘    └───────────────────┘  │
│       ▲                                      │              │
│       │                                      ▼              │
│   OTLP gRPC                          Prometheus, Tempo      │
│   OTLP HTTP                                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Extensions                          │  │
│  │                   (zpages, health)                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### The Configuration File

Create the file `infra/otel-collector-config.yml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  # Debug exporter - prints data to stdout (useful for development)
  debug:
    verbosity: detailed

  # Prometheus exporter - exposes metrics for Prometheus to scrape
  prometheus:
    endpoint: 0.0.0.0:8889
    send_timestamps: true

  # OTLP exporter to Tempo for traces
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

processors:
  # Batch processor - groups data for efficient export
  batch:

  # Attributes processor - add metadata to all telemetry
  attributes:
    actions:
      - action: insert
        key: env
        value: "${DEPLOY_ENV}"

extensions:
  # zpages - debugging endpoint for the collector itself
  zpages:
    endpoint: 0.0.0.0:55679

service:
  extensions: [zpages]
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo, debug]
```

### Configuration Breakdown

Let's understand each section:

#### Receivers

Receivers define how data enters the Collector. We configure the OTLP receiver with both gRPC and HTTP protocols:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317  # Standard OTLP gRPC port
      http:
        endpoint: 0.0.0.0:4318  # Standard OTLP HTTP port
```

- **gRPC (port 4317)**: More efficient, preferred for high-throughput scenarios
- **HTTP (port 4318)**: Easier to debug, works through proxies that don't support gRPC

Your Meteor application will send data to one of these endpoints.

#### Processors

Processors transform data as it flows through the Collector:

```yaml
processors:
  batch:

  attributes:
    actions:
      - action: insert
        key: env
        value: "${DEPLOY_ENV}"
```

- **batch**: Groups spans and metrics together before export, reducing the number of outgoing requests. Uses sensible defaults (200ms timeout, 8192 batch size).
- **attributes**: Adds the `env` attribute to all telemetry, useful for filtering by environment (dev, staging, production).

#### Exporters

Exporters send data to backends:

```yaml
exporters:
  debug:
    verbosity: detailed

  prometheus:
    endpoint: 0.0.0.0:8889
    send_timestamps: true

  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true
```

- **debug**: Prints telemetry to stdout. Invaluable during development. Remove in production.
- **prometheus**: Exposes metrics on port 8889 in Prometheus format. Prometheus will scrape this endpoint.
- **otlp/tempo**: Sends traces to Tempo using OTLP over gRPC. We use `insecure: true` because we're in a Docker network (no TLS needed).

> **Note**: The `/tempo` suffix in `otlp/tempo` is just a name to distinguish this exporter. You could have multiple OTLP exporters with different names like `otlp/jaeger`, `otlp/datadog`, etc.

#### Pipelines

Pipelines connect receivers, processors, and exporters:

```yaml
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo, debug]
```

Each pipeline handles a specific telemetry type:
- **metrics pipeline**: Receives OTLP metrics → batches and adds env attribute → exports to Prometheus
- **traces pipeline**: Receives OTLP traces → batches → exports to both Tempo and debug output

#### Extensions

Extensions provide additional capabilities:

```yaml
extensions:
  zpages:
    endpoint: 0.0.0.0:55679
```

The **zpages** extension provides debugging pages at `http://localhost:55679/debug/tracez` where you can see recent traces processed by the collector. This is useful for troubleshooting.

### Verifying the Collector

After starting the stack (we'll cover this later), you can verify the Collector is working:

1. **Check zpages**: Visit `http://localhost:55679/debug/tracez`
2. **Check metrics endpoint**: Visit `http://localhost:8889/metrics`
3. **View logs**: `docker compose logs opentelemetry-collector`

## Configuring Tempo (Traces)

Tempo is Grafana's open-source, high-scale distributed tracing backend. It's designed to be cost-effective and easy to operate, requiring only object storage to function. For local development, we'll use the local filesystem as storage.

### Why Tempo?

- **Cost-effective**: Stores traces in object storage (or local filesystem), no need for expensive indexing
- **Simple to operate**: Minimal configuration required
- **Grafana native**: Seamless integration with Grafana for visualization
- **TraceQL**: Powerful query language for searching traces
- **Metrics generation**: Can generate metrics from traces (RED metrics, service graphs)

### The Configuration File

Create the file `infra/tempo.yaml`:

```yaml
stream_over_http_enabled: true
server:
  http_listen_port: 3200
  log_level: info

query_frontend:
  search:
    duration_slo: 5s
    throughput_bytes_slo: 1.073741824e+09
  trace_by_id:
    duration_slo: 5s

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318

ingester:
  trace_idle_period: 10s
  max_block_bytes: 1_000_000
  max_block_duration: 5m

compactor:
  compaction:
    block_retention: 48h

metrics_generator:
  registry:
    external_labels:
      source: tempo
      environment: dev
  storage:
    path: /tmp/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true
  traces_storage:
    path: /tmp/tempo/generator/traces
  processor:
    local_blocks:
      filter_server_spans: false
      flush_to_storage: true

storage:
  trace:
    backend: local
    wal:
      path: /tmp/tempo/wal
    local:
      path: /tmp/tempo/blocks
    blocklist_poll: 5m

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics, local-blocks]
      generate_native_histograms: both
```

### Configuration Breakdown

#### Server Configuration

```yaml
stream_over_http_enabled: true
server:
  http_listen_port: 3200
  log_level: info
```

- **stream_over_http_enabled**: Enables streaming search results over HTTP, improving query performance for large result sets
- **http_listen_port**: The port where Tempo's HTTP API is available (used by Grafana)
- **log_level**: Set to `info` for development; use `warn` or `error` in production

#### Query Frontend

```yaml
query_frontend:
  search:
    duration_slo: 5s
    throughput_bytes_slo: 1.073741824e+09
  trace_by_id:
    duration_slo: 5s
```

The query frontend handles incoming queries and provides SLO (Service Level Objective) settings:
- **duration_slo**: Target duration for search queries (5 seconds)
- **throughput_bytes_slo**: Target throughput (~1GB/s)

#### Distributor (Receiving Traces)

```yaml
distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
```

The distributor receives traces. Note that Tempo can receive OTLP directly (without the Collector), but we route through the Collector for flexibility. In our setup, traces come from the Collector, not directly from the app.

#### Ingester

```yaml
ingester:
  trace_idle_period: 10s
  max_block_bytes: 1_000_000
  max_block_duration: 5m
```

The ingester batches incoming traces into blocks:
- **trace_idle_period**: How long to wait for a trace to be considered complete
- **max_block_bytes**: Maximum size of a block before flushing (1MB)
- **max_block_duration**: Maximum time to hold traces before flushing (5 minutes)

These settings are optimized for development. In production, you'd increase these values.

#### Compactor

```yaml
compactor:
  compaction:
    block_retention: 48h
```

The compactor merges small blocks and handles retention:
- **block_retention**: How long to keep trace data (48 hours for development)

#### Metrics Generator (The Magic)

This is one of Tempo's most powerful features—generating metrics from traces:

```yaml
metrics_generator:
  registry:
    external_labels:
      source: tempo
      environment: dev
  storage:
    path: /tmp/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true
  traces_storage:
    path: /tmp/tempo/generator/traces
  processor:
    local_blocks:
      filter_server_spans: false
      flush_to_storage: true
```

And the processors configuration:

```yaml
overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics, local-blocks]
      generate_native_histograms: both
```

**What does this do?**

1. **service-graphs**: Generates a graph of service dependencies based on trace data. This powers the "Service Graph" view in Grafana. //TODO: insert an image of the service graph in Grafana

2. **span-metrics**: Generates RED (Rate, Errors, Duration) metrics from spans:
   - `traces_spanmetrics_calls_total` - Request rate
   - `traces_spanmetrics_latency_bucket` - Latency histogram

3. **local-blocks**: Processes local trace blocks for metrics generation.

4. **remote_write**: Sends generated metrics to Prometheus automatically. This means you get metrics "for free" just from your traces!

5. **send_exemplars**: Links metrics to trace exemplars, allowing you to jump from a metric spike directly to example traces.

6. **generate_native_histograms**: Uses Prometheus native histograms for better performance and accuracy.

#### Storage

```yaml
storage:
  trace:
    backend: local
    wal:
      path: /tmp/tempo/wal
    local:
      path: /tmp/tempo/blocks
    blocklist_poll: 5m
```

For local development, we use filesystem storage:
- **backend**: `local` for filesystem (use `s3`, `gcs`, or `azure` in production)
- **wal**: Write-Ahead Log for durability
- **local.path**: Where trace blocks are stored
- **blocklist_poll**: How often to check for new blocks

### The Trace Data Flow in Tempo

```
Incoming Trace
      │
      ▼
┌─────────────┐
│ Distributor │ ─── Receives and validates traces
└─────────────┘
      │
      ▼
┌─────────────┐
│  Ingester   │ ─── Batches traces into blocks
└─────────────┘
      │
      ├──────────────────────────┐
      ▼                          ▼
┌─────────────┐          ┌──────────────────┐
│   Storage   │          │ Metrics Generator│
│  (blocks)   │          │  (RED metrics)   │
└─────────────┘          └──────────────────┘
      │                          │
      ▼                          ▼
┌─────────────┐          ┌──────────────────┐
│  Compactor  │          │   Prometheus     │
│ (retention) │          │  (remote_write)  │
└─────────────┘          └──────────────────┘
```

### Verifying Tempo

After starting the stack:

1. **Check Tempo status**: `curl http://localhost:3200/status`
2. **Check ready endpoint**: `curl http://localhost:3200/ready`
3. **View logs**: `docker compose logs tempo`

## Configuring Prometheus (Metrics)

Prometheus is the de-facto standard for metrics in the cloud-native ecosystem. It's a time-series database that collects metrics by scraping HTTP endpoints and stores them efficiently for querying.

### Why Prometheus?

Prometheus is the most popular open-source metrics solution, widely adopted for its reliability and powerful features:

- **Pull-based model**: Prometheus scrapes metrics from your services, making it easy to discover what's being monitored
- **Powerful query language**: PromQL allows complex queries and aggregations
- **Alerting**: Built-in alerting capabilities with Alertmanager integration
- **Ecosystem**: Huge ecosystem of exporters and integrations
- **Native histograms**: Recent versions support native histograms for better performance

### How Metrics Flow in Our Stack

In our setup, Prometheus receives metrics from two sources:

```
┌─────────────────┐                    ┌─────────────────┐
│  OTel Collector │───── scrape ──────▶│   Prometheus    │
│  (port 8889)    │                    │                 │
└─────────────────┘                    │                 │
                                       │   ┌──────────┐  │
┌─────────────────┐                    │   │  TSDB    │  │
│     Tempo       │── remote_write ───▶│   │ (storage)│  │
│ (metrics gen)   │                    │   └──────────┘  │
└─────────────────┘                    └─────────────────┘
```

1. **Scraping the OTel Collector**: Prometheus pulls metrics exposed by the Collector on port 8889
2. **Remote write from Tempo**: Tempo pushes generated metrics (RED metrics, service graphs) directly to Prometheus

### The Configuration File

Create the file `infra/prometheus.yaml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 2s
    static_configs:
      - targets: ['opentelemetry-collector:8889']

storage:
  tsdb:
    out_of_order_time_window: 30m
```

### Configuration Breakdown

#### Global Settings

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
```

- **scrape_interval**: Default interval for scraping targets (15 seconds). Individual jobs can override this.
- **evaluation_interval**: How often to evaluate recording and alerting rules.

#### Scrape Configs

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 2s
    static_configs:
      - targets: ['opentelemetry-collector:8889']
```

This defines what Prometheus should scrape:

- **job_name**: A label added to all metrics from this target. Useful for filtering in queries.
- **scrape_interval**: We use 2 seconds for the OTel Collector to get near real-time metrics during development. In production, 15-30 seconds is more appropriate.
- **targets**: The endpoint to scrape. We use the Docker service name `opentelemetry-collector` and the Prometheus exporter port `8889`.

#### Storage Configuration

```yaml
storage:
  tsdb:
    out_of_order_time_window: 30m
```

This is an important setting for our setup:

- **out_of_order_time_window**: Allows Prometheus to accept metrics that arrive out of order within a 30-minute window. This is crucial when receiving metrics via remote_write from Tempo, as they might arrive slightly out of order.

### Prometheus Feature Flags

In the Docker Compose file (which we'll create later), we enable several important feature flags:

```yaml
command:
  - --config.file=/etc/prometheus.yaml
  - --web.enable-remote-write-receiver
  - --enable-feature=otlp-write-receiver
  - --enable-feature=exemplar-storage
  - --enable-feature=native-histograms
```

Let's understand each flag:

| Flag | Purpose |
|------|---------|
| `--web.enable-remote-write-receiver` | Enables the `/api/v1/write` endpoint for receiving metrics via remote write (used by Tempo) |
| `--enable-feature=otlp-write-receiver` | Enables receiving metrics directly via OTLP (alternative to using the Collector) |
| `--enable-feature=exemplar-storage` | Stores exemplars that link metrics to traces |
| `--enable-feature=native-histograms` | Enables native histogram support for more efficient histogram storage |

### Understanding Exemplars

Exemplars are a powerful feature that connects metrics to traces. When you see a spike in latency, you can click on an exemplar to see an actual trace from that time period.

```
         Latency Metric
              │
    ┌─────────┴─────────┐
    │    ████████       │ ← spike in latency
    │    ████████ *     │ ← * = exemplar (link to trace)
    │ ██ ████████ ██    │
    └───────────────────┘
              │
              ▼
         Click exemplar
              │
              ▼
    ┌─────────────────────┐
    │  Trace ID: abc123   │
    │  Duration: 2.3s     │
    │  Service: meteor-app│
    └─────────────────────┘
```

This is enabled by:
1. Tempo sending exemplars with metrics (`send_exemplars: true`)
2. Prometheus storing them (`--enable-feature=exemplar-storage`)
3. Grafana displaying them in dashboards

### Adding More Scrape Targets

You can add more scrape targets as needed. For example, to monitor MongoDB:

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    scrape_interval: 2s
    static_configs:
      - targets: ['opentelemetry-collector:8889']
```

### Verifying Prometheus

After starting the stack:

1. **Access the UI**: Visit `http://localhost:9090`
2. **Check targets**: Go to Status → Targets to see if scraping is working
3. **Run a test query**: Try `up` in the query box to see all targets
4. **View logs**: `docker compose logs prometheus`

## Configuring Grafana (Visualization)

Grafana is the visualization layer of our observability stack. It connects to Prometheus and Tempo to provide dashboards, alerting, and exploration capabilities.

### Why Grafana?

- **Unified view**: Single pane of glass for metrics, traces, and logs
- **Powerful dashboards**: Rich visualization options with templating and variables
- **Explore mode**: Ad-hoc queries and trace exploration
- **Alerting**: Define alerts based on metrics
- **Provisioning**: Configure datasources and dashboards as code

### Grafana Provisioning

Instead of manually configuring Grafana through the UI, we'll use **provisioning** to automatically configure datasources and dashboards when Grafana starts. This makes our setup reproducible and version-controllable.

```
infra/grafana/provisioning/
├── datasources/
│   └── datasources.yaml    # Defines Prometheus and Tempo connections
└── dashboards/
    └── dashboards.yml      # Points to dashboard JSON files
```

### Datasources Configuration

Create the file `infra/grafana/provisioning/datasources/datasources.yaml`:

```yaml
apiVersion: 1

datasources:
  # Prometheus datasource for metrics
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    uid: prometheus
    editable: true
    jsonData:
      httpMethod: POST
      exemplarTraceIdDestinations:
        - name: traceID
          datasourceUid: tempo

  # Tempo datasource for traces
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    uid: tempo
    editable: true
    jsonData:
      httpMethod: GET
      tracesToLogsV2:
        datasourceUid: loki
        spanStartTimeShift: '-10m'
        spanEndTimeShift: '10m'
        filterByTraceID: true
        filterBySpanID: false
      tracesToMetrics:
        datasourceUid: prometheus
        spanStartTimeShift: '-10m'
        spanEndTimeShift: '10m'
      serviceMap:
        datasourceUid: prometheus
      nodeGraph:
        enabled: true
      traceQuery:
        timeShiftEnabled: true
        spanStartTimeShift: '-10m'
        spanEndTimeShift: '10m'
```

### Datasources Breakdown

#### Prometheus Datasource

```yaml
- name: Prometheus
  type: prometheus
  access: proxy
  url: http://prometheus:9090
  isDefault: true
  uid: prometheus
  jsonData:
    httpMethod: POST
    exemplarTraceIdDestinations:
      - name: traceID
        datasourceUid: tempo
```

Key settings:

- **access: proxy**: Grafana proxies requests to Prometheus (browser doesn't call Prometheus directly)
- **isDefault: true**: This is the default datasource for new panels
- **uid: prometheus**: A unique identifier used for referencing this datasource
- **exemplarTraceIdDestinations**: Configures the link from exemplars to Tempo traces. When you click an exemplar, it opens the trace in Tempo.

#### Tempo Datasource

```yaml
- name: Tempo
  type: tempo
  access: proxy
  url: http://tempo:3200
  uid: tempo
  jsonData:
    tracesToMetrics:
      datasourceUid: prometheus
    serviceMap:
      datasourceUid: prometheus
    nodeGraph:
      enabled: true
```

Key settings:

- **tracesToMetrics**: Links traces to related metrics in Prometheus. When viewing a trace, you can see corresponding metrics.
- **serviceMap**: Enables the service graph visualization using metrics from Prometheus (generated by Tempo's metrics_generator).
- **nodeGraph**: Enables the node graph visualization for traces.

### Dashboards Provisioning

Create the file `infra/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1

providers:
  - name: 'Default'
    folder: ''
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

This tells Grafana to load dashboard JSON files from the provisioning directory. You can add dashboard JSON files to this folder, and they'll be automatically imported on startup.

// TODO: add example dashboard JSON files for Meteor app monitoring

### Grafana Environment Variables

In the Docker Compose file, we configure Grafana with environment variables:

```yaml
environment:
  - GF_AUTH_ANONYMOUS_ENABLED=true
  - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
  - GF_AUTH_DISABLE_LOGIN_FORM=true
  - GF_INSTALL_PLUGINS=https://storage.googleapis.com/integration-artifacts/grafana-exploretraces-app/grafana-exploretraces-app-latest.zip;grafana-traces-app
```

| Variable | Purpose |
|----------|---------|
| `GF_AUTH_ANONYMOUS_ENABLED` | Allows access without login (for local development) |
| `GF_AUTH_ANONYMOUS_ORG_ROLE` | Anonymous users get Admin role (full access) |
| `GF_AUTH_DISABLE_LOGIN_FORM` | Hides the login form |
| `GF_INSTALL_PLUGINS` | Installs the Explore Traces plugin for better trace exploration |

> **Warning**: These settings are for local development only. In production, you should enable authentication!

### The Explore Traces Plugin

We install the `grafana-traces-app` plugin which provides an enhanced trace exploration experience:

- **Trace comparison**: Compare multiple traces side by side
- **Span filtering**: Filter spans by attributes, duration, or status
- **Improved visualization**: Better timeline and waterfall views

### Using Grafana

After starting the stack, access Grafana at `http://localhost:3000`. Here's what you can do:

#### 1. Explore Traces

1. Click **Explore** in the sidebar
2. Select **Tempo** as the datasource
3. Use TraceQL to search for traces:

```
{ resource.service.name = "meteor-app" }
```

Or search by duration:

```
{ duration > 500ms }
```

#### 2. View Service Graph

1. Go to **Explore**
2. Select **Tempo**
3. Click on **Service Graph** tab

This shows a visual map of your services and their dependencies, generated from trace data.

#### 3. Query Metrics

1. Go to **Explore**
2. Select **Prometheus**
3. Run PromQL queries:

```promql
# Request rate by service
sum(rate(traces_spanmetrics_calls_total[5m])) by (service)

# P95 latency
histogram_quantile(0.95, sum(rate(traces_spanmetrics_latency_bucket[5m])) by (le, service))
```

#### 4. Create Dashboards

1. Click **Dashboards** → **New** → **New Dashboard**
2. Add panels with metrics and traces
3. Save and share with your team

### Verifying Grafana

After starting the stack:

1. **Access the UI**: Visit `http://localhost:3000`
2. **Check datasources**: Go to Connections → Data sources
3. **Test Prometheus**: Click on Prometheus → Save & Test
4. **Test Tempo**: Click on Tempo → Save & Test
5. **View logs**: `docker compose logs grafana`

## Docker Compose: Putting It All Together

Now that we've configured each component individually, let's bring everything together with Docker Compose. This file orchestrates all the services and ensures they start in the correct order.

### The Complete Docker Compose File

Create `docker-compose.yaml` in your project root:

```yaml
version: "3.8"

services:
  # ============================================
  # OpenTelemetry Collector
  # The central hub for receiving and routing telemetry
  # ============================================
  opentelemetry-collector:
    image: otel/opentelemetry-collector-contrib:latest
    container_name: otel-collector
    command:
      - "--config=/etc/otel-collector-config.yml"
    volumes:
      - ./infra/otel-collector-config.yml:/etc/otel-collector-config.yml:ro
    ports:
      - "4317:4317"   # OTLP gRPC receiver
      - "4318:4318"   # OTLP HTTP receiver
      - "8888:8888"   # Prometheus metrics exposed by the Collector
      - "8889:8889"   # Prometheus exporter metrics
    environment:
      - DEPLOY_ENV=dev
    depends_on:
      - tempo
      - prometheus
    restart: unless-stopped

  # ============================================
  # Tempo
  # Distributed tracing backend
  # ============================================
  tempo:
    image: grafana/tempo:2.6.1
    container_name: tempo
    command:
      - "-config.file=/etc/tempo.yaml"
    volumes:
      - ./infra/tempo.yaml:/etc/tempo.yaml:ro
      - tempo-data:/tmp/tempo
    ports:
      - "3200:3200"   # Tempo HTTP API
      - "4319:4317"   # OTLP gRPC (internal, different host port to avoid conflict)
    depends_on:
      - prometheus
    restart: unless-stopped

  # ============================================
  # Prometheus
  # Metrics storage and querying
  # ============================================
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    command:
      - --config.file=/etc/prometheus.yaml
      - --web.enable-remote-write-receiver
      - --enable-feature=otlp-write-receiver
      - --enable-feature=exemplar-storage
      - --enable-feature=native-histograms
    volumes:
      - ./infra/prometheus.yaml:/etc/prometheus.yaml:ro
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  # ============================================
  # Grafana
  # Visualization and dashboards
  # ============================================
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_AUTH_DISABLE_LOGIN_FORM=true
      - GF_INSTALL_PLUGINS=https://storage.googleapis.com/integration-artifacts/grafana-exploretraces-app/grafana-exploretraces-app-latest.zip;grafana-traces-app
    depends_on:
      - prometheus
      - tempo
    restart: unless-stopped

volumes:
  tempo-data:
  prometheus-data:
  grafana-data:
```

### Understanding the Docker Compose File

#### Service Dependencies

The `depends_on` directive ensures services start in the correct order:

```
┌──────────────┐
│  Prometheus  │ ← Starts first (no dependencies)
└──────────────┘
       │
       ▼
┌──────────────┐
│    Tempo     │ ← Starts second (needs Prometheus for remote_write)
└──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│  OTel        │     │   Grafana    │ ← Start after Tempo & Prometheus
│  Collector   │     │              │
└──────────────┘     └──────────────┘
```

#### Port Mappings

Here's a quick reference of all exposed ports:

| Port | Service | Purpose |
|------|---------|---------|
| 3000 | Grafana | Web UI |
| 3200 | Tempo | HTTP API |
| 4317 | OTel Collector | OTLP gRPC receiver (your app connects here) |
| 4318 | OTel Collector | OTLP HTTP receiver |
| 8888 | OTel Collector | Collector's own metrics |
| 8889 | OTel Collector | Prometheus exporter |
| 9090 | Prometheus | Web UI and API |

#### Volumes

We use named volumes for data persistence:

```yaml
volumes:
  tempo-data:      # Trace data
  prometheus-data: # Metrics data
  grafana-data:    # Dashboards, settings
```

This ensures your data survives container restarts. To completely reset, run:

```bash
docker compose down -v
```

#### Read-Only Mounts

Notice the `:ro` suffix on configuration file mounts:

```yaml
volumes:
  - ./infra/otel-collector-config.yml:/etc/otel-collector-config.yml:ro
```

This makes the mount read-only, preventing the container from accidentally modifying your config files.

### Starting the Stack

Run the following commands to start the observability stack:

```bash
# Start all services in the background
docker compose up -d

# View logs from all services
docker compose logs -f

# View logs from a specific service
docker compose logs -f opentelemetry-collector
```

### Verifying the Stack

After starting, verify each component is running:

```bash
# Check all containers are running
docker compose ps

# Expected output:
# NAME              STATUS
# grafana           Up
# otel-collector    Up
# prometheus        Up
# tempo             Up
```

Then verify each service:

| Service | URL | What to Check |
|---------|-----|---------------|
| Grafana | http://localhost:3000 | UI loads, datasources configured |
| Prometheus | http://localhost:9090 | UI loads, targets are "UP" |
| Tempo | http://localhost:3200/ready | Returns "ready" |
| OTel Collector | http://localhost:8888/metrics | Returns metrics |


### Troubleshooting

#### Collector can't connect to Tempo

Check if Tempo is ready:

```bash
curl http://localhost:3200/ready
```

If not ready, check Tempo logs:

```bash
docker compose logs tempo
```

#### Prometheus not receiving metrics from Tempo

Verify remote_write is working:

1. Go to Prometheus UI → Status → TSDB Status
2. Check if there are recent samples

Also verify Tempo's metrics_generator is enabled:

```bash
docker compose logs tempo | grep metrics_generator
```

#### Grafana datasources not working

1. Go to Connections → Data sources
2. Click on each datasource → Save & Test
3. Check error messages

Common issues:
- Wrong URL (should use container names, not localhost)
- Service not ready yet (wait a few seconds)

### Next Steps

Congratulations! Your observability infrastructure is now running. In the next part of this tutorial, we'll:

1. Configure your Meteor application to send telemetry
2. Instrument Meteor methods and publications
3. Create custom spans for important operations
4. Build dashboards specific to Meteor applications

// TODO: Link to the next part of the tutorial: meteor app

# Part 2: Instrumenting Your Meteor Application with OpenTelemetry

In [Part 1](./01-observability-infrastructure.md), we set up the complete observability infrastructure: OpenTelemetry Collector, Tempo for traces, Prometheus for metrics, and Grafana for visualization. Now it's time to instrument your Meteor application to start generating telemetry data.

## Introduction

### What We Built So Far

In Part 1, we deployed an observability stack that's ready to receive telemetry:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Your Observability Stack                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │   Grafana   │────▶│    Tempo     │     │  Prometheus  │        │
│   │  :3000      │     │   (traces)   │     │  (metrics)   │        │
│   └─────────────┘     └──────────────┘     └──────────────┘        │
│          │                   ▲                    ▲                 │
│          │                   │                    │                 │
│          ▼                   │                    │                 │
│   ┌──────────────────────────┴────────────────────┘                │
│   │            OpenTelemetry Collector :4318                       │
│   └────────────────────────────▲───────────────────                │
│                                │                                    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    Waiting for telemetry data...
```

The infrastructure is listening on port `4318` (OTLP HTTP), ready to receive:
- **Traces** - Will be stored in Tempo
- **Metrics** - Will be stored in Prometheus
- **Logs** - Can be added later

But right now, nothing is sending data. Let's change that.

### Introducing meteor-otel

**meteor-otel** is a Meteor package that provides seamless OpenTelemetry integration for Meteor applications. It was designed with Meteor's unique architecture in mind, handling:

- **DDP Protocol**: Meteor's real-time data protocol doesn't use traditional HTTP requests, so standard Node.js instrumentation doesn't capture method calls or publications
- **Method and Publication Tracing**: Automatic instrumentation for Meteor.methods and Meteor.publish
- **MongoDB Integration**: Traces database operations as child spans

### What meteor-otel Provides

The package offers several levels of instrumentation:

| Feature | What It Does | When to Use |
|---------|--------------|-------------|
| `initOtel()` | Initializes OpenTelemetry, starts exporting **host metrics** (CPU, memory, event loop) | Always - this is the foundation |
| `{ otel: true }` | Enables **automatic tracing** for methods and publications | When you want to see method/publication traces |
| `withSpan()` | Creates **custom spans** within your code | When you need to trace specific operations |
| `addEvent()` | Adds **events** to the current span | When you want to mark important moments |
| `createMetricsRecorder()` | Creates **custom metrics** (counters, histograms, gauges) | When you need business metrics |
| `createRoundtripTracer()` | Traces **client-to-server roundtrips** | When debugging latency issues |

### Understanding the Instrumentation Flow

It's important to understand what each step enables:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Instrumentation Levels                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: initOtel()                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Host metrics (CPU, memory, event loop lag)                   │   │
│  │  ✅ Runtime metrics (GC, heap)                                   │   │
│  │  ✅ Connection to OTel Collector established                     │   │
│  │  ❌ No traces yet                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 2: { otel: true } on methods/publications                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Automatic traces for methods                                 │   │
│  │  ✅ Automatic traces for publications                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 3: Custom instrumentation (withSpan, addEvent, metrics)           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Custom spans for specific operations                         │   │
│  │  ✅ Events marking important moments                             │   │
│  │  ✅ Business metrics (counters, histograms, gauges)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What You'll Learn in This Tutorial

By the end of this tutorial, you'll know how to:

1. **Install and configure** the meteor-otel package
2. **Initialize OpenTelemetry** and see host metrics in Grafana
3. **Enable automatic tracing** for your methods and publications
4. **Enrich spans** with custom attributes and events
5. **Create custom spans** for specific operations
6. **Track client-to-server roundtrips** for latency debugging
7. **Create business metrics** like counters and histograms
8. **Visualize everything** in Grafana with Tempo and Prometheus

### Prerequisites

Before continuing, make sure you have:

- [ ] Completed [Part 1](./01-observability-infrastructure.md) (infrastructure running)
- [ ] A Meteor application (we'll use a simple example)
- [ ] Basic understanding of Meteor methods and publications
- [ ] Docker and Docker Compose installed

Let's start by installing the package and making that first connection to the collector.

---

## Installation and Initial Configuration

### Installing the Package

First, add the `meteor-otel` package to your Meteor application:

```bash
meteor add meteor-otel
```

This package includes all the necessary OpenTelemetry dependencies and auto-instrumentation for MongoDB operations.

### Configuring Environment Variables

Before initializing OpenTelemetry, you need to tell your application where to send telemetry data. Create or update your environment variables:

```bash
# Required: Where to send telemetry (your OTel Collector)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318" #default for local setup

# Optional but recommended: Service identification
export OTEL_SERVICE_NAME="my-meteor-app" #default for local setup
export OTEL_SERVICE_VERSION="1.0.0" #default for local setup
export DEPLOYMENT_ENV="development" #default for local setup
```

For development with Docker Compose, you can add these to your `docker-compose.yaml` or a `.env` file:

```yaml
# In docker-compose.yaml, under your Meteor app service:
environment:
  - OTEL_EXPORTER_OTLP_ENDPOINT=http://opentelemetry-collector:4318
  - OTEL_SERVICE_NAME=my-meteor-app
  - DEPLOYMENT_ENV=development
```

### Initializing OpenTelemetry

The most critical aspect of OpenTelemetry initialization is **timing**. The `initOtel()` function must be called **before any other imports** in your server's main file. This ensures that all auto-instrumentation (like MongoDB) is properly set up before those libraries are loaded.

Create or modify your `server/main.js`:

```javascript
// ⚠️ CRITICAL: Initialize OpenTelemetry FIRST, before any other imports
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

// Initialize OpenTelemetry
initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'my-meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.version': process.env.OTEL_SERVICE_VERSION || '1.0.0',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});

// NOW import everything else
import { Meteor } from 'meteor/meteor';
import { MyCollection } from '/imports/api/collections';
// ... other imports
```

### Understanding initOtel Options

The `initOtel()` function accepts a configuration object:

```javascript
initOtel({
  // Required: Identifies your service in traces and metrics
  serviceName: 'my-meteor-app',

  // Optional: Additional attributes attached to all telemetry
  resourceAttributes: {
    'deployment.environment': 'production',
    'service.version': '2.1.0',
    'service.instance.id': 'pod-abc123',
    'service.namespace': 'my-team',
    // Add any custom attributes you need
    'team.name': 'backend',
    'region': 'us-east-1',
  }
});
```

| Option | Type | Description |
|--------|------|-------------|
| `serviceName` | string | **Required**. Identifies your service in all telemetry data |
| `resourceAttributes` | object | Additional attributes attached to all spans and metrics |

Common resource attributes you might want to include:

| Attribute | Example | Purpose |
|-----------|---------|---------|
| `deployment.environment` | `production`, `staging`, `dev` | Filter telemetry by environment |
| `service.version` | `1.2.3` | Track which version generated the telemetry |
| `service.instance.id` | `pod-xyz-123` | Identify specific instances in scaled deployments |
| `service.namespace` | `checkout-team` | Group services by team or domain |

### What Happens After initOtel()

Once `initOtel()` is called, several things happen automatically:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    After calling initOtel()                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ Connection established to OTel Collector                        │
│                                                                     │
│  ✅ Host metrics start exporting:                                   │
│     • process.cpu.time                                              │
│     • process.memory.usage                                          │
│     • nodejs.eventloop.lag                                          │
│     • nodejs.gc.duration                                            │
│     • nodejs.heap.size                                              │
│                                                                    │                                                                │
│  ❌ No traces yet - methods and publications not instrumented       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

// TODO: add images

### Verifying the Connection

Start your Meteor application and check that telemetry is being received:

1. **Check the OTel Collector logs**:

```bash
docker compose logs -f opentelemetry-collector
```

You should see messages indicating metrics are being received.

2. **Check Prometheus for metrics**:

Open `http://localhost:9090` and query for your service's metrics:

```promql
# Check if host metrics are arriving
process_cpu_time_seconds_total{service_name="my-meteor-app"}

# Or search for any metric with your service name
{service_name="my-meteor-app"}
```

3. **Check Grafana**:

Open `http://localhost:3000`, go to **Explore**, select **Prometheus**, and run the same queries.

### A Complete Minimal Example

Here's a complete minimal `server/main.js` that initializes OpenTelemetry:

```javascript
// server/main.js

// Step 1: Initialize OTel FIRST
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.version': process.env.npm_package_version || '0.0.0',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});

// Step 2: Now import everything else
import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';

// Step 3: Define your methods and publications (no tracing yet)
Meteor.startup(async () => {
  console.log('Server started with OpenTelemetry initialized');

  // Publications
  Meteor.publish('links', function () {
    return LinksCollection.find();
  });

  // Methods
  Meteor.methods({
    'links.insert'(data) {
      return LinksCollection.insertAsync(data);
    },
    'links.remove'(id) {
      return LinksCollection.removeAsync(id);
    },
  });
});
```

At this point, you have:
- ✅ OpenTelemetry initialized
- ✅ Host metrics being exported to Prometheus
- ❌ **No traces yet** for methods and publications

In the next section, we'll enable automatic tracing for methods and publications using the `{ otel: true }` option.

---

## Enabling Automatic Tracing for Methods

Now that OpenTelemetry is initialized and sending metrics, let's enable automatic tracing for Meteor methods. This is where you'll start seeing traces in Grafana.

### The `{ otel: true }` Option

To enable tracing for methods, simply add `{ otel: true }` as the second argument to `Meteor.methods()`:

```javascript
// With tracing enabled
Meteor.methods({
  'links.insert'(data) {
    return LinksCollection.insertAsync(data);
  },
}, { otel: true });  // ← Add this!
```

That's it! With this single option, every method call will automatically:

1. **Create a span** with the method name (e.g., `meteor.method links.insert`)
2. **Record the duration** of the method execution
3. **Capture errors** if the method throws an exception

### What Gets Traced Automatically

When `{ otel: true }` is enabled, each method call generates a trace with the following structure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Trace: meteor.method links.insert                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Span: meteor.method links.insert                                │   │
│  │ Duration: 45ms                                                  │   │
│  │ Attributes:                                                     │   │
│  │   • meteor.method.name: "links.insert"                          │   │
│  │   • meteor.userId: "abc123" (if authenticated)                  │   │
│  │   • meteor.connection.id: "xyz789"                              │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │ Child Span: mongodb.insert                              │   │   │
│  │  │ Duration: 12ms                                          │   │   │
│  │  │ Attributes:                                             │   │   │
│  │  │   • db.system: "mongodb"                                │   │   │
│  │  │   • db.name: "meteor"                                   │   │   │
│  │  │   • db.mongodb.collection: "links"                      │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Span Attributes

The following attributes are automatically added to method spans:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `meteor.method.name` | The name of the method | `"links.insert"` |
| `meteor.userId` | The ID of the authenticated user (if any) | `"abc123"` |
| `meteor.connection.id` | The DDP connection ID | `"xyz789"` |
| `meteor.connection.clientAddress` | Client IP address | `"192.168.1.1"` |

### Example: Tracing Multiple Methods

Here's a complete example with multiple methods:

```javascript
// server/main.js

import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { LinksCollection } from '/imports/api/links';

Meteor.startup(async () => {
  // All methods in this block will be traced
  Meteor.methods({
    async 'links.insert'(data) {
      // ...
      return await LinksCollection.insertAsync({
        ...data,
        createdAt: new Date(),
        userId: this.userId,
      });
    },

    async 'links.update'(id, data) {
      // ...
      return await LinksCollection.updateAsync(id, { $set: data });
    },

    async 'links.remove'(id) {
      // ...
      return await LinksCollection.removeAsync(id);
    },

    async 'links.getStats'() {
      //...
      return { total, recent };
    },
  }, { otel: true });  // ← Enable tracing for all methods above
});
```

### Verifying Traces in Grafana

After enabling tracing, make some method calls from your client and then check Grafana:

1. **Open Grafana** at `http://localhost:3000`
2. Go to **Explore**
3. Select **Tempo** as the datasource
4. Use TraceQL to find your traces:

```
{ resource.service.name = "meteor-app" && name =~ "meteor.method.*" }
```

Or search for a specific method:

```
{ span.meteor.method.name = "links.insert" }
```

// TODO: add image of a trace in Grafana

### Error Handling in Traces

When a method throws an error, the span automatically:
- Sets status to `ERROR`
- Records the exception with stack trace
- Preserves the error message

```javascript
Meteor.methods({
  async 'links.insert'(data) {
    // If this throws, the span will capture the error
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    return await LinksCollection.insertAsync(data);
  },
}, { otel: true });
```

In Grafana, you can search for failed spans:

```
{ status = error }
```

//TODO: add image of error span in Grafana


### What You Have Now

After enabling `{ otel: true }` on your methods:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Current Instrumentation Status                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ OpenTelemetry initialized                                        │
│  ✅ Host metrics exported to Prometheus                              │
│  ✅ Method traces exported to Tempo                                  │
│  ❌ Publications not yet traced                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

In the next section, we'll enable the same automatic tracing for publications.

---

## Enabling Automatic Tracing for Publications

Just like methods, you can enable automatic tracing for Meteor publications. This is essential for understanding your real-time data flow and identifying slow queries.

### The `{ otel: true }` Option for Publications

Add `{ otel: true }` as the third argument to `Meteor.publish()`:

```javascript
// With tracing enabled
Meteor.publish('links', function () {
  return LinksCollection.find();
}, { otel: true });  // ← Add this!
```


## Enriching Spans with Events and Attributes

While automatic tracing captures the basic structure of your operations, you often need more context to understand what's happening inside a span. The `addEvent()` function allows you to add timestamped events and attributes to the current span.

### What is addEvent()?

Events are timestamped annotations within a span. They mark important moments during an operation without creating new spans. Think of them as "breadcrumbs" that help you understand the flow of execution.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Span: meteor.method orders.process                                      │
│ Duration: 850ms                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  0ms     ──●── Event: validation.start                                  │
│                  { orderId: "123" }                                     │
│                                                                         │
│  15ms    ──●── Event: validation.complete                               │
│                  { itemCount: 5 }                                       │
│                                                                         │
│  200ms   ──●── Event: payment.start                                     │
│                  { amount: 99.99, currency: "USD" }                     │
│                                                                         │
│  650ms   ──●── Event: payment.complete                                  │
│                  { transactionId: "tx_abc123" }                         │
│                                                                         │
│  850ms   ──●── Span ends                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Using addEvent()

Import `addEvent` from the package and call it within a traced method or publication:

```javascript
import { initOtel, addEvent } from 'meteor/meteor-otel';

// ... initOtel() ...

Meteor.methods({
  async 'orders.process'(orderId) {
    check(orderId, String);

    // Mark the start of validation
    addEvent('validation.start', { orderId });

    const order = await OrdersCollection.findOneAsync(orderId);
    if (!order) {
      addEvent('validation.failed', { reason: 'Order not found' });
      throw new Meteor.Error('not-found', 'Order not found');
    }

    addEvent('validation.complete', {
      itemCount: order.items.length,
      totalAmount: order.total,
    });

    // Mark payment processing
    addEvent('payment.start', {
      amount: order.total,
      currency: order.currency,
    });

    const paymentResult = await processPayment(order);

    addEvent('payment.complete', {
      transactionId: paymentResult.transactionId,
      status: paymentResult.status,
    });

    return { success: true, transactionId: paymentResult.transactionId };
  },
}, { otel: true });
```

### addEvent() API

```javascript
addEvent(eventName, attributes?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventName` | string | Name of the event (e.g., `"validation.start"`) |
| `attributes` | object | Optional key-value pairs with event context |

### Best Practices for Events

**DO use events for:**
- Marking phases of an operation (start/end of validation, payment, etc.)
- Recording important decisions or branch points
- Capturing error context before throwing
- Logging state changes

**DON'T use events for:**
- High-frequency operations (use metrics instead)
- Data that should be in span attributes
- Debugging output (use proper logging)

### Event Naming Conventions

Use a consistent naming pattern for events:

```javascript
// Good: verb.noun or phase.action pattern
addEvent('validation.start', { ... });
addEvent('validation.complete', { ... });
addEvent('payment.failed', { reason: '...' });
addEvent('inventory.reserved', { items: [...] });
addEvent('email.sent', { recipient: '...' });

// Bad: inconsistent or unclear naming
addEvent('start', { ... });           // Too vague
addEvent('done', { ... });            // What's done?
addEvent('error happened', { ... });  // Spaces, unclear
```

### Viewing Events in Grafana

Events appear in the trace detail view in Grafana. When you click on a span, you'll see:

1. The span's timeline
2. All events with their timestamps
3. Event attributes

// TODO: add image of events in Grafana trace view

## Custom Spans with withSpan

While automatic tracing captures method and publication calls, and events mark moments within a span, sometimes you need to trace a specific operation as a separate span with its own duration. The `withSpan()` function creates child spans within your traced methods.

### When to Use Custom Spans

Use `withSpan()` when you want to:
- Measure the duration of a specific operation separately
- Group related operations together
- Create a hierarchy of operations for better visualization
- Isolate slow parts of a method for analysis

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Span: meteor.method orders.process (850ms)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: validateOrder (45ms)                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: processPayment (520ms)                              │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │ Child Span: callPaymentGateway (480ms)                   │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: sendConfirmationEmail (180ms)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Using withSpan()

Import `withSpan` from the package:

```javascript
import { initOtel, withSpan } from 'meteor/meteor-otel';
```

The `withSpan()` function wraps an async operation and creates a child span:

```javascript
Meteor.methods({
  async 'orders.process'(orderId) {
    check(orderId, String);

    // Create a child span for validation
    const order = await withSpan('orders', 'validateOrder', async () => {
      const order = await OrdersCollection.findOneAsync(orderId);
      if (!order) {
        throw new Meteor.Error('not-found', 'Order not found');
      }
      return order;
    }, { attributes: { 'order.id': orderId } });

    // Create a child span for payment processing
    const paymentResult = await withSpan('orders', 'processPayment', async () => {
      return await PaymentService.charge(order.total, order.paymentMethod);
    }, { attributes: { 'payment.amount': order.total } });

    // Create a child span for email
    await withSpan('orders', 'sendConfirmationEmail', async () => {
      await EmailService.send({
        to: order.customerEmail,
        template: 'order-confirmation',
        data: { order, paymentResult },
      });
    });

    return { success: true, transactionId: paymentResult.id };
  },
}, { otel: true });
```

### withSpan() API

```javascript
await withSpan(tracerName, spanName, asyncFunction, options?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tracerName` | string | Logical name for grouping related spans (e.g., `"orders"`, `"payments"`) |
| `spanName` | string | Name of this specific operation (e.g., `"validateOrder"`) |
| `asyncFunction` | function | The async function to execute within the span |
| `options` | object | Optional configuration |
| `options.attributes` | object | Key-value pairs to attach to the span |

### Adding Attributes to Spans

Attributes provide context about the operation:

```javascript
await withSpan('orders', 'processPayment', async () => {
  // ... payment logic
}, {
  attributes: {
    'payment.amount': 99.99,
    'payment.currency': 'USD',
    'payment.method': 'credit_card',
    'customer.id': customerId,
  }
});
```

### Error Handling

When the function inside `withSpan()` throws an error:
- The span is marked with `ERROR` status
- The exception is recorded on the span
- The error is re-thrown (so your error handling still works)

```javascript
await withSpan('orders', 'processPayment', async () => {
  const result = await PaymentService.charge(amount);

  if (!result.success) {
    // This error will be captured in the span
    throw new Meteor.Error('payment-failed', result.message);
  }

  return result;
});
```

### Nested Spans

You can nest `withSpan()` calls to create a hierarchy:

```javascript
Meteor.methods({
  async 'orders.process'(orderId) {
    // Parent span (automatic from { otel: true })

    await withSpan('orders', 'fulfillment', async () => {
      // Child span

      await withSpan('orders', 'checkInventory', async () => {
        // Grandchild span
        await InventoryService.check(orderId);
      });

      await withSpan('orders', 'reserveItems', async () => {
        // Another grandchild span
        await InventoryService.reserve(orderId);
      });

      await withSpan('orders', 'scheduleShipping', async () => {
        // Another grandchild span
        await ShippingService.schedule(orderId);
      });
    });
  },
}, { otel: true });
```

This creates a trace like:

```
meteor.method orders.process
└── fulfillment
    ├── checkInventory
    ├── reserveItems
    └── scheduleShipping
```

### Synchronous Version: withSpanSync()

For synchronous operations, use `withSpanSync()`:

```javascript
import { withSpanSync } from 'meteor/meteor-otel';

const result = withSpanSync('compute', 'calculateTotals', () => {
  // Synchronous computation
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}, { attributes: { 'items.count': items.length } });
```
### Events vs Custom Spans: When to Use Each

| Use Case | Use Events | Use withSpan |
|----------|------------|--------------|
| Mark a moment in time | ✅ | ❌ |
| Measure operation duration | ❌ | ✅ |
| Add context without new span | ✅ | ❌ |
| Isolate slow operations | ❌ | ✅ |
| High-frequency markers | ✅ | ❌ |
| Create trace hierarchy | ❌ | ✅ |

### Viewing Custom Spans in Grafana

Custom spans appear as children of the parent span in Grafana's trace view:

1. Go to **Explore** → **Tempo**
2. Find a trace for your method
3. Expand the trace to see the span hierarchy
4. Click on individual spans to see their attributes and duration

// TODO: add image of nested spans in Grafana

---

## Custom Metrics with createMetricsRecorder

While `initOtel()` provides automatic system metrics (Node.js runtime, process info), you'll often want to track **business-specific metrics** unique to your application. The `createMetricsRecorder` function gives you a simple API to create custom counters, histograms, and gauges.

### Why Custom Metrics?

Custom metrics answer questions that automatic instrumentation can't:

- **How many orders were placed in each cluster?** → Counter
- **What's the average checkout latency for X region?** → Histogram
- **How many items are currently in users' carts?** → UpDownCounter (gauge-like)

### Creating a Metrics Recorder

First, create a metrics recorder with a namespace for your metrics:

```javascript
import { createMetricsRecorder } from 'meteor/meteor-otel';

// Create a recorder - all metrics will be prefixed with this namespace
const appMetrics = createMetricsRecorder('myapp');
```

The namespace helps organize your metrics in Grafana. Metrics created with this recorder will be named like `myapp.orders.created`, `myapp.checkout.latency`, etc.

### Metric Types

The `createMetricsRecorder` provides three types of metrics:

#### 1. Counter - Monotonically Increasing Values

Counters only go up. Use them for things you count: requests, orders, errors, emails sent.

```javascript
// Create a counter
const ordersCounter = appMetrics.counter(
  'orders.created',        // metric name
  'Number of orders created', // description
  'orders'                 // unit
);

// Use it in your methods
Meteor.methods({
  async 'orders.create'(items) {
    // ... create order logic ...

    // Increment the counter
    ordersCounter.add(1);

    // Or with attributes for more granular tracking
    ordersCounter.add(1, {
      'order.type': 'subscription',
      'payment.method': 'credit_card'
    });

    return orderId;
  }
}, { otel: true });
```

#### 2. Histogram - Distribution of Values

Histograms track the distribution of values over time. Perfect for latencies, sizes, or any value where you care about percentiles (p50, p95, p99).

```javascript
// Create a histogram
const checkoutLatency = appMetrics.histogram(
  'checkout.latency',
  'Time to complete checkout',
  'ms'
);

Meteor.methods({
  async 'orders.checkout'(cartId) {
    const startTime = Date.now();

    try {
      // ... checkout logic ...
      return result;
    } finally {
      // Record the latency
      const latency = Date.now() - startTime;
      checkoutLatency.record(latency, { 'cart.id': cartId });
    }
  }
}, { otel: true });
```

In Grafana, you can then query percentiles:

```promql
# 95th percentile checkout latency
histogram_quantile(0.95, rate(myapp_checkout_latency_bucket[5m]))
```

#### 3. UpDownCounter - Values That Can Increase or Decrease

UpDownCounters can go up or down. Use them for current counts: active users, items in cart, open connections.

```javascript
// Create an up-down counter
const activeCartsCounter = appMetrics.upDownCounter(
  'carts.active',
  'Number of active shopping carts',
  'carts'
);

Meteor.methods({
  async 'cart.create'(userId) {
    // ... create cart ...
    activeCartsCounter.add(1, { 'user.type': 'registered' });
    return cartId;
  },

  async 'cart.checkout'(cartId) {
    // ... process checkout ...
    activeCartsCounter.add(-1); // Decrement when cart is checked out
  },

  async 'cart.abandon'(cartId) {
    // ... cleanup ...
    activeCartsCounter.add(-1); // Decrement when cart is abandoned
  }
}, { otel: true });
```

### Complete Example: E-commerce Metrics

Here's a practical example combining all metric types:

```javascript
// server/metrics.js
import { createMetricsRecorder } from 'meteor/meteor-otel';

const ecommerceMetrics = createMetricsRecorder('ecommerce');

export const metrics = {
  // Counters
  ordersCreated: ecommerceMetrics.counter(
    'orders.created',
    'Total orders created',
    'orders'
  ),
  paymentsFailed: ecommerceMetrics.counter(
    'payments.failed',
    'Failed payment attempts',
    'payments'
  ),

  // Histograms
  checkoutLatency: ecommerceMetrics.histogram(
    'checkout.latency',
    'Checkout processing time',
    'ms'
  ),
  orderValue: ecommerceMetrics.histogram(
    'order.value',
    'Order total value',
    'USD'
  ),

  // UpDownCounters
  activeCarts: ecommerceMetrics.upDownCounter(
    'carts.active',
    'Currently active shopping carts',
    'carts'
  ),
  itemsInStock: ecommerceMetrics.upDownCounter(
    'inventory.items',
    'Items currently in stock',
    'items'
  ),
};
```

```javascript
// server/methods/orders.js
import { metrics } from '../metrics';

Meteor.methods({
  async 'orders.checkout'(cartId) {
    const startTime = Date.now();

    try {
      const cart = await CartsCollection.findOneAsync(cartId);
      const order = await processOrder(cart);

      // Record metrics
      metrics.ordersCreated.add(1, {
        'order.type': cart.type,
        'user.tier': cart.userTier
      });
      metrics.orderValue.record(order.total);
      metrics.activeCarts.add(-1);

      // Update inventory
      for (const item of cart.items) {
        metrics.itemsInStock.add(-item.quantity, {
          'product.category': item.category
        });
      }

      return order._id;

    } catch (error) {
      if (error.type === 'PaymentFailed') {
        metrics.paymentsFailed.add(1, {
          'error.code': error.code
        });
      }
      throw error;

    } finally {
      metrics.checkoutLatency.record(Date.now() - startTime);
    }
  }
}, { otel: true });
```

### Metric Attributes Best Practices

Attributes add dimensions to your metrics, enabling powerful filtering and grouping in Grafana:

```javascript
// Good: Low-cardinality attributes
ordersCounter.add(1, {
  'order.type': 'subscription',      // Few distinct values
  'payment.method': 'credit_card',   // Few distinct values
  'region': 'us-east',               // Few distinct values
});

// Bad: High-cardinality attributes (avoid these!)
ordersCounter.add(1, {
  'user.id': userId,      // Thousands of unique values
  'order.id': orderId,    // Unique per order
  'timestamp': Date.now() // Unique per call
});
```

**Why does cardinality matter?** Each unique combination of attribute values creates a separate time series. High-cardinality attributes can cause:
- Excessive memory usage in Prometheus
- Slow queries in Grafana
- Higher storage costs

### Querying Custom Metrics in Grafana

Your custom metrics are available in Prometheus. Here are example queries:

```promql
# Total orders in the last hour
increase(ecommerce_orders_created_total[1h])

# Orders per minute by type
rate(ecommerce_orders_created_total[5m]) by (order_type)

# Average checkout latency
rate(ecommerce_checkout_latency_sum[5m]) / rate(ecommerce_checkout_latency_count[5m])

# 99th percentile checkout latency
histogram_quantile(0.99, rate(ecommerce_checkout_latency_bucket[5m]))

# Current active carts
ecommerce_carts_active

# Payment failure rate
rate(ecommerce_payments_failed_total[5m]) / rate(ecommerce_orders_created_total[5m])
```

### API Reference

```javascript
const recorder = createMetricsRecorder(namespace);

// Counter (monotonically increasing)
const counter = recorder.counter(name, description, unit);
counter.add(value, attributes?);

// Histogram (distribution of values)
const histogram = recorder.histogram(name, description, unit);
histogram.record(value, attributes?);

// UpDownCounter (can increase or decrease)
const upDownCounter = recorder.upDownCounter(name, description, unit);
upDownCounter.add(value, attributes?);  // positive or negative
```

---

