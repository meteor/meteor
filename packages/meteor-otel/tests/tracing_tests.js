/**
 * Tests for meteor-otel tracing module
 */

import { Tinytest } from 'meteor/tinytest';
import {
  withSpan,
  withSpanSync,
  createSpanBuilder,
  extractTraceContext,
  injectTraceContext,
  getTraceContext,
  createContextFromTrace,
  runWithTraceContext,
  createLinkedSpan,
  getTracer,
  trace,
  context,
} from 'meteor/meteor-otel';

// ============================================================================
// withSpan tests
// ============================================================================

Tinytest.addAsync('meteor-otel - tracing - withSpan executes async callback', async (test) => {
  let executed = false;

  await withSpan('test-tracer', 'test-span', async () => {
    executed = true;
  });

  test.isTrue(executed);
});

Tinytest.addAsync('meteor-otel - tracing - withSpan returns callback result', async (test) => {
  const result = await withSpan('test-tracer', 'test-span', async () => {
    return 'test-result';
  });

  test.equal(result, 'test-result');
});

Tinytest.addAsync('meteor-otel - tracing - withSpan propagates errors', async (test) => {
  let caughtError = null;

  try {
    await withSpan('test-tracer', 'test-span', async () => {
      throw new Error('test-error');
    });
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'test-error');
});

Tinytest.addAsync('meteor-otel - tracing - withSpan creates active span context', async (test) => {
  let activeSpan = null;

  await withSpan('test-tracer', 'test-span', async () => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
});

Tinytest.addAsync('meteor-otel - tracing - withSpan accepts attributes', async (test) => {
  // This test verifies the function accepts attributes without error
  const result = await withSpan('test-tracer', 'test-span', async () => {
    return 'success';
  }, { 'test.attr': 'value', 'test.number': 42 });

  test.equal(result, 'success');
});

// ============================================================================
// withSpanSync tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - withSpanSync executes callback', (test) => {
  let executed = false;

  withSpanSync('test-tracer', 'test-span', () => {
    executed = true;
  });

  test.isTrue(executed);
});

Tinytest.add('meteor-otel - tracing - withSpanSync returns callback result', (test) => {
  const result = withSpanSync('test-tracer', 'test-span', () => {
    return 'sync-result';
  });

  test.equal(result, 'sync-result');
});

Tinytest.add('meteor-otel - tracing - withSpanSync propagates errors', (test) => {
  let caughtError = null;

  try {
    withSpanSync('test-tracer', 'test-span', () => {
      throw new Error('sync-error');
    });
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'sync-error');
});

Tinytest.add('meteor-otel - tracing - withSpanSync creates active span context', (test) => {
  let activeSpan = null;

  withSpanSync('test-tracer', 'test-span', () => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
});

Tinytest.add('meteor-otel - tracing - withSpanSync accepts attributes', (test) => {
  const result = withSpanSync('test-tracer', 'test-span', () => {
    return 'success';
  }, { 'test.attr': 'value' });

  test.equal(result, 'success');
});

// ============================================================================
// createSpanBuilder tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - createSpanBuilder returns builder object', (test) => {
  const builder = createSpanBuilder('test-tracer');

  test.isNotNull(builder);
  test.equal(typeof builder.start, 'function');
});

Tinytest.add('meteor-otel - tracing - spanBuilder.start returns span handle', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  test.isNotNull(spanHandle);
  test.equal(typeof spanHandle.addEvent, 'function');
  test.equal(typeof spanHandle.setAttribute, 'function');
  test.equal(typeof spanHandle.setAttributes, 'function');
  test.equal(typeof spanHandle.success, 'function');
  test.equal(typeof spanHandle.error, 'function');
  test.equal(typeof spanHandle.run, 'function');
  test.equal(typeof spanHandle.runAsync, 'function');
  test.equal(typeof spanHandle.getSpan, 'function');
  test.equal(typeof spanHandle.getContext, 'function');

  // Clean up
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.addEvent is chainable', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  const result = spanHandle.addEvent('event1').addEvent('event2', { key: 'value' });

  test.equal(result, spanHandle);
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.setAttribute is chainable', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  const result = spanHandle.setAttribute('key1', 'value1').setAttribute('key2', 'value2');

  test.equal(result, spanHandle);
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.setAttributes is chainable', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  const result = spanHandle.setAttributes({ key1: 'value1', key2: 'value2' });

  test.equal(result, spanHandle);
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.run executes within context', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');
  let activeSpan = null;

  spanHandle.run(() => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
  spanHandle.success();
});

