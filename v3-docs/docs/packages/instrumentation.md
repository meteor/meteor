# Instrumentation

The `instrumentation` package provides a read-only stream of server lifecycle
events for Meteor methods, publications, and DDP connections. Use it to connect
an observability tool, add application-specific metrics, or correlate logs
without patching Meteor internals.

## Installation

```bash
meteor add instrumentation
```

The package is server-only. Import its API from `meteor/instrumentation` in
server code that runs at startup:

```js
import { Instrumentation } from "meteor/instrumentation";
```

## Listen to lifecycle events

Register a listener with `Instrumentation.on`. It returns a handle whose
`stop()` method removes the listener.

```js
const handle = Instrumentation.on("method.error", (event) => {
  console.error(event.name, event.durationMs, event.error);
});

// Call when this listener is no longer needed.
handle.stop();
```

Available events cover the complete lifecycle:

- `method.start`, `method.end`, and `method.error`
- `publication.start`, `publication.ready`, `publication.stop`, and
  `publication.error`
- `ddp.connection.open` and `ddp.connection.close`

Method and publication events include identifiers such as `traceId`, `spanId`,
`connectionId`, and `userId`. Completion events also include `durationMs`, so
you can correlate a start event with its result and measure how long the work
took.

Inside a method or publication, `Instrumentation.currentContext()` returns the
same trace and connection information as the matching lifecycle event:

```js
import { Meteor } from "meteor/meteor";

Meteor.methods({
  async "orders.create"(order) {
    const { traceId } = Instrumentation.currentContext();
    console.log(traceId, "creating order");
    // ...
  },
});
```

## Common observability patterns

### Find slow methods

```js
Instrumentation.on("method.end", (event) => {
  if (event.durationMs > 200) {
    console.warn(`slow method: ${event.name} (${event.durationMs}ms)`);
  }
});
```

### Track active connections

```js
let activeConnections = 0;

Instrumentation.on("ddp.connection.open", () => {
  activeConnections += 1;
});

Instrumentation.on("ddp.connection.close", () => {
  activeConnections -= 1;
});
```

### Correlate application logs

Use `traceId` from the current context or an event to connect application logs,
metrics, and traces that belong to the same invocation. The package emits the
events but does not choose a logging, APM, or OpenTelemetry backend for you.

## Privacy and payload capture

Arguments, method results, and client IP addresses are not captured by default.
Enable only the data your observability workflow needs:

```js
Instrumentation.configure({
  captureMethodArgs: "preview",
  captureMethodResult: "preview",
  captureClientAddress: true,
});
```

::: warning Review captured data
Argument and result previews are bounded, cycle-safe snapshots, but they can
still contain application data. Client addresses are personal data. Review your
retention and access policies before enabling either option in production.
:::

Official Accounts methods that can carry credentials or tokens remain fully
redacted. For an application method, you can capture only an approved projection
instead of its complete arguments:

```js
Instrumentation.configureMethod("orders.refund", {
  captureArgs: ([orderId]) => ({ orderId }),
});
```

The projected value still passes through the bounded preview. Instrumentation
listeners are best-effort and read-only: a listener that throws or rejects does
not interrupt the method, publication, or connection being observed.

To stop all emission without changing application code, set
`METEOR_INSTRUMENTATION_DISABLED=1`. You can also use
`Instrumentation.configure({ enabled: false })` at runtime.

## API reference

See the full [Instrumentation API reference](/api/instrumentation) for event
payloads, configuration options, per-method policies, and error handling.
