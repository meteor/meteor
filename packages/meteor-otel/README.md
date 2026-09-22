# meteor-otel

OpenTelemetry traces and metrics for Meteor 3.6 servers, built on the public
[`instrumentation`](https://docs.meteor.com/api/instrumentation) lifecycle API.
No DDP prototype patches, handler wrappers, or registration options are required.

## Quick start

```sh
meteor add meteor-otel
```

```js
// server/telemetry.js
import { initOtel } from 'meteor/meteor-otel';

initOtel({ serviceName: 'my-meteor-app' });
```

Import this module from your server entrypoint before application traffic starts.
Methods and publications registered before initialization are also observed when
subsequently invoked. `initOtel()` is idempotent and returns
`{ tracerProvider, meterProvider }`. Call `await shutdown()` before process exit
to remove listeners, end pending spans, and flush providers. Initialization is
once per process; restarting telemetry after shutdown requires a process restart.

## Automatic telemetry

| Lifecycle | Trace / metric |
| --- | --- |
| Method start → end/error | `method:<name>` span; `meteor.method.duration` histogram (ms) |
| Publication start → stop/error | `publish:<name>` span, with a `publication.ready` event; `meteor.publication.duration` histogram (ms) |
| Connection open/close | `meteor.ddp.connections` counter with `state=open/close`; `meteor.ddp.connection.duration` histogram (ms) on close |

Publication spans measure the subscription lifetime, including asynchronous setup,
not only the handler's return. Universal publications use `<universal>` as the
span name suffix. Metrics label only operation name and outcome, never user,
connection, subscription, or trace IDs.

Meteor's event IDs are correlation attributes (`meteor.instrumentation.trace_id`
and `meteor.instrumentation.span_id`), not OpenTelemetry trace/span IDs. The SDK
generates valid OTel IDs. The observer does not make its span the globally active
span: use `getInvocationSpan()` to explicitly parent manual spans inside a method
or publication (see [advanced examples](https://docs.meteor.com/performance/otel-advanced)).

## Configuration

```js
initOtel({
  serviceName: 'orders',
  resourceAttributes: { 'deployment.environment.name': 'production' },
  spanProcessor: { maxQueueSize: 2048, maxExportBatchSize: 512 },
  meteorInstrumentation: {
    // Optional: select method/publication start events to trace.
    filter: event => event.name !== 'health.check',
    // Receives only the public lifecycle event, never a request or session.
    attributes: event => ({ 'app.operation': event.name ?? 'universal' }),
    maxPendingSpans: 10000,
    spanTimeoutMs: 30 * 60 * 1000,
  },
});
```

Set `meteorInstrumentation: false` to disable the Meteor observer. Timeout,
capacity eviction, connection close, and shutdown end incomplete spans with
`meteor.instrumentation.incomplete=true` and an `end_reason` attribute; they do
not report an application error. Incomplete spans do not enter duration metrics.
After a timeout/eviction the later terminal event is ignored. Increase the timeout
if you need complete spans for subscriptions that live longer than 30 minutes.
Callbacks are synchronous; failures are isolated by the instrumentation event
emitter. The observer never changes global `Instrumentation.configure()` policy.

| Environment variable | Default |
| --- | --- |
| `OTEL_SERVICE_NAME` | `meteor-app` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `<endpoint>/v1/traces` |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | `<endpoint>/v1/metrics` |
| `OTEL_METRICS_EXPORT_INTERVAL_MS` | `1000` (positive finite values only) |
| `OTEL_HOST_METRICS_ENABLED` | `1` (set `0` to disable) |
| `OTEL_RUNTIME_METRICS_ENABLED` | `1` (set `0` to disable) |
| `OTEL_BSP_MAX_QUEUE_SIZE` | SDK default |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | SDK default |
| `OTEL_BSP_SCHEDULED_DELAY_MS` | SDK default |
| `OTEL_BSP_EXPORT_TIMEOUT_MS` | SDK default |
| `OTEL_DEBUG` | unset (set `1` for diagnostics) |

Arguments, results, headers, client IPs and user IDs are not copied into spans by
default. Error events use the instrumentation package's bounded error summary,
without stacks or details. The optional `attributes` callback can select data
from the public event; review what you export, since event user/connection IDs
and explicitly enabled argument previews can contain personal data.

## Custom instrumentations

`initOtel({ instrumentations: [...] })` registers additional OpenTelemetry
instrumentations alongside optional Node runtime metrics. HTTP/MongoDB module
patching is **not** provided automatically. Those instrumentations require setup
before their target modules load; importing a bootstrap file before application
code does not guarantee setup before Meteor's own packages load. Meteor lifecycle
tracing has no such load-order requirement.

## Public API

- `initOtel(options)`, `shutdown()`
- `getTracerProvider()`, `getMeterProvider()` (after initialization)
- `getTracer(name, version)`, `getMeter(name, version)`
- `getInvocationSpan()` (currently observed method/publication, otherwise undefined)
- `trace`, `metrics`, `context`, `propagation`, `SpanStatusCode`, `SpanKind`, `ROOT_CONTEXT`
- `getConfig()` reads environment configuration.

Use the OpenTelemetry API directly for manual spans, events, context propagation,
and metrics. This package does not prescribe error messages or metric helpers.

## Migration from the PR prototype

Remove `{ otel: true }` / `{ otel: ['method.name'] }` and `wrapMethod` /
`wrapPublication`. All invocations are observed after initialization; use the
`filter` callback above for selective tracing. Replace span-builder, `withSpan`,
active-span helpers and metric-recorder helpers with the standard OTel API.

`installDDPHooks` and `createRoundtripTracer` are removed. The 3.6 lifecycle API has
no per-document send event, so it cannot measure delivery of a particular DDP
`added` message. No document-ID queues or internal `Session.send` hooks remain.
For end-to-end delivery measurement, instrument an explicit application-level
acknowledgment. A publication's `ready` event does not prove client receipt.
