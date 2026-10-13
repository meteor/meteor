import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { Meteor } from 'meteor/meteor';
import { Tinytest } from 'meteor/tinytest';
import { makeTestConnection, simplePoll } from 'meteor/test-helpers';
import * as lifecycle from '../server/ddp-instrumentation.js';

Meteor.methods({
  async 'otel.echo'(value) { await Promise.resolve(); return value; },
  async 'otel.setUser'() { await this.setUserId('otel-test-user'); },
  async 'otel.error'() { throw new Meteor.Error('otel-error', 'Expected failure', 'private details'); },
});
Meteor.publish(null, function () {});
// Exercise multiple universal publications even when this package runs alone.
Meteor.publish(null, function () { this.ready(); });
Meteor.publish('otel.readyError', function () {
  this.ready();
  Meteor.setTimeout(() => this.error(new Meteor.Error('later-error', 'Failure after ready')), 10);
});
Meteor.publish('otel.ready', function () { this.ready(); });
Meteor.publish('otel.error', async function () { throw new Meteor.Error('otel-error', 'Expected failure'); });

const until = predicate => new Promise((resolve, reject) => {
  simplePoll(predicate, resolve, () => reject(new Error('Timed out waiting for telemetry')));
});

function setup(options = {}) {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const metricExporter = new InMemoryMetricExporter(1);
  const reader = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60000 });
  const meterProvider = new MeterProvider({ readers: [reader] });
  const bridge = lifecycle.startInstrumentation({
    tracer: tracerProvider.getTracer('test'),
    meter: meterProvider.getMeter('test'),
    ...options,
  });
  return {
    bridge, exporter, reader, tracerProvider,
    async close() {
      bridge.stop();
      await Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]);
    },
  };
}

