---
title: Infrastructure Setup
description: Set up the OpenTelemetry observability infrastructure with Docker Compose
---

# Infrastructure Setup

This guide covers the detailed configuration of each component in the observability stack.

All the content below can be found/downloaded [here](https://github.com/meteor/performance/blob/otel/otel/) (PTAL at infra folder and docker-compose.yaml).

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

#### Metrics Generator

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

1. **service-graphs**: Generates a graph of service dependencies based on trace data. This powers the "Service Graph" view in Grafana.

//TODO: insert an image of the service graph in Grafana

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
      # NOTE: tracesToLogsV2 is intentionally omitted from this guide because
      # this stack does not provision a Loki datasource. If you add Loki to
      # your Compose file, also add it to the datasources list above and
      # uncomment this block (the `datasourceUid` must match the Loki uid).
      #
      # tracesToLogsV2:
      #   datasourceUid: loki
      #   spanStartTimeShift: '-10m'
      #   spanEndTimeShift: '10m'
      #   filterByTraceID: true
      #   filterBySpanID: false
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

## Next Steps

Your observability infrastructure is now running. Continue to [Basic Instrumentation](./otel-instrumentation.md) to learn how to:

1. Install and configure the meteor-otel package
2. Initialize OpenTelemetry in your Meteor application
3. Enable automatic tracing for methods and publications
