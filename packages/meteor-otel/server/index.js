/**
 * meteor-otel - OpenTelemetry Instrumentation for Meteor
 *
 * A generic, pluggable OpenTelemetry package for Meteor applications.
 *
 * @example Basic usage:
 *
 * // In your server/main.js (import first, before other imports)
 * import { initOtel } from 'meteor/meteor-otel';
 *
 * initOtel({
 *   serviceName: 'my-meteor-app',
 *   resourceAttributes: {
 *     'deployment.environment': 'production',
 *   },
 * });
 *
 * @example With DDP roundtrip tracing:
 *
 * import { createRoundtripTracer } from 'meteor/meteor-otel';
 *
 * const tasksTracer = createRoundtripTracer('tasks.roundtrip');
 *
 * Meteor.methods({
 *   async 'tasks.create'(data) {
 *     const roundtrip = tasksTracer.begin('tasks.create->publish', {
 *       'user.id': this.userId,
 *     });
 *
 *     const doc = { _id: Random.id(), ...data };
 *     roundtrip.trackDocument('tasks', doc._id);
 *
 *     try {
 *       await roundtrip.run(() => TasksCollection.insertAsync(doc));
 *       return doc._id;
 *     } catch (error) {
 *       roundtrip.fail(error);
 *       throw error;
 *     }
 *   },
 * });
 *
 * @example With custom metrics:
 *
 * import { createMetricsRecorder } from 'meteor/meteor-otel';
 *
 * const appMetrics = createMetricsRecorder('my-app');
 * const ordersCounter = appMetrics.counter('orders.created', 'Number of orders');
 * const latencyHist = appMetrics.histogram('api.latency', 'API latency', 'ms');
 *
 * // In your code:
 * ordersCounter.add(1, { type: 'subscription' });
 * latencyHist.record(150);
 *
 * @example Simple span tracing:
 *
 * import { withSpan } from 'meteor/meteor-otel';
 *
 * async function processOrder(orderId) {
 *   return withSpan('orders', 'processOrder', async () => {
 *     // your code here
 *   }, { 'order.id': orderId });
 * }
 */

// Core initialization
export {
  initOtel,
  shutdown,
  getTracerProvider,
  getMeterProvider,
  getTracer,
  getMeter,
} from './providers.js';

// Configuration
export { getConfig } from './config.js';

// DDP Instrumentation
export {
  createRoundtripTracer,
  installDDPHooks,
  wrapMethod,
  wrapPublication,
  // Active span utilities
  getActiveSpan,
  addEvent,
  setAttribute,
  setAttributes,
  recordException,
  setSpanError,
} from './ddp-instrumentation.js';

// Tracing utilities
export {
  withSpan,
  withSpanSync,
  createSpanBuilder,
  // Trace propagation
  extractTraceContext,
  injectTraceContext,
  getTraceContext,
  createContextFromTrace,
  runWithTraceContext,
  createLinkedSpan,
} from './tracing.js';

// Metrics utilities
export {
  createMetricsRecorder,
  simpleCounter,
  simpleHistogram,
  createTimer,
} from './metrics.js';

// Re-export commonly used OpenTelemetry API items for convenience
export { trace, metrics, context, propagation, SpanStatusCode, ROOT_CONTEXT } from '@opentelemetry/api';
