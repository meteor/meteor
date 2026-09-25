// Meteor lifecycle tracing plus the standard OpenTelemetry API. Manual tracing,
// context propagation, metrics and error conventions remain application choices.
export {
  initOtel,
  shutdown,
  getTracerProvider,
  getMeterProvider,
  getTracer,
  getMeter,
  getInvocationSpan,
} from './providers.js';
export { getConfig } from './config.js';
export { trace, metrics, context, propagation, SpanStatusCode, SpanKind, ROOT_CONTEXT } from '@opentelemetry/api';