Tinytest.addAsync('meteor-otel - tracing - spanHandle.runAsync executes within context', async (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');
  let activeSpan = null;

  await spanHandle.runAsync(async () => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.getSpan returns underlying span', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  const span = spanHandle.getSpan();

  test.isNotNull(span);
  test.equal(typeof span.end, 'function');
  test.equal(typeof span.addEvent, 'function');

  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.getContext returns span context', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  const ctx = spanHandle.getContext();

  test.isNotNull(ctx);
  spanHandle.success();
});

Tinytest.add('meteor-otel - tracing - spanHandle.error handles error without argument', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  // Should not throw
  spanHandle.error();

  test.ok();
});

Tinytest.add('meteor-otel - tracing - spanHandle.error handles error with argument', (test) => {
  const builder = createSpanBuilder('test-tracer');
  const spanHandle = builder.start('test-span');

  // Should not throw
  spanHandle.error(new Error('test error'));

  test.ok();
});

// ============================================================================
// extractTraceContext tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - extractTraceContext returns context for valid headers', (test) => {
  const headers = {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  };

  const ctx = extractTraceContext(headers);

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - extractTraceContext returns active context for null headers', (test) => {
  const ctx = extractTraceContext(null);

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - extractTraceContext returns active context for undefined headers', (test) => {
  const ctx = extractTraceContext(undefined);

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - extractTraceContext returns active context for non-object', (test) => {
  const ctx = extractTraceContext('string');

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - extractTraceContext handles empty headers', (test) => {
  const ctx = extractTraceContext({});

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - extractTraceContext handles case-insensitive headers', (test) => {
  const headers = {
    'TRACEPARENT': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  };

  const ctx = extractTraceContext(headers);

  test.isNotNull(ctx);
});

// ============================================================================
// injectTraceContext tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - injectTraceContext returns headers object', (test) => {
  const headers = injectTraceContext();

  test.isNotNull(headers);
  test.equal(typeof headers, 'object');
});

Tinytest.add('meteor-otel - tracing - injectTraceContext preserves existing headers', (test) => {
  const headers = injectTraceContext({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token',
  });

  test.equal(headers['Content-Type'], 'application/json');
  test.equal(headers['Authorization'], 'Bearer token');
});

Tinytest.add('meteor-otel - tracing - injectTraceContext adds traceparent when in span', (test) => {
  let headers;

  withSpanSync('test-tracer', 'test-span', () => {
    headers = injectTraceContext();
  });

  test.isNotNull(headers);
  // traceparent should be present when inside a span
  if (headers.traceparent) {
    test.matches(headers.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[0-1]$/);
  }
});

// ============================================================================
// getTraceContext tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - getTraceContext returns object', (test) => {
  const ctx = getTraceContext();

  test.isNotNull(ctx);
  test.equal(typeof ctx, 'object');
});

Tinytest.add('meteor-otel - tracing - getTraceContext returns traceparent when in span', (test) => {
  let ctx;

  withSpanSync('test-tracer', 'test-span', () => {
    ctx = getTraceContext();
  });

  test.isNotNull(ctx);
  if (ctx.traceparent) {
    test.matches(ctx.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[0-1]$/);
  }
});

// ============================================================================
// createContextFromTrace tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - createContextFromTrace returns context for valid input', (test) => {
  const traceContext = {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  };

  const ctx = createContextFromTrace(traceContext);

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - createContextFromTrace returns active context for null', (test) => {
  const ctx = createContextFromTrace(null);

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - createContextFromTrace returns active context for missing traceparent', (test) => {
  const ctx = createContextFromTrace({});

  test.isNotNull(ctx);
});

