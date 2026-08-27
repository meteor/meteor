# Instrumentation

Watch what your server is doing — every method call, every publication, every
DDP connection — as a stream of **read-only** events, without patching Meteor's
internals. It is the supported foundation that observability tools (OpenTelemetry,
APMs, custom logging) build on.

Reach for it when you want to answer questions like:

- How long does a given method take, and which ones fail?
- Why is a subscription stuck, or erroring?
- How many clients are connected right now?
- Where does my OpenTelemetry / APM / tracing data come from?

It is a _seam, not a stack_: core only emits events; what you do with them — log,
count, trace, export — is up to you.

To use it, add the `instrumentation` package to your project:

```bash
meteor add instrumentation
```

All the API lives on the server-only `Instrumentation` export:

```js
import { Instrumentation } from 'meteor/instrumentation';
```

## Listening to events

`Instrumentation.on(type, listener)` registers a listener for one event type and
returns a handle with a `stop()` method.

```js
// Time every method, and log the ones that fail.
Instrumentation.on('method.end', (e) => {
  console.log(`✓ ${e.name} took ${e.durationMs}ms`);
});

const handle = Instrumentation.on('method.error', (e) => {
  console.error(`✗ ${e.name} failed:`, e.error.message);
});
// handle.stop()
```

Listeners are **read-only and best-effort**: one that throws, or returns a
rejected promise, can never break the method or publication it observes, and is
never awaited. The same guarantee covers building the event itself: if a payload
cannot be constructed (say, an application error whose getters throw), the event
is emitted in a degraded form or dropped — never propagated into the observed
call. A payload is built only when at least one listener is registered for that
type, so events you don't listen to cost nothing — and with the package not
added, the hooks don't exist at all.

There are nine event types:

| Event | Fires when |
| --- | --- |
| `method.start` | a method invocation begins (before the handler runs) |
| `method.end` | a method invocation resolves successfully |
| `method.error` | a method invocation throws |
| `publication.start` | a publication's handler begins |
| `publication.ready` | a publication signals it is ready (`this.ready()`) |
| `publication.stop` | a subscription is torn down |
| `publication.error` | a publication errors (`this.error()`) |
| `ddp.connection.open` | a client opens a DDP connection |
| `ddp.connection.close` | a DDP connection closes |

A method or publication event looks like this:

```js
{
  type: 'method.start',           // canonical type — never prefixed
  eventName: 'method.start',      // = type, optionally prefixed (see configure)
  ts: 1750000000000,              // emit time, ms since epoch
  traceId: 'jhqfY9ETQsPLCHxJg',   // identifies the invocation; shared start↔end
  spanId: 'JhyAKkZmJDJzHkXH2',    // identifies this single event
  name: 'orders.create',          // the method / publication name
  connectionId: 'ML8NkBJoadu…',   // the client's DDP connection, or null
  userId: 'abc123',               // the logged-in user, or null
  argsCount: 1,                   // number of arguments passed
}
```

The `traceId` is shared between an invocation's `start` and its `end`/`error`, so
you can correlate them. Beyond the fields above:

- `durationMs` is added on `method.end`, `method.error`, `publication.ready`,
  `publication.stop` and `publication.error`.
