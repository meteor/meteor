# meteor-otel

OpenTelemetry instrumentation package for Meteor applications. Provides tracing, metrics, and DDP instrumentation out of the box.

## Installation

```bash
meteor add meteor-otel
```

For DDP instrumentation (optional but recommended):
```bash
meteor add meteorx:meteorx
```

## Quick Start

```javascript
// server/main.js - import FIRST, before other imports
import { initOtel } from 'meteor/meteor-otel';

initOtel();

// Rest of your imports...
import { Meteor } from 'meteor/meteor';
```

## Configuration

Configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_SERVICE_NAME` | `meteor-app` | Service name for telemetry |
| `OTEL_DEBUG` | `0` | Set to `1` for verbose logging |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Base OTLP endpoint |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `{endpoint}/v1/traces` | Traces endpoint |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | `{endpoint}/v1/metrics` | Metrics endpoint |
| `OTEL_METRICS_EXPORT_INTERVAL_MS` | `1000` | Metrics export interval |
| `OTEL_HOST_METRICS_ENABLED` | `1` | Set to `0` to disable host metrics |
| `OTEL_RUNTIME_METRICS_ENABLED` | `1` | Set to `0` to disable Node.js runtime metrics |

Or programmatically:

```javascript
initOtel({
  serviceName: 'my-app',
  resourceAttributes: {
    'deployment.environment': 'production',
    'service.version': '1.0.0',
  },
});
```

## Features

### 1. Automatic Instrumentation

Out of the box, the package provides:
- **Host metrics**: CPU, memory, network, disk
- **Node.js runtime metrics**: Event loop, GC, heap usage

### 2. DDP Roundtrip Tracing

Track the full roundtrip from method call to DDP publish:

```javascript
import { createRoundtripTracer } from 'meteor/meteor-otel';

const tasksTracer = createRoundtripTracer('tasks.roundtrip');

Meteor.methods({
  async 'tasks.create'(data) {
    const roundtrip = tasksTracer.begin('tasks.create->publish', {
      'user.id': this.userId,
    });

    const doc = { _id: Random.id(), ...data };
    roundtrip.trackDocument('tasks', doc._id);

    try {
      await roundtrip.run(() => TasksCollection.insertAsync(doc));
      return doc._id;
    } catch (error) {
      roundtrip.fail(error);
      throw error;
    }
  },
});
```

### 3. Method & Publication Wrappers

Simple wrappers for automatic tracing:

```javascript
import { wrapMethod, wrapPublication } from 'meteor/meteor-otel';

Meteor.methods({
  'tasks.create': wrapMethod('tasks.create', async function(data) {
    return await TasksCollection.insertAsync(data);
  }),
});

Meteor.publish('tasks', wrapPublication('tasks', function() {
  return TasksCollection.find({ userId: this.userId });
}));
```

Every span produced by `wrapMethod`/`wrapPublication` now automatically adds safe DDP context attributes, including:

- `ddp.session.id`, `ddp.protocol.version`, and the negotiated socket URL (when available)
- `net.peer.ip` and select HTTP headers (`user-agent`, `x-forwarded-for`, `x-real-ip`, `accept-language`, `host`)
- User identifiers (`user.id`, `meteor.user.id`)
- Message metadata (`ddp.method.id`, `ddp.random_seed`) and lightweight parameter summaries (argument count + type list)
- Publication metadata (`ddp.subscription.id`, `ddp.subscription.handle`, `ddp.subscription.universal`)

These attributes make it easier to correlate traces with specific clients or subscriptions without storing full payloads.

### 4. Custom Tracing

#### Simple spans

```javascript
import { withSpan } from 'meteor/meteor-otel';

async function processOrder(orderId) {
  return withSpan('orders', 'processOrder', async () => {
    // your code here
    return result;
  }, { 'order.id': orderId });
}
```

#### Span builder for complex scenarios

```javascript
import { createSpanBuilder } from 'meteor/meteor-otel';

const builder = createSpanBuilder('my-service');

async function complexOperation() {
  const span = builder.start('complexOperation', { step: 'init' });

  try {
    span.addEvent('step1.start');
    await step1();
    span.addEvent('step1.complete');

    span.addEvent('step2.start');
    await step2();
    span.addEvent('step2.complete');

    span.success();
  } catch (error) {
    span.error(error);
    throw error;
  }
}
```

### 5. Custom Metrics

```javascript
import { createMetricsRecorder, createTimer } from 'meteor/meteor-otel';

const appMetrics = createMetricsRecorder('my-app');

// Counters
const ordersCounter = appMetrics.counter('orders.created', 'Number of orders');
ordersCounter.add(1, { type: 'subscription' });

// Histograms
const latencyHist = appMetrics.histogram('api.latency', 'API latency', 'ms');
latencyHist.record(150);

// Observable gauges (for async values)
appMetrics.observableGauge('queue.size', 'Current queue size', 'items', () => {
  return queue.length;
});

// Timers
const dbTimer = createTimer('my-app', 'db.query.duration', 'DB query duration');

async function queryDB() {
  return dbTimer.time(async () => {
    return await collection.find(query);
  }, { operation: 'find' });
}
```

## API Reference

### Initialization

- `initOtel(options?)` - Initialize OpenTelemetry
- `shutdown()` - Gracefully shutdown providers
- `getTracerProvider()` - Get the tracer provider
- `getMeterProvider()` - Get the meter provider
- `getTracer(name, version?)` - Get a tracer instance
- `getMeter(name, version?)` - Get a meter instance

### DDP Instrumentation

- `createRoundtripTracer(name)` - Create a roundtrip tracer for DDP
- `wrapMethod(name, fn)` - Wrap a Meteor method with tracing
- `wrapPublication(name, fn)` - Wrap a publication with tracing
- `installDDPHooks()` - Manually install DDP hooks

### Tracing

- `withSpan(tracer, span, fn, attrs?)` - Execute async function in span
- `withSpanSync(tracer, span, fn, attrs?)` - Execute sync function in span
- `createSpanBuilder(name)` - Create a span builder

### Metrics

- `createMetricsRecorder(name)` - Create a metrics recorder
- `simpleCounter(meter, name, desc?)` - Create a simple counter
- `simpleHistogram(meter, name, desc?, unit?)` - Create a simple histogram
- `createTimer(meter, name, desc?)` - Create a timer for measuring duration

### Re-exports

The package re-exports commonly used OpenTelemetry API items:
- `trace` - Tracing API
- `metrics` - Metrics API
- `context` - Context API
- `SpanStatusCode` - Span status codes

## License

MIT
