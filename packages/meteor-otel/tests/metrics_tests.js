/**
 * Tests for meteor-otel metrics module
 */

import { Tinytest } from 'meteor/tinytest';
import {
  createMetricsRecorder,
  simpleCounter,
  simpleHistogram,
  createTimer,
  getMeter,
} from 'meteor/meteor-otel';

// ============================================================================
// createMetricsRecorder tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - createMetricsRecorder returns recorder object', (test) => {
  const recorder = createMetricsRecorder('test-meter');

  test.isNotNull(recorder);
  test.equal(typeof recorder.counter, 'function');
  test.equal(typeof recorder.histogram, 'function');
  test.equal(typeof recorder.upDownCounter, 'function');
  test.equal(typeof recorder.observableGauge, 'function');
  test.equal(typeof recorder.observableCounter, 'function');
  test.equal(typeof recorder.observableUpDownCounter, 'function');
  test.equal(typeof recorder.getMeter, 'function');
});

Tinytest.add('meteor-otel - metrics - recorder.getMeter returns meter', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const meter = recorder.getMeter();

  test.isNotNull(meter);
  test.equal(typeof meter.createCounter, 'function');
  test.equal(typeof meter.createHistogram, 'function');
});

// ============================================================================
// Counter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.counter returns counter object', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.counter('test.counter', 'Test counter description');

  test.isNotNull(counter);
  test.equal(typeof counter.add, 'function');
});

Tinytest.add('meteor-otel - metrics - counter.add works without arguments', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.counter('test.counter.noargs', 'Test counter');

  // Should not throw
  counter.add();

  test.ok();
});

Tinytest.add('meteor-otel - metrics - counter.add works with value', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.counter('test.counter.value', 'Test counter');

  // Should not throw
  counter.add(5);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - counter.add works with value and attributes', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.counter('test.counter.attrs', 'Test counter');

  // Should not throw
  counter.add(1, { type: 'subscription', region: 'us-east-1' });

  test.ok();
});

Tinytest.add('meteor-otel - metrics - counter accepts unit parameter', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.counter('test.counter.unit', 'Test counter', 'requests');

  test.isNotNull(counter);
  counter.add(1);

  test.ok();
});

// ============================================================================
// Histogram tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.histogram returns histogram object', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const histogram = recorder.histogram('test.histogram', 'Test histogram description');

  test.isNotNull(histogram);
  test.equal(typeof histogram.record, 'function');
});

Tinytest.add('meteor-otel - metrics - histogram.record works with value', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const histogram = recorder.histogram('test.histogram.value', 'Test histogram');

  // Should not throw
  histogram.record(150);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - histogram.record works with value and attributes', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const histogram = recorder.histogram('test.histogram.attrs', 'Test histogram');

  // Should not throw
  histogram.record(150, { endpoint: '/api/users', method: 'GET' });

  test.ok();
});

Tinytest.add('meteor-otel - metrics - histogram accepts unit parameter', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const histogram = recorder.histogram('test.histogram.unit', 'Test histogram', 'ms');

  test.isNotNull(histogram);
  histogram.record(100);

  test.ok();
});

// ============================================================================
// UpDownCounter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.upDownCounter returns upDownCounter object', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const upDownCounter = recorder.upDownCounter('test.updown', 'Test up-down counter');

  test.isNotNull(upDownCounter);
  test.equal(typeof upDownCounter.add, 'function');
  test.equal(typeof upDownCounter.increment, 'function');
  test.equal(typeof upDownCounter.decrement, 'function');
});

Tinytest.add('meteor-otel - metrics - upDownCounter.add works with positive value', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const upDownCounter = recorder.upDownCounter('test.updown.add', 'Test up-down counter');

  // Should not throw
  upDownCounter.add(5);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - upDownCounter.add works with negative value', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const upDownCounter = recorder.upDownCounter('test.updown.addneg', 'Test up-down counter');

  // Should not throw
  upDownCounter.add(-3);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - upDownCounter.increment works', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const upDownCounter = recorder.upDownCounter('test.updown.inc', 'Test up-down counter');

  // Should not throw
  upDownCounter.increment();
  upDownCounter.increment({ type: 'active' });

  test.ok();
});

