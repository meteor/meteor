/**
 * DDP Instrumentation for Meteor
 *
 * Provides automatic tracing for DDP messages (method calls, subscriptions, etc.)
 * and utilities for custom roundtrip tracing.
 */

import { trace, SpanStatusCode, context } from '@opentelemetry/api';

/* global DDPServer */

let ddpHookInstalled = false;
const pendingSpans = new Map();

// Hard cap on the number of pending roundtrip spans we hold in memory. Each
// entry is created by `trackDocument` and is normally cleared by the DDP
// 'added' hook or by the per-span timeout. If publication errors or buggy
// callers prevent cleanup, this cap stops the map from growing unbounded.
// New entries beyond the limit are dropped (the span ends as ERROR with a
// dedicated reason) and a single warning is logged.
const MAX_PENDING_SPANS = Number(process.env.OTEL_DDP_MAX_PENDING_SPANS) > 0
  ? Number(process.env.OTEL_DDP_MAX_PENDING_SPANS)
  : 10000;
let pendingSpansOverflowWarned = false;

// Cap on the number of argument types captured per call. Beyond this point we
// only record the count to keep span attribute cardinality bounded — high
// cardinality on per-call attributes can blow up storage on the backend.
const MAX_PARAM_TYPES = 10;

const DEFAULT_SAFE_HEADER_KEYS = [
  'user-agent',
  'x-forwarded-for',
  'x-real-ip',
  'accept-language',
  'host',
];

