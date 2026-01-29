/**
 * Tests for meteor-otel configuration module
 */

import { Tinytest } from 'meteor/tinytest';
import { getConfig } from 'meteor/meteor-otel';

// Helper to run test with modified env vars and auto-restore
function withEnv(envOverrides, fn) {
  const original = {};
  const keys = Object.keys(envOverrides);

  // Save and set
  keys.forEach((key) => {
    original[key] = process.env[key];
    if (envOverrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envOverrides[key];
    }
  });

  try {
    fn();
  } finally {
    // Restore
    keys.forEach((key) => {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    });
  }
}

Tinytest.add('meteor-otel - config - getConfig returns object with all properties', (test) => {
  const config = getConfig();

  test.isNotNull(config);
  test.equal(typeof config, 'object');
  test.equal(typeof config.serviceName, 'string');
  test.equal(typeof config.debug, 'boolean');
  test.equal(typeof config.exportIntervalMs, 'number');
  test.equal(typeof config.metricsEndpoint, 'string');
  test.equal(typeof config.tracesEndpoint, 'string');
  test.equal(typeof config.logsEndpoint, 'string');
  test.equal(typeof config.hostMetricsEnabled, 'boolean');
  test.equal(typeof config.runtimeMetricsEnabled, 'boolean');
});

Tinytest.add('meteor-otel - config - default values', (test) => {
  withEnv({
    OTEL_SERVICE_NAME: undefined,
    OTEL_DEBUG: undefined,
    OTEL_METRICS_EXPORT_INTERVAL_MS: undefined,
    OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: undefined,
    OTEL_HOST_METRICS_ENABLED: undefined,
    OTEL_RUNTIME_METRICS_ENABLED: undefined,
  }, () => {
    const config = getConfig();

    test.equal(config.serviceName, 'meteor-app');
    test.isFalse(config.debug);
    test.equal(config.exportIntervalMs, 1000);
    test.equal(config.tracesEndpoint, 'http://localhost:4318/v1/traces');
    test.equal(config.metricsEndpoint, 'http://localhost:4318/v1/metrics');
    test.equal(config.logsEndpoint, 'http://localhost:4318/v1/logs');
    test.isTrue(config.hostMetricsEnabled);
    test.isTrue(config.runtimeMetricsEnabled);
  });
});

Tinytest.add('meteor-otel - config - respects environment variables', (test) => {
  withEnv({
    OTEL_SERVICE_NAME: 'custom-service',
    OTEL_DEBUG: '1',
    OTEL_METRICS_EXPORT_INTERVAL_MS: '5000',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: undefined,
    OTEL_HOST_METRICS_ENABLED: '0',
    OTEL_RUNTIME_METRICS_ENABLED: '0',
  }, () => {
    const config = getConfig();

    test.equal(config.serviceName, 'custom-service');
    test.isTrue(config.debug);
    test.equal(config.exportIntervalMs, 5000);
    test.equal(config.tracesEndpoint, 'http://collector:4318/v1/traces');
    test.equal(config.metricsEndpoint, 'http://collector:4318/v1/metrics');
    test.equal(config.logsEndpoint, 'http://collector:4318/v1/logs');
    test.isFalse(config.hostMetricsEnabled);
    test.isFalse(config.runtimeMetricsEnabled);
  });
});

Tinytest.add('meteor-otel - config - normalizes trailing slash in endpoint', (test) => {
  withEnv({
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: undefined,
  }, () => {
    const config = getConfig();

    test.equal(config.tracesEndpoint, 'http://collector:4318/v1/traces');
    test.equal(config.metricsEndpoint, 'http://collector:4318/v1/metrics');
    test.equal(config.logsEndpoint, 'http://collector:4318/v1/logs');
  });
});

Tinytest.add('meteor-otel - config - specific endpoints override base endpoint', (test) => {
  withEnv({
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://base:4318',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://traces:4318/v1/traces',
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://metrics:4318/v1/metrics',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://logs:4318/v1/logs',
  }, () => {
    const config = getConfig();

    test.equal(config.tracesEndpoint, 'http://traces:4318/v1/traces');
    test.equal(config.metricsEndpoint, 'http://metrics:4318/v1/metrics');
    test.equal(config.logsEndpoint, 'http://logs:4318/v1/logs');
  });
});