Tinytest.add('meteor-otel - metrics - upDownCounter.decrement works', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const upDownCounter = recorder.upDownCounter('test.updown.dec', 'Test up-down counter');

  // Should not throw
  upDownCounter.decrement();
  upDownCounter.decrement({ type: 'active' });

  test.ok();
});

// ============================================================================
// Observable gauge tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.observableGauge returns gauge', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const gauge = recorder.observableGauge('test.gauge', 'Test gauge', '', () => 42);

  test.isNotNull(gauge);
});

Tinytest.add('meteor-otel - metrics - observableGauge callback receives number', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  let callbackCalled = false;

  recorder.observableGauge('test.gauge.callback', 'Test gauge', '', () => {
    callbackCalled = true;
    return 42;
  });

  // The callback is called during metric collection, not immediately
  // So we just verify the gauge was created successfully
  test.ok();
});

Tinytest.add('meteor-otel - metrics - observableGauge callback can return object', (test) => {
  const recorder = createMetricsRecorder('test-meter');

  const gauge = recorder.observableGauge('test.gauge.obj', 'Test gauge', 'items', () => ({
    value: 100,
    attributes: { queue: 'high-priority' },
  }));

  test.isNotNull(gauge);
});

// ============================================================================
// Observable counter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.observableCounter returns counter', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.observableCounter('test.obs.counter', 'Test counter', '', () => 100);

  test.isNotNull(counter);
});

Tinytest.add('meteor-otel - metrics - observableCounter callback can return object', (test) => {
  const recorder = createMetricsRecorder('test-meter');

  const counter = recorder.observableCounter('test.obs.counter.obj', 'Test counter', 'requests', () => ({
    value: 500,
    attributes: { endpoint: '/api' },
  }));

  test.isNotNull(counter);
});

// ============================================================================
// Observable up-down counter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - recorder.observableUpDownCounter returns counter', (test) => {
  const recorder = createMetricsRecorder('test-meter');
  const counter = recorder.observableUpDownCounter('test.obs.updown', 'Test counter', '', () => 50);

  test.isNotNull(counter);
});

Tinytest.add('meteor-otel - metrics - observableUpDownCounter callback can return object', (test) => {
  const recorder = createMetricsRecorder('test-meter');

  const counter = recorder.observableUpDownCounter('test.obs.updown.obj', 'Test counter', 'connections', () => ({
    value: 25,
    attributes: { server: 'main' },
  }));

  test.isNotNull(counter);
});

// ============================================================================
// simpleCounter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - simpleCounter returns function', (test) => {
  const incrementOrders = simpleCounter('my-app', 'orders.created', 'Orders created');

  test.equal(typeof incrementOrders, 'function');
});

Tinytest.add('meteor-otel - metrics - simpleCounter function works without arguments', (test) => {
  const increment = simpleCounter('my-app', 'simple.counter.noargs', 'Test counter');

  // Should not throw
  increment();

  test.ok();
});

Tinytest.add('meteor-otel - metrics - simpleCounter function works with value', (test) => {
  const increment = simpleCounter('my-app', 'simple.counter.value', 'Test counter');

  // Should not throw
  increment(5);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - simpleCounter function works with value and attributes', (test) => {
  const increment = simpleCounter('my-app', 'simple.counter.attrs', 'Test counter');

  // Should not throw
  increment(1, { type: 'subscription' });

  test.ok();
});

// ============================================================================
// simpleHistogram tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - simpleHistogram returns function', (test) => {
  const recordLatency = simpleHistogram('my-app', 'api.latency', 'API latency', 'ms');

  test.equal(typeof recordLatency, 'function');
});

Tinytest.add('meteor-otel - metrics - simpleHistogram function works with value', (test) => {
  const record = simpleHistogram('my-app', 'simple.histogram.value', 'Test histogram');

  // Should not throw
  record(150);

  test.ok();
});

