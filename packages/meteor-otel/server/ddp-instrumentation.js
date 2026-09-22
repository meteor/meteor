import { SpanKind, SpanStatusCode, diag } from '@opentelemetry/api';
import { Instrumentation } from 'meteor/instrumentation';

const DEFAULT_MAX_PENDING_SPANS = 10000;
const DEFAULT_SPAN_TIMEOUT_MS = 30 * 60 * 1000;

function positiveNumber(value, fallback, name, integer = false) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${name} must be a positive ${integer ? 'integer' : 'finite number'}`);
  }
  return value;
}

// Owns only listeners and spans. The public seam never exposes live handlers,
// sessions, request headers, or DDP document-send events.
export function startInstrumentation({ tracer, meter, filter, attributes,
  maxPendingSpans = DEFAULT_MAX_PENDING_SPANS,
  spanTimeoutMs = DEFAULT_SPAN_TIMEOUT_MS,
} = {}) {
  maxPendingSpans = positiveNumber(maxPendingSpans, DEFAULT_MAX_PENDING_SPANS, 'maxPendingSpans', true);
  spanTimeoutMs = positiveNumber(spanTimeoutMs, DEFAULT_SPAN_TIMEOUT_MS, 'spanTimeoutMs');
  if (spanTimeoutMs > 2147483647) throw new RangeError('spanTimeoutMs exceeds the Node timer limit');
  for (const [name, callback] of Object.entries({ filter, attributes })) {
    if (callback !== undefined && typeof callback !== 'function') {
      throw new TypeError(`${name} must be a function`);
    }
  }

  const pending = new Map();
  const registrations = [];
  const durations = {
    method: meter.createHistogram('meteor.method.duration', { unit: 'ms' }),
    publication: meter.createHistogram('meteor.publication.duration', { unit: 'ms' }),
  };
  const connections = meter.createCounter('meteor.ddp.connections');
  const connectionDuration = meter.createHistogram('meteor.ddp.connection.duration', { unit: 'ms' });
  let stopped = false;

  const keyFor = (kind, spanId) => `${kind}:${spanId}`;

  function take(key) {
    const entry = pending.get(key);
    if (entry) {
      pending.delete(key);
      clearTimeout(entry.timer);
    }
    return entry;
  }

  function incomplete(key, reason) {
    const entry = take(key);
    if (!entry) return;
    try {
      entry.span.setAttributes({
        'meteor.instrumentation.incomplete': true,
        'meteor.instrumentation.end_reason': reason,
      });
    } finally {
      entry.span.end();
    }
  }

  function start(kind, event) {
    if (stopped || !event.spanId || (filter && !filter(event))) return;
    // Run application code before allocating a span or evicting another one.
    const extra = attributes ? attributes(event) : undefined;
    const name = event.name ?? '<universal>';
    const key = keyFor(kind, event.spanId);
    if (pending.has(key)) incomplete(key, 'restarted');
    if (pending.size >= maxPendingSpans) incomplete(pending.keys().next().value, 'capacity');
    const attrs = {
      'ddp.type': kind,
      [`ddp.${kind}.name`]: name,
      [`meteor.${kind}.name`]: name,
      'meteor.instrumentation.trace_id': event.traceId,
      'meteor.instrumentation.span_id': event.spanId,
      [kind === 'method' ? 'ddp.method.params.length' : 'ddp.subscription.params.length']: event.argsCount,
    };
    if (event.connectionId != null) attrs['ddp.session.id'] = event.connectionId;
    if (event.subscriptionId != null) attrs['ddp.subscription.id'] = event.subscriptionId;
    const span = tracer.startSpan(`${kind === 'method' ? 'method' : 'publish'}:${name}`, {
      kind: SpanKind.SERVER,
      startTime: new Date(event.ts),
      attributes: { ...attrs, ...extra },
    });
    const timer = setTimeout(() => {
      try { incomplete(key, 'timeout'); } catch (error) { diag.warn('meteor-otel: span timeout cleanup failed', error); }
    }, spanTimeoutMs);
    timer.unref?.();
    pending.set(key, { span, timer, connectionId: event.connectionId, name });
  }

  function finish(kind, event, failed) {
    const entry = take(keyFor(kind, event.spanId));
    if (!entry) return; // Late terminal events after timeout/eviction, or filtered starts.
    try {
      if (failed) {
        // Only the seam's bounded summary; no raw Error, stack or details.
        if (event.error) entry.span.recordException({ name: event.error.name, message: event.error.message }, new Date(event.ts));
        entry.span.setStatus({ code: SpanStatusCode.ERROR, message: event.error?.message });
      } else {
        entry.span.setStatus({ code: SpanStatusCode.OK });
      }
      if (Number.isFinite(event.durationMs) && event.durationMs >= 0) {
        durations[kind].record(event.durationMs, { name: entry.name, outcome: failed ? 'error' : 'ok' });
      }
    } finally {
      entry.span.end(new Date(event.ts));
    }
  }

  const on = (type, listener) => registrations.push(Instrumentation.on(type, listener));
  on('method.start', event => start('method', event));
  on('method.end', event => finish('method', event, false));
  on('method.error', event => finish('method', event, true));
  on('publication.start', event => start('publication', event));
  on('publication.ready', event => {
    const span = pending.get(keyFor('publication', event.spanId))?.span;
    if (span) span.addEvent('publication.ready', {}, new Date(event.ts));
  });
  on('publication.stop', event => finish('publication', event, false));
  on('publication.error', event => finish('publication', event, true));
  on('ddp.connection.open', () => connections.add(1, { state: 'open' }));
  on('ddp.connection.close', event => {
    // Normally terminal invocation events ran first. Close remaining spans if
    // observation started/stopped midway through the connection's lifetime.
    for (const [key, entry] of pending) {
      if (entry.connectionId === event.connectionId) {
        try { incomplete(key, 'disconnect'); } catch (error) { diag.warn('meteor-otel: disconnect cleanup failed', error); }
      }
    }
    connections.add(1, { state: 'close' });
    if (Number.isFinite(event.durationMs) && event.durationMs >= 0) connectionDuration.record(event.durationMs);
  });

  return {
    getInvocationSpan() {
      const { kind, spanId } = Instrumentation.currentContext();
      return pending.get(keyFor(kind, spanId))?.span;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const registration of registrations) registration.stop();
      for (const key of pending.keys()) {
        try { incomplete(key, 'shutdown'); } catch (error) { diag.warn('meteor-otel: shutdown cleanup failed', error); }
      }
    },
  };
}
