---
title: Basic Instrumentation
description: Export Meteor 3.6 lifecycle events as OpenTelemetry traces and metrics
---

# Basic Instrumentation

The server-only `meteor-otel` package consumes the public
[Instrumentation API](/api/instrumentation) introduced in Meteor 3.6. It creates
traces for methods and publications, and metrics for invocation durations and
DDP connections. It does not modify handlers or patch DDP internals.

## Initialize

```sh
meteor add meteor-otel
```

```js
// server/telemetry.js
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
  resourceAttributes: {
    'deployment.environment.name': process.env.NODE_ENV || 'development',
  },
});
```

```js
// server/main.js
import './telemetry.js';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { LinksCollection } from '/imports/api/links';

Meteor.methods({
  async 'links.insert'(url) {
    check(url, String);
    return LinksCollection.insertAsync({ url, createdAt: new Date() });
  },
});

Meteor.publish('links', function () {
  return LinksCollection.find();
});
```

Initialize before accepting application traffic. Methods/publications may be
registered before `initOtel()`; listeners observe subsequent invocations. Repeated
initialization returns the existing providers without adding duplicate listeners.

By default the OTLP/HTTP exporters send to `http://localhost:4318/v1/traces` and
`http://localhost:4318/v1/metrics`. Override `OTEL_EXPORTER_OTLP_ENDPOINT` or the
signal-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. See [Infrastructure Setup](./otel-infrastructure.md)
for a local collector and visualization stack.

## What is measured

| Event sequence | Result |
| --- | --- |
| `method.start` → `method.end` | `method:links.insert`, successful span |
| `method.start` → `method.error` | Method span with error status and sanitized exception |
| `publication.start` → `publication.ready` → `publication.stop` | `publish:links`, subscription lifetime span with ready event |
| `publication.error` | Ends the subscription span with error status |
| `ddp.connection.open/close` | Counters by state and connection lifetime histogram |

Spans include operation names (`ddp.method.name` / `ddp.publication.name`),
argument counts, and available connection/subscription IDs. Meteor event IDs are
stored as `meteor.instrumentation.trace_id` and `meteor.instrumentation.span_id`;
the SDK generates separate OpenTelemetry IDs. They are not interchangeable.

Metrics are `meteor.method.duration`, `meteor.publication.duration`,
`meteor.ddp.connections`, and `meteor.ddp.connection.duration`. Durations use
milliseconds. Duration metrics label `name` and `outcome` (`ok`/`error`), and the
connection counter labels `state` (`open`/`close`). IDs are never metric labels.

In Grafana/Tempo, for example:

```traceql
{ resource.service.name = "meteor-app" && name = "method:links.insert" }
```

## Selective tracing and privacy

```js
initOtel({
  meteorInstrumentation: {
    filter: event => event.name?.startsWith('links') === true,
    attributes: event => ({ 'app.operation': event.name }),
    maxPendingSpans: 10000,
    spanTimeoutMs: 30 * 60 * 1000,
  },
  spanProcessor: { maxQueueSize: 2048, maxExportBatchSize: 512 },
});
```

The filter and attributes callbacks run at invocation start. They receive the
public event, with the instrumentation package's redaction policy applied. The
filter affects methods/publications; connection metrics remain enabled. Set
`meteorInstrumentation: false` to turn off the entire Meteor observer.

Arguments, results, headers, IPs and user IDs are not exported by default.
The observer leaves `Instrumentation.configure()` untouched. Explicitly exporting
additional event fields through `attributes` is an application decision.

Pending spans are bounded by both capacity and age. Eviction, timeout, disconnect,
and shutdown mark unfinished spans as incomplete and record an end reason;
these are not application errors and do not enter duration histograms. Set a
longer timeout for long-lived subscriptions. A span that timed out is not reopened
by subsequent ready/stop/error events.

## Shutdown and custom instrumentations

Call `await shutdown()` from `meteor/meteor-otel` before process exit. It detaches
listeners, closes pending spans, disables registered instrumentations and flushes
providers. Initialization is once per process; restart the process to initialize
after shutdown.

The package also supports `instrumentations: [...]` for OpenTelemetry plugins.
HTTP/MongoDB plugins may need to load before Meteor loads those modules. An
application bootstrap module alone cannot guarantee that. Automatic Meteor
lifecycle tracing works independently of module patching. Optional host/runtime
metrics can be disabled with `OTEL_HOST_METRICS_ENABLED=0` and
`OTEL_RUNTIME_METRICS_ENABLED=0`.

## Migrating from the prototype

Remove the old `{ otel: true }` registration option and method/publication
wrappers. Replace convenience tracing and metric helpers with the OTel API shown
in [Advanced Features](./otel-advanced.md).

Document roundtrip tracing is not supported by the lifecycle API. The former
`createRoundtripTracer` / `installDDPHooks` APIs have been removed along with their
DDP patches. Measuring actual client delivery requires an application-level
acknowledgment; publication readiness only reports server-side readiness.