- `subscriptionId` is added on every `publication.*` event.
- `args` and `result` appear only if you opt in — see [configuration](#configuration).
- `error` is a safe, structured summary on `*.error` (never the raw value): e.g.
  `{ name, message, error, reason }`, where `error`/`reason` come from `Meteor.Error`.

Connection events are lighter — there is no invocation behind them. They carry
`type`, `eventName`, `ts` and `connectionId`, plus `durationMs` (the connection's
lifetime) on close. The client IP is **opt-in** — `clientAddress` appears on
`ddp.connection.open` only after `configure({ captureClientAddress: true })`.

## Reading the current context

Inside a method handler or a publication, `Instrumentation.currentContext()`
returns the identifiers of the running invocation — including the **same
`traceId`** its `*.start` event carried. Use it to tie your own logs to the
emitted events.

```js
Meteor.methods({
  async 'orders.create'(order) {
    const { traceId } = Instrumentation.currentContext();
    console.log(traceId, 'creating order'); // same traceId as the method.start event
    // ...
  },
});
```

It returns `{ traceId, spanId, userId, connectionId, kind, name }`, where `kind`
is `'method'` or `'publication'`. Called outside any invocation, every field is
`null`.

> A server-initiated `Meteor.callAsync` (no client behind it) reports
> `connectionId: null`, and for now `name: null`, in `currentContext()`. The
> event's `name` is always populated.

## Configuration

`Instrumentation.configure(options)` sets global behaviour. Every option is
optional, and you can call it more than once.

```js
Instrumentation.configure({
  enabled: true,                  // master on/off switch
  captureMethodArgs: 'preview',   // include a bounded preview of args
  captureMethodResult: 'preview', // include a bounded preview of method results
  captureClientAddress: false,    // include the client IP on ddp.connection.open (PII)
  eventPrefix: 'orders-svc',      // namespace eventName per app/process/container
  onListenerError: (error, event) => console.error('instrumentation:', error),
});
```

- **`enabled`** — when `false`, nothing is emitted, regardless of registered
  listeners. It defaults from the `METEOR_INSTRUMENTATION_DISABLED` environment
  variable (set it to `1`, `true`, `yes` or `on`), so an operator can ship the
  package and silence it in production without a code change.
- **`captureMethodArgs`** — `'preview'` adds a bounded `args` preview to method
  **and publication** events. Off by default.
- **`captureMethodResult`** — `'preview'` adds a bounded `result` preview to
  `method.end`. Off by default.
- **`captureClientAddress`** — when `true`, `ddp.connection.open` carries the
  client IP as `clientAddress`. Off by default, since the IP is personal data.
- **`eventPrefix`** — prefixes each event's `eventName` (e.g.
  `orders-svc.method.start`). The canonical `type` stays unprefixed so generic
  consumers still match on it.
- **`onListenerError`** — called with `(error, event)` when a listener throws or
  rejects, and when a payload could not be built at all (the second argument
  then only carries the event `type`). Silent by default.

To override capture for a single method — for example to record only a safe
projection of a sensitive payload — use `Instrumentation.configureMethod`:

```js
Instrumentation.configureMethod('orders.create', {
  captureArgs: (args) => ({ orderId: args[0]?._id }),
});
```

Whatever your function returns is still passed through the bounded preview, so a
careless override can never produce an oversized or unserializable payload. The
projector receives a defensive copy (`EJSON.clone`) of the arguments or result:
inspect anything, but mutations never reach the live call. Overrides are
method-scoped — a publication with the same name is not affected (publications
follow only the global `captureMethodArgs` policy).

## Putting it to work

Register your listeners once, in server code that runs at startup — a file under
`server/`, or inside `Meteor.startup`. A few common uses:

**Spot slow methods**

```js
Instrumentation.on('method.end', (e) => {
  if (e.durationMs > 200) console.warn(`slow: ${e.name} (${e.durationMs}ms)`);
});
```

**Catch failing publications**

```js
Instrumentation.on('publication.error', (e) => {
  console.error(`publication ${e.name} failed:`, e.error.message);
});
```

**Track how many clients are connected**

```js
let live = 0;
Instrumentation.on('ddp.connection.open', () => { live += 1; });
Instrumentation.on('ddp.connection.close', () => { live -= 1; });
// expose `live` on a health check, a metric, a dashboard…
```

**Keep an audit trail of sensitive actions** — pair a safe projection (so no
secrets are stored) with the `userId` already on the event:

```js
Instrumentation.configureMethod('orders.refund', {
  captureArgs: (args) => ({ orderId: args[0], amount: args[1] }),
});

Instrumentation.on('method.end', (e) => {
  if (e.name === 'orders.refund') {
    AuditLog.insertAsync({ at: new Date(), userId: e.userId, action: e.name, args: e.args });
  }
});
```

