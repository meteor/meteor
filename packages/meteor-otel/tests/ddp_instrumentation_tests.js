/**
 * Tests for meteor-otel DDP instrumentation module
 */

import { Tinytest } from 'meteor/tinytest';
import {
  createRoundtripTracer,
  wrapMethod,
  wrapPublication,
  getActiveSpan,
  addEvent,
  setAttribute,
  setAttributes,
  recordException,
  setSpanError,
  trace,
  context,
  withSpanSync,
} from 'meteor/meteor-otel';

// ============================================================================
// createRoundtripTracer tests
// ============================================================================

Tinytest.add('meteor-otel - ddp - createRoundtripTracer returns tracer object', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');

  test.isNotNull(tracer);
  test.equal(typeof tracer.begin, 'function');
});

Tinytest.add('meteor-otel - ddp - roundtripTracer.begin returns handle object', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  test.isNotNull(handle);
  test.equal(typeof handle.trackDocument, 'function');
  test.equal(typeof handle.fail, 'function');
  test.equal(typeof handle.run, 'function');
  test.equal(typeof handle.addEvent, 'function');
  test.equal(typeof handle.setAttribute, 'function');
  test.equal(typeof handle.end, 'function');

  // Clean up - end the span
  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripTracer.begin accepts attributes', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation', {
    'user.id': 'user123',
    'session.id': 'session456',
  });

  test.isNotNull(handle);
  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripTracer.begin accepts timeout', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation', {}, 5000);

  test.isNotNull(handle);
  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.trackDocument works', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw
  handle.trackDocument('tasks', 'doc123');

  // Clean up - fail to remove from pending and end span
  handle.fail();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.trackDocument handles undefined docId', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw with undefined docId
  handle.trackDocument('tasks', undefined);

  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.fail ends span with error', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw
  handle.fail(new Error('test error'));

  test.ok();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.fail works without error', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw
  handle.fail();

  test.ok();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.run executes within context', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');
  let activeSpan = null;

  handle.run(() => {
    activeSpan = trace.getSpan(context.active());
  });

  test.isNotNull(activeSpan);
  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.addEvent works', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw
  handle.addEvent('checkpoint', { step: 1, status: 'processing' });

  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.setAttribute works', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');

  // Should not throw
  handle.setAttribute('custom.key', 'custom-value');

  handle.end();
});

Tinytest.add('meteor-otel - ddp - roundtripHandle.end ends span successfully', (test) => {
  const tracer = createRoundtripTracer('test.roundtrip');
  const handle = tracer.begin('test-operation');
  handle.trackDocument('tasks', 'doc123');

  // Should not throw - ends span without waiting for DDP
  handle.end();

  test.ok();
});

// ============================================================================
// wrapMethod tests
// ============================================================================

Tinytest.add('meteor-otel - ddp - wrapMethod returns function', (test) => {
  const wrappedMethod = wrapMethod('test.method', async function () {
    return 'result';
  });

  test.equal(typeof wrappedMethod, 'function');
});

Tinytest.addAsync('meteor-otel - ddp - wrapMethod executes original function', async (test) => {
  let executed = false;

  const wrappedMethod = wrapMethod('test.method.exec', async function () {
    executed = true;
    return 'method-result';
  });

  const result = await wrappedMethod.call({});

  test.isTrue(executed);
  test.equal(result, 'method-result');
});

Tinytest.addAsync('meteor-otel - ddp - wrapMethod passes arguments', async (test) => {
  const wrappedMethod = wrapMethod('test.method.args', async function (a, b, c) {
    return { a, b, c };
  });

  const result = await wrappedMethod.call({}, 1, 'two', { three: 3 });

  test.equal(result.a, 1);
  test.equal(result.b, 'two');
  test.equal(result.c.three, 3);
});

Tinytest.addAsync('meteor-otel - ddp - wrapMethod preserves this context', async (test) => {
  const wrappedMethod = wrapMethod('test.method.this', async function () {
    return this.userId;
  });

  const mockContext = { userId: 'user123' };
  const result = await wrappedMethod.call(mockContext);

  test.equal(result, 'user123');
});

Tinytest.addAsync('meteor-otel - ddp - wrapMethod propagates errors', async (test) => {
  const wrappedMethod = wrapMethod('test.method.error', async function () {
    throw new Error('method-error');
  });

  let caughtError = null;

  try {
    await wrappedMethod.call({});
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'method-error');
});

Tinytest.addAsync('meteor-otel - ddp - wrapMethod creates span context', async (test) => {
  let activeSpan = null;

  const wrappedMethod = wrapMethod('test.method.span', async function () {
    activeSpan = trace.getSpan(context.active());
    return 'ok';
  });

  await wrappedMethod.call({});

  test.isNotNull(activeSpan);
});

// ============================================================================
// wrapPublication tests
// ============================================================================

Tinytest.add('meteor-otel - ddp - wrapPublication returns function', (test) => {
  const wrappedPub = wrapPublication('test.pub', function () {
    return [];
  });

  test.equal(typeof wrappedPub, 'function');
});

