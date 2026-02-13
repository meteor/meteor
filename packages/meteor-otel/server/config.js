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
 */

export function getConfig() {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'meteor-app';
  const debug = process.env.OTEL_DEBUG === '1';
  const exportIntervalMs = Number(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS || 1000);

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

  return {
    serviceName,
    debug,
    exportIntervalMs,
    metricsEndpoint,
    tracesEndpoint,
    logsEndpoint,
    hostMetricsEnabled,
    runtimeMetricsEnabled,
  };
}