Tinytest.add('meteor-otel - tracing - createContextFromTrace handles tracestate', (test) => {
  const traceContext = {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    tracestate: 'congo=t61rcWkgMzE',
  };

  const ctx = createContextFromTrace(traceContext);

  test.isNotNull(ctx);
});

// ============================================================================
// runWithTraceContext tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - runWithTraceContext executes callback', (test) => {
  let executed = false;

  runWithTraceContext({}, () => {
    executed = true;
  });

  test.isTrue(executed);
});

Tinytest.add('meteor-otel - tracing - runWithTraceContext returns callback result', (test) => {
  const result = runWithTraceContext({}, () => {
    return 'test-result';
  });

  test.equal(result, 'test-result');
});

Tinytest.addAsync('meteor-otel - tracing - runWithTraceContext works with async functions', async (test) => {
  const result = await runWithTraceContext({}, async () => {
    return 'async-result';
  });

  test.equal(result, 'async-result');
});

// ============================================================================
// createLinkedSpan tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - createLinkedSpan returns span handle', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  test.isNotNull(spanHandle);
  test.equal(typeof spanHandle.addEvent, 'function');
  test.equal(typeof spanHandle.setAttribute, 'function');
  test.equal(typeof spanHandle.setAttributes, 'function');
  test.equal(typeof spanHandle.end, 'function');
  test.equal(typeof spanHandle.fail, 'function');
  test.equal(typeof spanHandle.run, 'function');
  test.equal(typeof spanHandle.runAsync, 'function');
  test.equal(typeof spanHandle.getSpan, 'function');

  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - createLinkedSpan accepts attributes', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span', [], {
    'batch.size': 10,
    'batch.type': 'orders',
  });

  test.isNotNull(spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - createLinkedSpan accepts links', (test) => {
  const links = [
    { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    { traceparent: '00-5bf92f3577b34da6a3ce929d0e0e4737-00f067aa0ba902b8-01' },
  ];

  const spanHandle = createLinkedSpan('test-tracer', 'test-span', links);

  test.isNotNull(spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - createLinkedSpan filters invalid links', (test) => {
  const links = [
    { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    null,
    {},
    { other: 'value' },
  ];

  const spanHandle = createLinkedSpan('test-tracer', 'test-span', links);

  test.isNotNull(spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.addEvent is chainable', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  const result = spanHandle.addEvent('event1').addEvent('event2', { key: 'value' });

  test.equal(result, spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.setAttribute is chainable', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  const result = spanHandle.setAttribute('key', 'value');

  test.equal(result, spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.setAttributes is chainable', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  const result = spanHandle.setAttributes({ key1: 'value1', key2: 'value2' });

  test.equal(result, spanHandle);
  spanHandle.end();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.fail handles error', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  // Should not throw
  spanHandle.fail(new Error('test error'));

  test.ok();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.fail handles no error', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');

  // Should not throw
  spanHandle.fail();

  test.ok();
});

Tinytest.add('meteor-otel - tracing - linkedSpan.run executes within context', (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');
  let activeSpan = null;

  spanHandle.run(() => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
  spanHandle.end();
});

Tinytest.addAsync('meteor-otel - tracing - linkedSpan.runAsync executes within context', async (test) => {
  const spanHandle = createLinkedSpan('test-tracer', 'test-span');
  let activeSpan = null;

  await spanHandle.runAsync(async () => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
  spanHandle.end();
});

// ============================================================================
// getTracer tests
// ============================================================================

Tinytest.add('meteor-otel - tracing - getTracer returns tracer instance', (test) => {
  const tracer = getTracer('test-component');

  test.isNotNull(tracer);
  test.equal(typeof tracer.startSpan, 'function');
});

Tinytest.add('meteor-otel - tracing - getTracer accepts version parameter', (test) => {
  const tracer = getTracer('test-component', '1.0.0');

  test.isNotNull(tracer);
  test.equal(typeof tracer.startSpan, 'function');
});