Tinytest.add('meteor-otel - ddp - wrapPublication executes original function', (test) => {
  let executed = false;

  const wrappedPub = wrapPublication('test.pub.exec', function () {
    executed = true;
    return [];
  });

  wrappedPub.call({});

  test.isTrue(executed);
});

Tinytest.add('meteor-otel - ddp - wrapPublication passes arguments', (test) => {
  let receivedArgs = null;

  const wrappedPub = wrapPublication('test.pub.args', function (filter, limit) {
    receivedArgs = { filter, limit };
    return [];
  });

  wrappedPub.call({}, { status: 'active' }, 10);

  test.isNotNull(receivedArgs);
  test.equal(receivedArgs.filter.status, 'active');
  test.equal(receivedArgs.limit, 10);
});

Tinytest.add('meteor-otel - ddp - wrapPublication preserves this context', (test) => {
  let capturedUserId = null;

  const wrappedPub = wrapPublication('test.pub.this', function () {
    capturedUserId = this.userId;
    return [];
  });

  const mockContext = { userId: 'pub-user-123' };
  wrappedPub.call(mockContext);

  test.equal(capturedUserId, 'pub-user-123');
});

Tinytest.add('meteor-otel - ddp - wrapPublication propagates errors', (test) => {
  const wrappedPub = wrapPublication('test.pub.error', function () {
    throw new Error('pub-error');
  });

  let caughtError = null;

  try {
    wrappedPub.call({});
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'pub-error');
});

Tinytest.add('meteor-otel - ddp - wrapPublication creates span context', (test) => {
  let activeSpan = null;

  const wrappedPub = wrapPublication('test.pub.span', function () {
    activeSpan = trace.getSpan(context.active());
    return [];
  });

  wrappedPub.call({});

  test.isNotNull(activeSpan);
});

// ============================================================================
// Active span utilities tests
// ============================================================================


Tinytest.add('meteor-otel - ddp - getActiveSpan returns span inside context', (test) => {
  let activeSpan = null;

  withSpanSync('test-tracer', 'test-span', () => {
    activeSpan = getActiveSpan();
  });

  test.isNotNull(activeSpan);
});

Tinytest.add('meteor-otel - ddp - addEvent works inside span', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    addEvent('test-event', { key: 'value' });
  });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - addEvent does not throw outside span', (test) => {
  // Should not throw even without active span
  addEvent('test-event', { key: 'value' });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setAttribute works inside span', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    setAttribute('test.key', 'test-value');
  });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setAttribute does not throw outside span', (test) => {
  // Should not throw even without active span
  setAttribute('test.key', 'test-value');

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setAttributes works inside span', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    setAttributes({
      'test.key1': 'value1',
      'test.key2': 'value2',
      'test.number': 42,
    });
  });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setAttributes does not throw outside span', (test) => {
  // Should not throw even without active span
  setAttributes({ 'test.key': 'value' });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - recordException works inside span', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    recordException(new Error('test exception'));
  });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - recordException does not throw outside span', (test) => {
  // Should not throw even without active span
  recordException(new Error('test exception'));

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setSpanError works inside span', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    setSpanError(new Error('test error'));
  });

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setSpanError does not throw outside span', (test) => {
  // Should not throw even without active span
  setSpanError(new Error('test error'));

  test.ok();
});

Tinytest.add('meteor-otel - ddp - setSpanError works with message only', (test) => {
  withSpanSync('test-tracer', 'test-span', () => {
    // Should not throw
    setSpanError('error message only');
  });

  test.ok();
});

// ============================================================================
// Integration-style tests
// ============================================================================

Tinytest.addAsync('meteor-otel - ddp - roundtrip flow without DDP', async (test) => {
  const tracer = createRoundtripTracer('tasks.roundtrip');

  // Simulate a method flow
  const mockMethodContext = {
    userId: 'user123',
  };

  const roundtrip = tracer.begin('tasks.insert->publish', {
    'user.id': mockMethodContext.userId,
  });

  const docId = 'doc-' + Date.now();
  roundtrip.trackDocument('tasks', docId);

  try {
    // Simulate async insert
    const result = await roundtrip.run(async () => {
      // Simulated DB operation
      await new Promise((resolve) => setTimeout(resolve, 5));
      return docId;
    });

    test.equal(result, docId);

    // End manually since we're not actually receiving DDP messages
    roundtrip.end();
  } catch (error) {
    roundtrip.fail(error);
    throw error;
  }
});

Tinytest.addAsync('meteor-otel - ddp - wrapped method with roundtrip', async (test) => {
  const tracer = createRoundtripTracer('items.roundtrip');

  const createItem = wrapMethod('items.create', async function (data) {
    const roundtrip = tracer.begin('items.create->publish', {
      'user.id': this.userId || 'anonymous',
    });

    const docId = 'item-' + Date.now();
    roundtrip.trackDocument('items', docId);

    try {
      await roundtrip.run(async () => {
        // Simulated insert
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      roundtrip.end();
      return docId;
    } catch (error) {
      roundtrip.fail(error);
      throw error;
    }
  });

  const mockContext = { userId: 'test-user' };
  const result = await createItem.call(mockContext, { name: 'Test Item' });

  test.isNotNull(result);
  test.matches(result, /^item-/);
});