**Roll up per-method timing stats** — turn the stream into your own lightweight
metrics, no external service required:

```js
const stats = new Map(); // name -> { count, totalMs, maxMs }

Instrumentation.on('method.end', (e) => {
  const s = stats.get(e.name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  s.count += 1;
  s.totalMs += e.durationMs;
  s.maxMs = Math.max(s.maxMs, e.durationMs);
  stats.set(e.name, s);
});
// stats.get('orders.create') → { count, totalMs, maxMs }; average = totalMs / count
```

**Export to OpenTelemetry or an APM** — because a method shares one `traceId`
across `start` and `end`/`error`, turning the stream into spans is a few lines.
This is how a tracing layer consumes the lifecycle without reaching into
`Meteor.server`:

```js
const open = new Map();

Instrumentation.on('method.start', (e) => open.set(e.traceId, e.ts));
Instrumentation.on('method.end', (e) => {
  open.delete(e.traceId);
  reportSpan({ name: e.name, ok: true, durationMs: e.durationMs });
});
Instrumentation.on('method.error', (e) => {
  open.delete(e.traceId);
  reportSpan({ name: e.name, ok: false, durationMs: e.durationMs, error: e.error });
});
```

The same shape applies to `publication.*` and `ddp.connection.*`.

## Spotting anomalies

Two ids let you correlate events: `traceId` ties one invocation's `start` to its
`end`/`error`, and `connectionId` ties together every call from the same client.
That is enough to catch things that _shouldn't_ happen.

**A server-only method invoked over DDP** — server-initiated calls have
`connectionId: null`, so a non-null one means a real client reached a method that
was meant to be internal:

```js
Instrumentation.on('method.start', (e) => {
  if (e.name === 'db.reindex' && e.connectionId !== null) {
    console.error(`⚠ ${e.name} called by a client (${e.connectionId})`);
  }
});
```

**A method that starts but never finishes** — every `start` should be matched by
an `end` or `error` with the same `traceId`; if it isn't, the method is hung:

```js
const inflight = new Map(); // traceId -> timer

Instrumentation.on('method.start', (e) => {
  inflight.set(e.traceId, Meteor.setTimeout(() => {
    console.error(`⚠ ${e.name} (${e.traceId}) still running after 30s`);
  }, 30_000));
});

const settle = (e) => {
  Meteor.clearTimeout(inflight.get(e.traceId));
  inflight.delete(e.traceId);
};
Instrumentation.on('method.end', settle);
Instrumentation.on('method.error', settle);
```

**A step that ran without its prerequisite** — because `connectionId` is shared
across a client's calls, you can spot a sequence that skipped a required step:

```js
// payment.capture must come after payment.authorize on the same connection.
const authorized = new Set(); // connectionId

Instrumentation.on('method.end', (e) => {
  if (e.name === 'payment.authorize') authorized.add(e.connectionId);
  if (e.name === 'payment.capture' && !authorized.has(e.connectionId)) {
    console.error(`⚠ capture without authorize on ${e.connectionId}`);
  }
});
```

## Safety and privacy

The seam is designed so that turning it on cannot leak data or hurt performance:

- **Nothing is captured by default.** `args` and `result` are omitted unless you
  opt in.
- **Captured values are always a bounded preview**, never the raw object: depth,
  key count, string length and array length are capped, cycles are broken, and
  non-JSON values (functions, symbols, `bigint`, `Date`, `Error`) become short
  markers.
- **Accounts methods are always redacted.** `login`, `createUser`,
  `changePassword`, `resetPassword`, `verifyEmail`, `enableUser2fa`,
  `requestLoginTokenForUser` and `configureLoginService` never expose their args
  or result, no matter how capture is configured.
- **Read-only and best-effort**, as above.