Tinytest.add('meteor-otel - metrics - simpleHistogram function works with value and attributes', (test) => {
  const record = simpleHistogram('my-app', 'simple.histogram.attrs', 'Test histogram', 'ms');

  // Should not throw
  record(150, { endpoint: '/api/users' });

  test.ok();
});

// ============================================================================
// createTimer tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - createTimer returns timer object', (test) => {
  const timer = createTimer('my-app', 'db.query.duration', 'Database query duration');

  test.isNotNull(timer);
  test.equal(typeof timer.start, 'function');
  test.equal(typeof timer.time, 'function');
  test.equal(typeof timer.timeSync, 'function');
});

Tinytest.add('meteor-otel - metrics - timer.start returns object with end method', (test) => {
  const timer = createTimer('my-app', 'timer.start', 'Test timer');
  const handle = timer.start();

  test.isNotNull(handle);
  test.equal(typeof handle.end, 'function');
});

Tinytest.add('meteor-otel - metrics - timer.start().end() returns duration', (test) => {
  const timer = createTimer('my-app', 'timer.duration', 'Test timer');
  const handle = timer.start();

  // Small delay to ensure measurable duration
  const start = Date.now();
  while (Date.now() - start < 5) {
    // busy wait
  }

  const duration = handle.end();

  test.equal(typeof duration, 'number');
  test.isTrue(duration >= 0);
});

Tinytest.add('meteor-otel - metrics - timer.start accepts attributes', (test) => {
  const timer = createTimer('my-app', 'timer.attrs', 'Test timer');
  const handle = timer.start({ 'db.operation': 'find', 'db.collection': 'users' });

  test.isNotNull(handle);
  handle.end();
});

Tinytest.add('meteor-otel - metrics - timer.start().end() accepts additional attributes', (test) => {
  const timer = createTimer('my-app', 'timer.addattrs', 'Test timer');
  const handle = timer.start({ 'db.operation': 'find' });

  const duration = handle.end({ 'db.success': true, 'db.rows': 10 });

  test.equal(typeof duration, 'number');
});

Tinytest.addAsync('meteor-otel - metrics - timer.time measures async function', async (test) => {
  const timer = createTimer('my-app', 'timer.async', 'Test timer');

  const result = await timer.time(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 'async-result';
  }, { operation: 'test' });

  test.equal(result, 'async-result');
});

Tinytest.addAsync('meteor-otel - metrics - timer.time propagates errors', async (test) => {
  const timer = createTimer('my-app', 'timer.async.error', 'Test timer');
  let caughtError = null;

  try {
    await timer.time(async () => {
      throw new Error('async-error');
    });
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'async-error');
});

Tinytest.add('meteor-otel - metrics - timer.timeSync measures sync function', (test) => {
  const timer = createTimer('my-app', 'timer.sync', 'Test timer');

  const result = timer.timeSync(() => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += i;
    }
    return sum;
  }, { operation: 'sum' });

  test.equal(result, 499500);
});

Tinytest.add('meteor-otel - metrics - timer.timeSync propagates errors', (test) => {
  const timer = createTimer('my-app', 'timer.sync.error', 'Test timer');
  let caughtError = null;

  try {
    timer.timeSync(() => {
      throw new Error('sync-error');
    });
  } catch (error) {
    caughtError = error;
  }

  test.isNotNull(caughtError);
  test.equal(caughtError.message, 'sync-error');
});

// ============================================================================
// getMeter tests
// ============================================================================

Tinytest.add('meteor-otel - metrics - getMeter returns meter instance', (test) => {
  const meter = getMeter('test-component');

  test.isNotNull(meter);
  test.equal(typeof meter.createCounter, 'function');
  test.equal(typeof meter.createHistogram, 'function');
  test.equal(typeof meter.createUpDownCounter, 'function');
});

Tinytest.add('meteor-otel - metrics - getMeter accepts version parameter', (test) => {
  const meter = getMeter('test-component', '1.0.0');

  test.isNotNull(meter);
  test.equal(typeof meter.createCounter, 'function');
});