// Resolve the list of headers to capture from `OTEL_DDP_CAPTURED_HEADERS`.
// Empty string disables header capture entirely. Anything else is parsed as a
// comma-separated allowlist (case-insensitive). Some of these headers may
// contain PII (user-agent, forwarded IPs, etc.) and tighter regulatory
// environments (e.g., GDPR) may want to override the default.
function resolveSafeHeaderKeys() {
  const raw = process.env.OTEL_DDP_CAPTURED_HEADERS;
  if (raw === undefined) return DEFAULT_SAFE_HEADER_KEYS;
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

const SAFE_HEADER_KEYS = resolveSafeHeaderKeys();

// IP addresses can be considered PII under regulations like GDPR. Allow ops
// to disable the default `net.peer.ip` attribute via OTEL_DDP_CAPTURE_IP=0.
const CAPTURE_CLIENT_IP = process.env.OTEL_DDP_CAPTURE_IP !== '0';

// Optional hook for callers to enrich/replace the connection attributes per
// span — modeled after `applyCustomAttributesOnSpan` from
// @opentelemetry/instrumentation-http. Set via `setConnectionAttributesHook`.
let connectionAttributesHook = null;

/**
 * Register a hook to customize connection attributes captured on DDP spans.
 * The hook receives `(attrs, { connection, session })` and may mutate `attrs`
 * (delete keys, add keys) or return a replacement object. Useful when the
 * default capture is too broad for your privacy/regulatory requirements.
 *
 * @param {Function|null} fn - Hook function or null to clear.
 */
export function setConnectionAttributesHook(fn) {
  if (fn !== null && typeof fn !== 'function') {
    throw new TypeError('setConnectionAttributesHook expects a function or null');
  }
  connectionAttributesHook = fn;
}

function summarizeArgTypes(args) {
  if (!Array.isArray(args)) return [];
  if (args.length <= MAX_PARAM_TYPES) {
    return args.map((arg) => typeof arg);
  }
  const truncated = args.slice(0, MAX_PARAM_TYPES).map((arg) => typeof arg);
  truncated.push('...');
  return truncated;
}


function extractConnectionAttributes(connection, session) {
  if (!connection && !session) return {};

  const attrs = {};

  if (connection?.id)  attrs['ddp.session.id'] = connection.id;
  if (CAPTURE_CLIENT_IP && connection?.clientAddress) attrs['net.peer.ip'] = connection.clientAddress;
  if (session?.version) attrs['ddp.protocol.version'] = session.version;
  if (session?._socketUrl) attrs['ddp.connection.url'] = session._socketUrl;
  if (session?.userId) attrs['ddp.session.user_id'] = session.userId;

  const headers = connection?.httpHeaders;
  if (headers && SAFE_HEADER_KEYS.length > 0) {
    SAFE_HEADER_KEYS.forEach((header) => {
      const value = headers[header] ?? headers[header.toLowerCase()];
      if (value) {
        attrs[`ddp.connection.header.${header.replace(/-/g, '_').toLowerCase()}`] = Array.isArray(value) ? value : [value];
      }
    });
  }

  if (connectionAttributesHook) {
    try {
      const replacement = connectionAttributesHook(attrs, { connection, session });
      if (replacement && typeof replacement === 'object') {
        return replacement;
      }
    } catch (e) {
      // Never let user code break tracing.
      console.warn('[meteor-otel] connectionAttributesHook threw:', e?.message || e);
    }
  }

  return attrs;
}

function buildMethodAttributes(context, methodName, args = []) {
  const session = context?._session || null;
  const argTypes = summarizeArgTypes(args);
  const userId = context?.userId ?? 'anonymous';

  const base = {
    'ddp.type': 'method',
    'ddp.method.name': methodName,
    'meteor.method.name': methodName,
    'meteor.user.id': userId,
    'user.id': userId,
    'ddp.method.id': context?._messageId || context?.messageId || undefined,
    'ddp.method.params.length': Array.isArray(args) ? args.length : 0,
    'ddp.method.params.types': argTypes,
    'ddp.random_seed': context?.randomSeed,
  };

  return {
    ...base,
    ...extractConnectionAttributes(context?.connection, session),
  };
}

function buildPublicationAttributes(subscription, pubName, args = []) {
  const session = subscription?._session || null;
  const argTypes = summarizeArgTypes(args);
  const isUniversal = !subscription?._subscriptionId;
  const userId = subscription?.userId ?? 'anonymous';

  const base = {
    'ddp.type': 'publication',
    'ddp.publication.name': pubName,
    'meteor.publication.name': pubName,
    'meteor.user.id': userId,
    'user.id': userId,
    'ddp.subscription.id': subscription?._subscriptionId || undefined,
    'ddp.subscription.handle': subscription?._subscriptionHandle || undefined,
    'ddp.subscription.params.length': Array.isArray(args) ? args.length : 0,
    'ddp.subscription.params.types': argTypes,
    'ddp.subscription.universal': isUniversal,
  };

  return {
    ...base,
    ...extractConnectionAttributes(subscription?.connection, session),
  };
}

/**
 * Install hooks on DDPServer._Session to trace DDP messages.
 * This is called automatically when using createRoundtripTracer.
 */
export function installDDPHooks() {
  if (ddpHookInstalled) return;
  if (!DDPServer?._Session) {
    console.warn('[meteor-otel] DDPServer._Session not available. DDP instrumentation disabled.');
    return;
  }

  const origSend = DDPServer._Session.prototype.send;

  DDPServer._Session.prototype.send = function send(payload, ...rest) {
    if (payload?.msg === 'added' && payload.collection && payload.id) {
      const key = `${payload.collection}:${payload.id}`;
      const spanInfo = pendingSpans.get(key);

      if (spanInfo) {
        spanInfo.span.addEvent('ddp.send.added', {
          'ddp.session.id': this.id,
          'ddp.collection': payload.collection,
          'ddp.doc.id': payload.id,
        });
        spanInfo.span.setStatus({ code: SpanStatusCode.OK });
        spanInfo.span.end();
        pendingSpans.delete(key);

        if (spanInfo.timer) {
          clearTimeout(spanInfo.timer);
        }
      }
    }

    return origSend.call(this, payload, ...rest);
  };

  ddpHookInstalled = true;
  console.log('[meteor-otel] DDP instrumentation hooks installed.');
}

/**
 * Create a roundtrip tracer for tracking operations from method call to DDP publish.
 *
 * @param {string} tracerName - Name for the tracer (e.g., 'my-collection.roundtrip')
 * @returns {Object} Roundtrip tracer factory
 *
 * @example
 * const linksTracer = createRoundtripTracer('links.roundtrip');
 *
 * Meteor.methods({
 *   async 'links.insert'() {
 *     const roundtrip = linksTracer.begin('links.insert->publish', { sessionId: this.userId });
 *     const doc = { _id: Random.id(), ... };
 *     roundtrip.trackDocument('links', doc._id);
 *
 *     try {
 *       await roundtrip.run(() => LinksCollection.insertAsync(doc));
 *       return doc._id;
 *     } catch (error) {
 *       roundtrip.fail(error);
 *       throw error;
 *     }
 *   }
 * });
 */
export function createRoundtripTracer(tracerName) {
  installDDPHooks();
  const tracer = trace.getTracer(tracerName);

  return {
    /**
     * Begin a new roundtrip span.
     *
     * @param {string} spanName - Name for the span
     * @param {Object} attributes - Initial span attributes
     * @param {number} timeoutMs - Timeout for waiting for DDP added message (default: 30000)
     * @returns {Object} Roundtrip handle with methods: trackDocument, fail, run
     */
    begin(spanName, attributes = {}, timeoutMs = 30000) {
      const span = tracer.startSpan(spanName, { attributes });
      const spanContext = trace.setSpan(context.active(), span);

      let trackedKey = null;
      let timer = null;

      function clearTimer() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }

      return {
        /**
         * Track a document to wait for its DDP 'added' message.
         *
         * @param {string} collection - Collection name
         * @param {string} docId - Document ID
         */
        trackDocument(collection, docId) {
          if (!docId) return;

          // Refuse to enqueue when at capacity. End the span as ERROR rather
          // than holding onto it; the alternative is silently leaking memory
          // when many trackDocument calls never see their DDP 'added' message.
          if (pendingSpans.size >= MAX_PENDING_SPANS) {
            if (!pendingSpansOverflowWarned) {
              pendingSpansOverflowWarned = true;
              console.warn(
                `[meteor-otel] pendingSpans reached MAX_PENDING_SPANS=${MAX_PENDING_SPANS}; new roundtrip spans will be ended as ERROR. Override via OTEL_DDP_MAX_PENDING_SPANS.`
              );
            }
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'pendingSpans capacity exceeded',
            });
            span.end();
            return;
          }

          trackedKey = `${collection}:${docId}`;
          span.setAttribute('meteor.collection', collection);
          span.setAttribute('meteor.doc.id', docId);

          const spanInfo = { span, timer: null };
          pendingSpans.set(trackedKey, spanInfo);

          clearTimer();
          timer = setTimeout(() => {
            const currentInfo = pendingSpans.get(trackedKey);
            // Ensure this timeout still owns the entry: another trackDocument
            // call (or a successful ddp 'added' completion) may have replaced
            // or cleared it before this fired.
            if (!currentInfo || currentInfo.span !== span || currentInfo.timer !== timer) {
              return;
            }

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Timeout waiting for DDP added message',
            });
            span.end();
            currentInfo.timer = null;
            pendingSpans.delete(trackedKey);
          }, timeoutMs);

          spanInfo.timer = timer;
        },

        /**
         * Mark the roundtrip as failed.
         *
         * @param {Error} error - The error that caused the failure
         */
        fail(error) {
          clearTimer();

          if (trackedKey) {
            pendingSpans.delete(trackedKey);
          }

          if (error) {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error?.message || 'Unknown error',
            });
          } else {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }

          span.end();
        },

        /**
         * Run a function within the span context.
         *
         * @param {Function} fn - Function to run
         * @returns {*} Result of the function
         */
        run(fn) {
          return context.with(spanContext, fn);
        },

        /**
         * Add an event to the span.
         *
         * @param {string} name - Event name
         * @param {Object} attributes - Event attributes
         */
        addEvent(name, attributes) {
          span.addEvent(name, attributes);
        },

        /**
         * Set an attribute on the span.
         *
         * @param {string} key - Attribute key
         * @param {*} value - Attribute value
         */
        setAttribute(key, value) {
          span.setAttribute(key, value);
        },

        /**
         * End the span successfully without waiting for DDP.
         * Use this if you don't need to wait for the DDP added message.
         */
        end() {
          clearTimer();
          if (trackedKey) {
            pendingSpans.delete(trackedKey);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        },
      };
    },
  };
}

