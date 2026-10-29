/**
 * OpenTelemetry Providers Setup
 *
 * Initializes and exports tracer and meter providers.
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
import { startInstrumentation } from './ddp-instrumentation.js';

let initialized = false;
let _tracerProvider = null;
let _meterProvider = null;
let _hostMetrics = null;
let _meteorInstrumentation = null;
let _unregisterInstrumentations = null;
let _shutdownPromise = null;

/**
 * Initialize OpenTelemetry providers.
 * Should be called once at application startup.
 *
 * @param {Object} options - Optional configuration overrides
 * @param {string} options.serviceName - Override service name
 * @param {Object} options.resourceAttributes - Additional resource attributes
 * @param {Array} options.instrumentations - Additional instrumentations to register
 * @param {Object} options.spanProcessor - BatchSpanProcessor tuning options
 *   (maxQueueSize, maxExportBatchSize, scheduledDelayMillis, exportTimeoutMillis).
 *   Undefined values fall back to SDK defaults.
 * @returns {{ tracerProvider, meterProvider }}
 */
export function initOtel(options = {}) {
  if (_shutdownPromise) {
    throw new Error('[meteor-otel] Already shut down. Restart the process to initialize again.');
  }
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

  try {
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
    // BatchSpanProcessor options can be tuned via OTEL_BSP_* env vars or via
    // options.spanProcessor; undefined values fall back to SDK defaults.
    const bspOptionsFromConfig = config.spanProcessor || {};
    const bspOptionsFromCaller = options.spanProcessor || {};
    const bspOptions = {
      maxQueueSize: bspOptionsFromCaller.maxQueueSize ?? bspOptionsFromConfig.maxQueueSize,
      maxExportBatchSize:
        bspOptionsFromCaller.maxExportBatchSize ?? bspOptionsFromConfig.maxExportBatchSize,
      scheduledDelayMillis:
        bspOptionsFromCaller.scheduledDelayMillis ?? bspOptionsFromConfig.scheduledDelayMillis,
      exportTimeoutMillis:
        bspOptionsFromCaller.exportTimeoutMillis ?? bspOptionsFromConfig.exportTimeoutMillis,
    };

    _tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: config.tracesEndpoint,
          }),
          bspOptions
        ),
      ],
    });

    if (options.meteorInstrumentation !== false) {
      _meteorInstrumentation = startInstrumentation({
        ...options.meteorInstrumentation,
        tracer: _tracerProvider.getTracer('meteor'),
        meter: _meterProvider.getMeter('meteor'),
      });
    }

    // Register as global providers
    _tracerProvider.register();
    metrics.setGlobalMeterProvider(_meterProvider);

    // Setup instrumentations
    const instrumentations = [];

    if (config.runtimeMetricsEnabled) {
      instrumentations.push(new RuntimeNodeInstrumentation());
    }

    // Add any custom instrumentations passed in options.
    // Auto-instrumentations for core modules (http, mongodb, etc.) generally
    // require the OpenTelemetry runtime to load *before* the instrumented
    // modules are imported. In Meteor, app/package modules already finish
    // loading by the time `initOtel()` runs from server/main.js, so callers
    // may pass instrumentations that silently no-op. We surface that risk via
    // a warning rather than dropping the instrumentations outright, since
    // some callers may have engineered the load order themselves (e.g.,
    // bootstrap entrypoint that imports otel before anything else).
    if (options.instrumentations && options.instrumentations.length > 0) {
      console.warn(
        '[meteor-otel] Custom instrumentations were provided. Note: instrumentations for core modules (e.g., http, mongodb) may not be effective unless OpenTelemetry is initialized before those modules are loaded.'
      );
      instrumentations.push(...options.instrumentations);
    }

    if (instrumentations.length > 0) {
      // Keep cleanup available even if a plugin throws halfway through enable().
      _unregisterInstrumentations = () => {
        const errors = [];
        for (const instrumentation of instrumentations.flat()) {
          try { instrumentation.disable(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Failed to disable instrumentations');
      };
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
  } catch (error) {
    // A provider or plugin may already own timers or global registration.
    // Clean up partial initialization too, and do not retry against stale globals.
    void shutdown().catch(cleanupError => diag.error('meteor-otel: initialization cleanup failed', cleanupError));
    throw error;
  }
}

/**
 * Get the tracer provider. Must call initOtel() first.
 */
export function getTracerProvider() {
  if (!initialized || _shutdownPromise) {
    throw new Error('[meteor-otel] Not initialized. Call initOtel() first.');
  }
  return _tracerProvider;
}

/**
 * Get the meter provider. Must call initOtel() first.
 */
export function getMeterProvider() {
  if (!initialized || _shutdownPromise) {
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

/** The current Meteor invocation span; this does not change OTel context. */
export function getInvocationSpan() {
  return _meteorInstrumentation?.getInvocationSpan();
}

/** Detach observers before flushing; both providers are shut down even if one fails. */
export function shutdown() {
  if (_shutdownPromise) return _shutdownPromise;
  if (!_meterProvider && !_tracerProvider) return Promise.resolve();

  _shutdownPromise = (async () => {
    const errors = [];
    try { _meteorInstrumentation?.stop(); } catch (error) { errors.push(error); }
    _meteorInstrumentation = null;
    try { _unregisterInstrumentations?.(); } catch (error) { errors.push(error); }
    _unregisterInstrumentations = null;
    // HostMetrics registers observable callbacks on this meter provider. It has
    // no stop API; shutting down the provider stops their periodic collection.
    _hostMetrics = null;
    const results = await Promise.allSettled([
      Promise.resolve().then(() => _meterProvider?.shutdown()),
      Promise.resolve().then(() => _tracerProvider?.shutdown()),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') errors.push(result.reason);
    }
    if (errors.length) throw new AggregateError(errors, '[meteor-otel] Shutdown failed');
  })();
  return _shutdownPromise;
}
