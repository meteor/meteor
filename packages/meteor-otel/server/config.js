/**
 * OpenTelemetry Configuration for Meteor
 *
 * Environment variables:
 * - OTEL_SERVICE_NAME: Service name for telemetry (default: 'meteor-app')
 * - OTEL_DEBUG: Set to '1' to enable verbose logging
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base OTLP endpoint (default: 'http://localhost:4318')
 * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: Specific traces endpoint
 * - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: Specific metrics endpoint
 * - OTEL_METRICS_EXPORT_INTERVAL_MS: Metrics export interval (default: 1000)
 * - OTEL_HOST_METRICS_ENABLED: Set to '0' to disable host metrics (default: enabled)
 * - OTEL_RUNTIME_METRICS_ENABLED: Set to '0' to disable runtime metrics (default: enabled)
 * - OTEL_BSP_MAX_QUEUE_SIZE: BatchSpanProcessor max queue size (optional, falls back to SDK default)
 * - OTEL_BSP_MAX_EXPORT_BATCH_SIZE: BatchSpanProcessor max export batch size (optional)
 * - OTEL_BSP_SCHEDULED_DELAY_MS: BatchSpanProcessor scheduled delay (ms, optional)
 * - OTEL_BSP_EXPORT_TIMEOUT_MS: BatchSpanProcessor export timeout (ms, optional)
 * - OTEL_DDP_CAPTURED_HEADERS: Comma-separated list of HTTP headers to capture
 *   on DDP spans (default: user-agent,x-forwarded-for,x-real-ip,accept-language,host).
 *   Set to an empty string to disable header capture entirely. Useful for
 *   regulatory environments (e.g., GDPR) that disallow certain headers.
 * - OTEL_DDP_MAX_PENDING_SPANS: Hard cap on simultaneously pending roundtrip
 *   spans (default: 10000). Prevents unbounded memory growth when documents
 *   are tracked but the matching DDP 'added' message never arrives.
 * - OTEL_DDP_CAPTURE_IP: Set to '0' to omit `net.peer.ip` from DDP spans.
 *   IP addresses can be PII under regulations like GDPR; disable when traces
 *   may be retained by a provider that cannot strip them.
 */

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const DEFAULT_EXPORT_INTERVAL_MS = 1000;

export function getConfig() {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'meteor-app';
  const debug = process.env.OTEL_DEBUG === '1';

  // OTEL_METRICS_EXPORT_INTERVAL_MS may be missing, malformed, zero, or
  // negative. Any of those would propagate into PeriodicExportingMetricReader
  // and produce undefined behavior, so fall back to the default in those
  // cases.
  const parsedInterval = Number(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS);
  const exportIntervalMs =
    Number.isFinite(parsedInterval) && parsedInterval > 0
      ? parsedInterval
      : DEFAULT_EXPORT_INTERVAL_MS;

  const baseEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const normalizedBase = baseEndpoint.replace(/\/?$/, '');

  const metricsEndpoint =
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
    `${normalizedBase}/v1/metrics`;

  const tracesEndpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    `${normalizedBase}/v1/traces`;

  const logsEndpoint =
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ||
    `${normalizedBase}/v1/logs`;

  const hostMetricsEnabled = process.env.OTEL_HOST_METRICS_ENABLED !== '0';
  const runtimeMetricsEnabled = process.env.OTEL_RUNTIME_METRICS_ENABLED !== '0';

  // BatchSpanProcessor tuning. Undefined values fall back to SDK defaults.
  const spanProcessor = {
    maxQueueSize: parseOptionalPositiveInt(process.env.OTEL_BSP_MAX_QUEUE_SIZE),
    maxExportBatchSize: parseOptionalPositiveInt(process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE),
    scheduledDelayMillis: parseOptionalPositiveInt(process.env.OTEL_BSP_SCHEDULED_DELAY_MS),
    exportTimeoutMillis: parseOptionalPositiveInt(process.env.OTEL_BSP_EXPORT_TIMEOUT_MS),
  };

  return {
    serviceName,
    debug,
    exportIntervalMs,
    metricsEndpoint,
    tracesEndpoint,
    logsEndpoint,
    hostMetricsEnabled,
    runtimeMetricsEnabled,
    spanProcessor,
  };
}