/**
 * Simple utility to create a span for a Meteor method.
 *
 * @param {string} methodName - Method name
 * @param {Function} fn - Method implementation
 * @returns {Function} Wrapped method function
 *
 * @example
 * Meteor.methods({
 *   'tasks.create': wrapMethod('tasks.create', async function(data) {
 *     return await TasksCollection.insertAsync(data);
 *   })
 * });
 */
export function wrapMethod(methodName, fn) {
  const tracer = trace.getTracer('meteor.methods'); // TODO: should it have the method name scope?

  return async function (...args) {
    const span = tracer.startSpan(`method:${methodName}`, {
      attributes: buildMethodAttributes(this, methodName, args), // "this" is the MethodInvocation context
    });

    const spanContext = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(spanContext, () => fn.apply(this, args));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Method failed',
      });
      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Simple utility to create a span for a Meteor publication.
 *
 * @param {string} pubName - Publication name
 * @param {Function} fn - Publication implementation
 * @returns {Function} Wrapped publication function
 *
 * @example
 * Meteor.publish('tasks', wrapPublication('tasks', function() {
 *   return TasksCollection.find({ userId: this.userId });
 * }));
 */
export function wrapPublication(pubName, fn) {
  const tracer = trace.getTracer('meteor.publications');

  return function (...args) {
    const span = tracer.startSpan(`publish:${pubName}`, {
      attributes: buildPublicationAttributes(this, pubName, args), // "this" is the Subscription context
    });

    const spanContext = trace.setSpan(context.active(), span);

    const onError = (error) => {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Publication failed',
      });
      span.end();
    };

    try {
      // Run within span context so child spans are properly nested.
      const result = context.with(spanContext, () => fn.apply(this, args));

      // Publish handlers may be async (return a Promise) or sync (return a
      // cursor / cursor list / undefined). For async handlers we must keep
      // the span open until the promise settles, otherwise span timing only
      // reflects the synchronous portion of setup.
      if (result && typeof result.then === 'function') {
        return result.then(
          (value) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return value;
          },
          (error) => {
            onError(error);
            throw error;
          }
        );
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}

