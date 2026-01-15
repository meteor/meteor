/**
 * OpenTelemetry Providers Setup
 *
 * Initializes and exports tracer, meter, and logger providers.
 */

import { diag, DiagConsoleLogger, DiagLogLevel, trace, metrics } from '@opentelemetry/api';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { HostMetrics } from '@opentelemetry/host-metrics';

import { getConfig } from './config.js';

let initialized = false;
let _tracerProvider = null;
let _meterProvider = null;
let _hostMetrics = null;

/**
 * Initialize OpenTelemetry providers.
 * Should be called once at application startup.
 *
 * @param {Object} options - Optional configuration overrides
 * @param {string} options.serviceName - Override service name
 * @param {Object} options.resourceAttributes - Additional resource attributes
 * @param {Array} options.instrumentations - Additional instrumentations to register
 * @returns {{ tracerProvider, meterProvider }}
 */
export function initOtel(options = {}) {
  if (initialized) {
    console.warn('[meteor-otel] Already initialized. Skipping re-initialization.');
    return { tracerProvider: _tracerProvider, meterProvider: _meterProvider };
  }

  const config = getConfig();
  const serviceName = options.serviceName || config.serviceName;

  // Enable verbose logging if OTEL_DEBUG=1
  if (config.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Create resource with service name and any additional attributes
  const resourceAttributes = {
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    ...options.resourceAttributes,
  };
  const resource = resourceFromAttributes(resourceAttributes);

  // Setup metric exporter and provider
  const metricExporter = new OTLPMetricExporter({ url: config.metricsEndpoint });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.exportIntervalMs,
  });

  _meterProvider = new MeterProvider({
    resource,
    readers: [metricReader],
  });

  // Setup tracer provider
  _tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.tracesEndpoint,
        })
      ),
    ],
  });

  // Register as global providers
  _tracerProvider.register();
  metrics.setGlobalMeterProvider(_meterProvider);

  // Setup instrumentations
  const instrumentations = [];

  if (config.runtimeMetricsEnabled) {
    instrumentations.push(new RuntimeNodeInstrumentation());
  }

  // Add any custom instrumentations passed in options
  if (options.instrumentations) {
    instrumentations.push(...options.instrumentations);
  }

  if (instrumentations.length > 0) {
    registerInstrumentations({
      tracerProvider: _tracerProvider,
      meterProvider: _meterProvider,
      instrumentations,
    });
  }

  // Start host metrics if enabled
  if (config.hostMetricsEnabled) {
    _hostMetrics = new HostMetrics({
      meterProvider: _meterProvider,
      name: `${serviceName}-host-metrics`,
    });
    _hostMetrics.start();
  }

  initialized = true;

  console.log(`[meteor-otel] Initialized for service: ${serviceName}`);
  console.log(`[meteor-otel] Traces endpoint: ${config.tracesEndpoint}`);
  console.log(`[meteor-otel] Metrics endpoint: ${config.metricsEndpoint}`);

  return { tracerProvider: _tracerProvider, meterProvider: _meterProvider };
}

/**
 * Get the tracer provider. Must call initOtel() first.
 */
export function getTracerProvider() {
  if (!initialized) {
    throw new Error('[meteor-otel] Not initialized. Call initOtel() first.');
  }
  return _tracerProvider;
}

/**
 * Get the meter provider. Must call initOtel() first.
 */
export function getMeterProvider() {
  if (!initialized) {
    throw new Error('[meteor-otel] Not initialized. Call initOtel() first.');
  }
  return _meterProvider;
}

/**
 * Get a tracer instance for the given name.
 *
 * @param {string} name - Tracer name (e.g., 'my-component')
 * @param {string} version - Optional version
 * @returns {Tracer}
 */
export function getTracer(name, version) {
  return trace.getTracer(name, version);
}

/**
 * Get a meter instance for the given name.
 *
 * @param {string} name - Meter name (e.g., 'my-component')
 * @param {string} version - Optional version
 * @returns {Meter}
 */
export function getMeter(name, version) {
  return metrics.getMeter(name, version);
}

/**
 * Shutdown OpenTelemetry providers gracefully.
 * Call this when your application is shutting down.
 */
export async function shutdown() {
  if (!initialized) return;

  console.log('[meteor-otel] Shutting down...');

  try {
    if (_hostMetrics) {
      // HostMetrics doesn't have a stop method, but we can clear the reference
      _hostMetrics = null;
    }

    if (_meterProvider) {
      await _meterProvider.shutdown();
    }

    if (_tracerProvider) {
      await _tracerProvider.shutdown();
    }

    initialized = false;
    console.log('[meteor-otel] Shutdown complete.');
  } catch (error) {
    console.error('[meteor-otel] Error during shutdown:', error);
  }
}