Tinytest.addAsync('meteor-otel - lifecycle - traces existing async methods and sanitized errors', async (test) => {
  const f = setup();
  try {
    test.equal(await Meteor.callAsync('otel.echo', { secret: 'not captured' }), { secret: 'not captured' });
    try { await Meteor.callAsync('otel.error'); } catch (error) { test.equal(error.error, 'otel-error'); }
    const spans = f.exporter.getFinishedSpans();
    test.equal(spans.length, 2);
    test.equal(spans[0].name, 'method:otel.echo');
    test.equal(spans[0].status.code, SpanStatusCode.OK);
    test.equal(spans[0].attributes['ddp.method.params.length'], 1);
    test.equal(spans[1].status.code, SpanStatusCode.ERROR);
    test.isFalse(JSON.stringify(spans.map(s => [s.attributes, s.events])).includes('private details'));
    test.isFalse(JSON.stringify(spans.map(s => s.attributes)).includes('not captured'));
    test.matches(spans[0].spanContext().traceId, /^[0-9a-f]{32}$/);
    const data = await f.reader.collect();
    const duration = data.resourceMetrics.scopeMetrics.flatMap(s => s.metrics).find(m => m.descriptor.name === 'meteor.method.duration');
    test.equal(duration.dataPoints.length, 2);
    test.equal(duration.dataPoints[0].value.count, 1);
    test.isUndefined(duration.dataPoints[0].attributes['user.id']);
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - concurrent calls retain separate invocation spans', async (test) => {
  const f = setup();
  const name = `otel.concurrent.${Date.now()}`;
  Meteor.methods({ [name]: async function (value) {
    const before = f.bridge.getInvocationSpan();
    await new Promise(resolve => setTimeout(resolve, value));
    test.equal(f.bridge.getInvocationSpan(), before);
    return before.spanContext().spanId;
  } });
  try {
    const ids = await Promise.all([Meteor.callAsync(name, 5), Meteor.callAsync(name, 10)]);
    test.notEqual(ids[0], ids[1]);
    test.equal(f.exporter.getFinishedSpans().length, 2);
    test.isUndefined(f.bridge.getInvocationSpan());
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - observes DDP publications and connection metrics', async (test) => {
  const f = setup();
  let client;
  try {
    [client] = await new Promise(resolve => makeTestConnection(test, (...args) => resolve(args)));
    test.equal(await client.callAsync('otel.echo', 42), 42);
    const sub = await new Promise((resolve, reject) => {
      const handle = client.subscribe('otel.ready', { onReady: () => resolve(handle), onError: reject });
    });
    const ready = f.exporter.getFinishedSpans().find(s => s.name === 'publish:otel.ready');
    test.isUndefined(ready, 'subscription span stays open after ready');
    sub.stop();
    await until(() => f.exporter.getFinishedSpans().some(s => s.name === 'publish:otel.ready'));
    const span = f.exporter.getFinishedSpans().find(s => s.name === 'publish:otel.ready');
    test.isTrue(!!span);
    test.equal(span.events[0].name, 'publication.ready');
    test.equal(span.status.code, SpanStatusCode.OK);
    await new Promise(resolve => client.subscribe('otel.error', { onError: resolve }));
    test.equal(f.exporter.getFinishedSpans().filter(s => s.name === 'publish:otel.error').length, 1);
    const data = await f.reader.collect();
    const connections = data.resourceMetrics.scopeMetrics.flatMap(s => s.metrics).find(m => m.descriptor.name === 'meteor.ddp.connections');
    test.isTrue(connections.dataPoints.some(p => p.attributes.state === 'open' && p.value >= 1));
  } finally { client?.disconnect(); await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - filters start events and stops listeners idempotently', async (test) => {
  const f = setup({ filter: e => e.name === 'otel.error' });
  try {
    await Meteor.callAsync('otel.echo', 42);
    test.equal(f.exporter.getFinishedSpans().length, 0);
    f.bridge.stop(); f.bridge.stop();
    try { await Meteor.callAsync('otel.error'); } catch { /* expected */ }
    test.equal(f.exporter.getFinishedSpans().length, 0);
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - timeout and capacity end spans without changing results', async (test) => {
  const f = setup({ maxPendingSpans: 1, spanTimeoutMs: 10 });
  const name = `otel.slow.${Date.now()}`;
  Meteor.methods({ [name]: async function () { await new Promise(resolve => setTimeout(resolve, 30)); return 42; } });
  try {
    test.equal(await Promise.all([Meteor.callAsync(name), Meteor.callAsync(name)]), [42, 42]);
    const spans = f.exporter.getFinishedSpans();
    test.equal(spans.length, 2);
    test.isTrue(spans.every(s => s.attributes['meteor.instrumentation.incomplete']));
    test.equal(spans.map(s => s.attributes['meteor.instrumentation.end_reason']).sort(), ['capacity', 'timeout']);
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - observer callback failure leaves handler intact', async (test) => {
  const f = setup({ attributes: () => { throw new Error('observer failure'); } });
  try {
    test.equal(await Meteor.callAsync('otel.echo', 42), 42);
    test.equal(f.exporter.getFinishedSpans().length, 0);
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - nested calls preserve outer lookup and explicit child parent', async (test) => {
  const f = setup();
  const name = `otel.parent.${Date.now()}`;
  Meteor.methods({ [name]: async function () {
    const parent = f.bridge.getInvocationSpan();
    await Meteor.callAsync('otel.echo', 42);
    test.equal(f.bridge.getInvocationSpan(), parent);
    const child = f.tracerProvider.getTracer('manual').startSpan('manual-child', {}, trace.setSpan(context.active(), parent));
    child.end();
    return parent.spanContext().spanId;
  } });
  try {
    const parentId = await Meteor.callAsync(name);
    const spans = f.exporter.getFinishedSpans();
    test.equal(spans.length, 3);
    test.equal(spans.find(s => s.name === 'manual-child').parentSpanContext.spanId, parentId);
  } finally { await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - shutdown ends pending span only once', async (test) => {
  const f = setup();
  const name = `otel.shutdown.${Date.now()}`;
  Meteor.methods({ [name]: function () { f.bridge.stop(); f.bridge.stop(); return 42; } });
  try {
    test.equal(await Meteor.callAsync(name), 42);
    const spans = f.exporter.getFinishedSpans();
    test.equal(spans.length, 1);
    test.equal(spans[0].attributes['meteor.instrumentation.end_reason'], 'shutdown');
    test.equal(spans[0].status.code, SpanStatusCode.UNSET);
  } finally { await f.close(); }
});

Tinytest.add('meteor-otel - lifecycle - rejects unbounded capacity and invalid timers', test => {
  for (const maxPendingSpans of [0, -1, 1.5, Infinity, NaN]) {
    test.throws(() => lifecycle.startInstrumentation({ maxPendingSpans }));
  }
  for (const spanTimeoutMs of [0, -1, Infinity, NaN, 2147483648]) {
    test.throws(() => lifecycle.startInstrumentation({ spanTimeoutMs }));
  }
});

Tinytest.addAsync('meteor-otel - lifecycle - errors after ready finish exactly one publication span', async test => {
  const f = setup({ filter: e => e.name === 'otel.readyError' });
  let client;
  try {
    [client] = await new Promise(resolve => makeTestConnection(test, (...args) => resolve(args)));
    await new Promise(resolve => client.subscribe('otel.readyError', { onError: resolve }));
    const spans = f.exporter.getFinishedSpans();
    test.equal(spans.length, 1);
    test.equal(spans[0].events[0].name, 'publication.ready');
    test.equal(spans[0].status.code, SpanStatusCode.ERROR);
  } finally { client?.disconnect(); await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - universal publications close on disconnect', async test => {
  const starts = [];
  const f = setup({ filter: event => {
    if (event.name != null) return false;
    starts.push(event);
    return true;
  } });
  let client;
  try {
    let server;
    [client, server] = await new Promise(resolve => makeTestConnection(test, (...args) => resolve(args)));
    // Other packages can register universal publications in the full suite.
    // Every publication on this connection must end exactly once.
    const expectedIds = starts.filter(e => e.connectionId === server.id).map(e => e.spanId).sort();
    const sessionSpans = () => f.exporter.getFinishedSpans().filter(s => s.attributes['ddp.session.id'] === server.id);
    test.isTrue(expectedIds.length >= 2);
    test.equal(sessionSpans().length, 0, 'universal publication spans stay open until disconnect');
    client.disconnect();
    await until(() => sessionSpans().length >= expectedIds.length);
    const spans = sessionSpans();
    test.equal(spans.map(s => s.attributes['meteor.instrumentation.span_id']).sort(), expectedIds);
    test.isTrue(spans.every(s => s.name === 'publish:<universal>' && s.status.code === SpanStatusCode.OK));
    test.isTrue(spans.some(s => s.events.length === 0), 'the no-ready fixture closes without a ready event');
  } finally { client?.disconnect(); await f.close(); }
});

Tinytest.addAsync('meteor-otel - lifecycle - user changes create a new span for the same subscription', async test => {
  const f = setup({ filter: e => e.name === 'otel.ready' });
  let client;
  try {
    [client] = await new Promise(resolve => makeTestConnection(test, (...args) => resolve(args)));
    const sub = await new Promise((resolve, reject) => {
      const handle = client.subscribe('otel.ready', { onReady: () => resolve(handle), onError: reject });
    });
    await client.callAsync('otel.setUser');
    sub.stop();
    await until(() => f.exporter.getFinishedSpans().length === 2);
    const [first, second] = f.exporter.getFinishedSpans();
    test.equal(first.attributes['ddp.subscription.id'], second.attributes['ddp.subscription.id']);
    test.notEqual(first.attributes['meteor.instrumentation.span_id'], second.attributes['meteor.instrumentation.span_id']);
    test.equal(first.status.code, SpanStatusCode.OK);
    test.equal(second.status.code, SpanStatusCode.OK);
  } finally { client?.disconnect(); await f.close(); }
});