// ============================================================================
// Active span utilities
// ============================================================================

/**
 * Get the currently active span, if any.
 *
 * @returns {Span|undefined} The active span or undefined
 *
 * @example
 * const span = getActiveSpan();
 * if (span) {
 *   span.setAttribute('custom.key', 'value');
 * }
 */
export function getActiveSpan() {
  return trace.getSpan(context.active());
}

/**
 * Add an event to the active span.
 *
 * @param {string} name - Event name
 * @param {Object} attributes - Event attributes
 *
 * @example
 * addEvent('user.validated', { userId: '123' });
 */
export function addEvent(name, attributes = {}) {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set an attribute on the active span.
 *
 * @param {string} key - Attribute key
 * @param {*} value - Attribute value
 *
 * @example
 * setAttribute('user.id', '123');
 */
export function setAttribute(key, value) {
  const span = getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Set multiple attributes on the active span.
 *
 * @param {Object} attributes - Object with key-value pairs
 *
 * @example
 * setAttributes({ 'user.id': '123', 'user.role': 'admin' });
 */
export function setAttributes(attributes) {
  const span = getActiveSpan();
  if (span && attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Record an exception on the active span.
 *
 * @param {Error} exception - The exception to record
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   recordException(error);
 *   throw error;
 * }
 */
export function recordException(exception) {
  const span = getActiveSpan();
  if (span && exception) {
    span.recordException(exception);
  }
}

/**
 * Set the active span status to error.
 *
 * @param {Error|string} error - The error or error message
 *
 * @example
 * setSpanError(new Error('Operation failed'));
 * // or
 * setSpanError('Operation failed');
 */
export function setSpanError(error) {
  const span = getActiveSpan();
  if (span) {
    if (error instanceof Error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message || 'Operation failed',
      });
    } else if (typeof error === 'string') {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
  }
}
