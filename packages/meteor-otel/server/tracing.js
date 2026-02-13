/**
 * Tracing Utilities for Meteor
 *
 * Provides convenient helpers for creating spans and tracing async operations.
 */

import { trace, SpanStatusCode, context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';

/**
 * Create a simple span and execute a function within it.
 *
 * @param {string} tracerName - Tracer name
 * @param {string} spanName - Span name
 * @param {Function} fn - Function to execute
 * @param {Object} attributes - Optional span attributes
 * @returns {Promise<*>} Result of the function
 *
 * @example
 * const result = await withSpan('my-service', 'processOrder', async () => {
 *   return await processOrder(orderId);
 * }, { 'order.id': orderId });
 */
export async function withSpan(tracerName, spanName, fn, attributes = {}) {
  const tracer = trace.getTracer(tracerName);
  const span = tracer.startSpan(spanName, { attributes });
  const spanContext = trace.setSpan(context.active(), span);

  try {
    const result = await context.with(spanContext, fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || 'Operation failed',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a synchronous span and execute a function within it.
 *
 * @param {string} tracerName - Tracer name
 * @param {string} spanName - Span name
 * @param {Function} fn - Function to execute
 * @param {Object} attributes - Optional span attributes
 * @returns {*} Result of the function
 */
export function withSpanSync(tracerName, spanName, fn, attributes = {}) {
  const tracer = trace.getTracer(tracerName);
  const span = tracer.startSpan(spanName, { attributes });
  const spanContext = trace.setSpan(context.active(), span);

  try {
    const result = context.with(spanContext, fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || 'Operation failed',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span builder for more complex tracing scenarios.
 *
 * @param {string} tracerName - Tracer name
 * @returns {Object} Span builder
 *
 * @example
 * const builder = createSpanBuilder('my-service');
 * const span = builder.start('myOperation', { 'user.id': userId });
 * try {
 *   // do work
 *   span.addEvent('checkpoint', { step: 1 });
 *   // more work
 *   span.success();
 * } catch (error) {
 *   span.error(error);
 *   throw error;
 * }
 */
export function createSpanBuilder(tracerName) {
  const tracer = trace.getTracer(tracerName);

  return {
    /**
     * Start a new span.
     *
     * @param {string} spanName - Span name
     * @param {Object} attributes - Optional span attributes
     * @returns {Object} Span handle
     */
    start(spanName, attributes = {}) {
      const span = tracer.startSpan(spanName, { attributes });
      const spanContext = trace.setSpan(context.active(), span);

      return {
        /**
         * Add an event to the span.
         */
        addEvent(name, attrs = {}) {
          span.addEvent(name, attrs);
          return this;
        },

        /**
         * Set an attribute on the span.
         */
        setAttribute(key, value) {
          span.setAttribute(key, value);
          return this;
        },

        /**
         * Set multiple attributes on the span.
         */
        setAttributes(attrs) {
          Object.entries(attrs).forEach(([key, value]) => {
            span.setAttribute(key, value);
          });
          return this;
        },

        /**
         * Mark the span as successful and end it.
         */
        success() {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        },

        /**
         * Mark the span as failed and end it.
         */
        error(err) {
          if (err) {
            span.recordException(err);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err?.message || 'Operation failed',
            });
          } else {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
          span.end();
        },

        /**
         * Run a function within this span's context.
         */
        run(fn) {
          return context.with(spanContext, fn);
        },

        /**
         * Run an async function within this span's context.
         */
        async runAsync(fn) {
          return context.with(spanContext, fn);
        },

        /**
         * Get the underlying OpenTelemetry span.
         */
        getSpan() {
          return span;
        },

        /**
         * Get the span context for propagation.
         */
        getContext() {
          return spanContext;
        },
      };
    },
  };
}

// Simple carrier for header manipulation
class HeaderCarrier {
  constructor(headers = {}) {
    this.headers = { ...headers };
  }

  get(key) {
    // Handle case-insensitive header lookup
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === lowerKey) {
        return v;
      }
    }
    return undefined;
  }

  set(key, value) {
    this.headers[key] = value;
  }

  keys() {
    return Object.keys(this.headers);
  }
}

/**
 * Extract trace context from incoming headers for distributed tracing.
 * Use this to continue a trace from an external service.
 *
 * @param {Object} headers - Request headers containing trace context (traceparent, tracestate)
 * @returns {Object} OpenTelemetry context that can be used with context.with()
 *
 * @example
 * // In a webhook handler or external API endpoint
 * WebApp.connectHandlers.use('/webhook', (req, res) => {
 *   const extractedContext = extractTraceContext(req.headers);
 *
 *   context.with(extractedContext, async () => {
 *     // All spans created here will be children of the incoming trace
 *     await processWebhook(req.body);
 *   });
 * });
 *
 * @example
 * // In a Meteor method receiving trace context from client
 * Meteor.methods({
 *   'orders.process'(data, traceHeaders) {
 *     const parentContext = extractTraceContext(traceHeaders);
 *
 *     return context.with(parentContext, async () => {
 *       // This span will be a child of the client's span
 *       return await withSpan('orders', 'process', async () => {
 *         return await processOrder(data);
 *       });
 *     });
 *   }
 * });
 */
export function extractTraceContext(headers) {
  if (!headers || typeof headers !== 'object') {
    return context.active();
  }

  const carrier = new HeaderCarrier(headers);
  return propagation.extract(ROOT_CONTEXT, carrier, {
    get: (carrier, key) => carrier.get(key),
    keys: (carrier) => carrier.keys(),
  });
}

/**
 * Inject trace context into outgoing headers for distributed tracing.
 * Use this when making requests to external services to propagate the trace.
 *
 * @param {Object} headers - Optional existing headers object to inject into
 * @returns {Object} Headers object with trace context (traceparent, tracestate)
 *
 * @example
 * // Making an HTTP request to another service
 * const headers = injectTraceContext({
 *   'Content-Type': 'application/json',
 *   'Authorization': 'Bearer token',
 * });
 *
 * const response = await fetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers,
 *   body: JSON.stringify(data),
 * });
 *
 * @example
 * // Inside a traced method, propagate to external service
 * Meteor.methods({
 *   async 'orders.sync'(orderId) {
 *     // Get headers with current trace context
 *     const traceHeaders = injectTraceContext();
 *
 *     // External service will receive traceparent and tracestate headers
 *     await HTTP.call('POST', 'https://inventory.example.com/sync', {
 *       headers: traceHeaders,
 *       data: { orderId },
 *     });
 *   }
 * }, { otel: true });
 */
export function injectTraceContext(headers = {}) {
  const carrier = new HeaderCarrier(headers);
  propagation.inject(context.active(), carrier, {
    set: (carrier, key, value) => carrier.set(key, value),
  });
  return carrier.headers;
}

/**
 * Get the current trace context as a serializable object.
 * Useful for passing trace context through non-HTTP channels (WebSocket, DDP, queues).
 *
 * @returns {Object} Object containing traceparent and tracestate (if present)
 *
 * @example
 * // Get trace context to send via DDP
 * Meteor.methods({
 *   async 'tasks.create'(data) {
 *     const traceContext = getTraceContext();
 *
 *     // Pass to another service via any mechanism
 *     await queueJob('process-task', {
 *       data,
 *       traceContext, // { traceparent: '00-...', tracestate: '...' }
 *     });
 *   }
 * }, { otel: true });
 */
export function getTraceContext() {
  const headers = injectTraceContext();
  const result = {};

  if (headers.traceparent) {
    result.traceparent = headers.traceparent;
  }
  if (headers.tracestate) {
    result.tracestate = headers.tracestate;
  }

  return result;
}

/**
 * Create a context from a serialized trace context object.
 * Use this to restore trace context received from non-HTTP channels.
 *
 * @param {Object} traceContext - Object with traceparent and optional tracestate
 * @returns {Object} OpenTelemetry context
 *
 * @example
 * // In a job worker processing a queued task
 * async function processJob(job) {
 *   const parentContext = createContextFromTrace(job.traceContext);
 *
 *   await context.with(parentContext, async () => {
 *     // All spans here will be children of the original trace
 *     await withSpan('worker', 'processJob', async () => {
 *       await doWork(job.data);
 *     });
 *   });
 * }
 */
export function createContextFromTrace(traceContext) {
  if (!traceContext || !traceContext.traceparent) {
    return context.active();
  }

  return extractTraceContext({
    traceparent: traceContext.traceparent,
    tracestate: traceContext.tracestate,
  });
}

/**
 * Run a function within a specific trace context.
 * Combines extracting context and running code in one call.
 *
 * @param {Object} headers - Headers or trace context object containing traceparent
 * @param {Function} fn - Function to run within the context
 * @returns {*} Result of the function
 *
 * @example
 * // Process a webhook with its trace context
 * WebApp.connectHandlers.use('/webhook', async (req, res) => {
 *   const result = await runWithTraceContext(req.headers, async () => {
 *     return await processWebhook(req.body);
 *   });
 *   res.end(JSON.stringify(result));
 * });
 *
 * @example
 * // Process a queued job with its trace context
 * async function handleJob(job) {
 *   return runWithTraceContext(job.traceContext, async () => {
 *     return await withSpan('jobs', job.type, async () => {
 *       return await processJob(job);
 *     });
 *   });
 * }
 */
export function runWithTraceContext(headers, fn) {
  const extractedContext = extractTraceContext(headers);
  return context.with(extractedContext, fn);
}

/**
 * Create a linked span that references another trace without being a child.
 * Useful for batch processing or fan-out scenarios.
 *
 * @param {string} tracerName - Tracer name
 * @param {string} spanName - Span name
 * @param {Array<Object>} links - Array of trace contexts to link to
 * @param {Object} attributes - Optional span attributes
 * @returns {Object} Span handle with methods: addEvent, setAttribute, setAttributes, end, fail, run, runAsync, getSpan
 *
 * @example
 * // Process multiple orders in batch, linking to each original trace
 * async function processBatch(orders) {
 *   const links = orders.map(order => order.traceContext);
 *
 *   const batchSpan = createLinkedSpan('batch', 'processBatch', links, {
 *     'batch.size': orders.length,
 *   });
 *
 *   try {
 *     for (const order of orders) {
 *       await processOrder(order);
 *     }
 *     batchSpan.end();
 *   } catch (error) {
 *     batchSpan.fail(error);
 *     throw error;
 *   }
 * }
 */
export function createLinkedSpan(tracerName, spanName, links = [], attributes = {}) {
  const tracer = trace.getTracer(tracerName);

  // Convert trace contexts to span links
  const spanLinks = links
    .map((traceContext) => {
      if (!traceContext?.traceparent) return null;

      const ctx = extractTraceContext(traceContext);
      const spanContext = trace.getSpanContext(ctx);

      if (spanContext) {
        return { context: spanContext };
      }
      return null;
    })
    .filter(Boolean);

  const span = tracer.startSpan(spanName, {
    attributes,
    links: spanLinks,
  });

  const spanContext = trace.setSpan(context.active(), span);

  return {
    addEvent(eventName, eventAttributes = {}) {
      span.addEvent(eventName, eventAttributes);
      return this;
    },

    setAttribute(key, value) {
      span.setAttribute(key, value);
      return this;
    },

    setAttributes(attrs) {
      span.setAttributes(attrs);
      return this;
    },

    end() {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    },

    fail(error) {
      if (error) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error?.message || 'Operation failed',
        });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    },

    run(fn) {
      return context.with(spanContext, fn);
    },

    async runAsync(fn) {
      return context.with(spanContext, fn);
    },

    getSpan() {
      return span;
    },
  };
}
