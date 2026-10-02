# thread-context

Transparent worker thread bridge for Meteor server APIs.

Makes Meteor's server-side API surface — Collections, Methods, and Settings — available inside Node.js worker threads through a lazy, demand-driven proxy over a `MessageChannel`. Workers use the same API they would on the main thread; the bridge is an implementation detail.

## Installation

```bash
meteor add thread-context
```

## Quick Start

### Main thread — spawn a worker with Meteor context

```js
import { createThreadContext } from 'meteor/thread-context';
import { Worker } from 'worker_threads';

const ctx = createThreadContext({
  userId: this.userId,       // forwarded into proxied method calls
  connectionId: this.connection?.id,
  callTimeout: 30000,        // per-call timeout (default: 60000ms)
});

// Worker scripts live outside the Meteor bundle, e.g. under private/
const worker = new Worker(Assets.absoluteFilePath('workers/report.mjs'), {
  workerData: ctx.workerData, // { port, settings, userId, connectionId, callTimeout, bridgeModuleUrl }
  transferList: [ctx.port],
});
```

The host tears the bridge down by itself when the worker exits (its end of
the channel closes). `ctx.destroy()` is still available to close it early.

### Worker thread — use Meteor APIs normally

```js
// private/workers/report.mjs — a plain Node.js module
import { workerData } from 'worker_threads';

const { hydrateContext } = await import(workerData.bridgeModuleUrl);
const { Collections, Meteor } = hydrateContext(workerData);

// Collections — same API as the main thread (all async)
const trades = await Collections.Trades.find({ status: 'open' }).fetchAsync();
const user = await Collections.Users.findOneAsync({ _id: Meteor.userId() });
await Collections.Reports.insertAsync({ generated: new Date(), trades });

// Methods
await Meteor.callAsync('notify.send', { recipient: Meteor.userId() });

// Settings (frozen deep clone from spawn time)
console.log(Meteor.settings.public.appName);
```

The worker's event loop is kept alive only while a bridge call is in flight,
so a worker whose last statement is an awaited bridge call exits cleanly once
the result arrives.

### Loading the worker-side API

A `worker_threads` Worker is a plain Node.js thread. It has no Meteor module
system, so `import ... from 'meteor/thread-context'` is not available there.
Instead, the package ships its worker-side modules as server assets, and
`createThreadContext().workerData.bridgeModuleUrl` is the `file://` URL of the
entry module. Import it dynamically, as in the example above. The entry exports
`hydrateContext` and the error classes (`BridgeError`, `BridgeTimeoutError`,
`BridgeSerializationError`, `BridgeContextError`, `MeteorError`).

- Keep worker scripts out of the directories Meteor bundles (`client/`,
  `server/`, `imports/`, …), for example under `private/`, so they stay
  standalone files; `Assets.absoluteFilePath()` gives their runtime path.
- Write the worker as an ES module (`.mjs`) so top-level `await` is available,
  or as CommonJS with `import()` inside an async function.
- Node prints a one-time `MODULE_TYPELESS_PACKAGE_JSON` warning when it detects
  that the shipped `.js` modules are ESM. It is harmless; pass
  `execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON']` to the
  `Worker` constructor to silence it.

## API

### `createThreadContext(options?)`

Creates a bridge host and returns a transfer-ready context object.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userId` | `string \| null` | `null` | Forwarded into proxied method/collection calls |
| `connectionId` | `string \| null` | `null` | DDP connection ID; methods invoked through the bridge see it as `this.connection.id` (no other `connection` property is available) |
| `callTimeout` | `number` | `60000` | Timeout per bridge call in ms |
| `onMessage` | `function` | `null` | Hook called before dispatch — return a value to short-circuit |
| `onResult` | `function` | `null` | Hook called after handler — return a value to transform the result |

**Returns:** `{ workerData, port, settings, userId, connectionId, callTimeout, destroy }`

- `workerData` — `{ port, settings, userId, connectionId, callTimeout, bridgeModuleUrl }`, structured-clone-safe. Pass it as the Worker's `workerData` (with `port` in `transferList`) and hand it to `hydrateContext` unchanged, so the worker sees exactly the identity the host enforces. `bridgeModuleUrl` is the `file://` URL of the worker-side entry module (see [Loading the worker-side API](#loading-the-worker-side-api))
- `port` — `MessagePort` to list in `transferList`
- `settings` — Frozen snapshot of `Meteor.settings` (cloned once, shared across contexts)
- `userId` — `string | null` echoed back from options (see Options table)
- `connectionId` — `string | null` echoed back from options (see Options table); exposes `this.connection.id` in bridged method calls
- `callTimeout` — `number` (ms) echoed back from options
- `destroy()` — Closes the bridge and cleans up. Optional: the host also destroys itself when the worker's port closes

### `hydrateContext(workerData | port, options?)`

Reconstructs the Meteor API surface inside a worker. Called once at the top of a worker script. Pass the `workerData` object from `createThreadContext` straight through (recommended), or a bare `MessagePort` plus options. Explicit options override fields from `workerData`.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `settings` | `object` | `{}` | Settings snapshot (from `createThreadContext().settings`) |
| `userId` | `string \| null` | `null` | Value returned by `Meteor.userId()` in the worker |
| `callTimeout` | `number` | `60000` | Per-call timeout in ms |

**Returns:** `{ Collections, Meteor }`

### Hydrated `Collections`

Universal proxy — no manifest required. Access any collection by name. All operations return Promises.

```js
// Direct operations
await Collections.MyCol.findOneAsync(selector, options)
await Collections.MyCol.insertAsync(doc)
await Collections.MyCol.updateAsync(selector, modifier)
await Collections.MyCol.upsertAsync(selector, modifier)
await Collections.MyCol.removeAsync(selector)

// Cursor operations (find returns a cursor proxy)
const cursor = Collections.MyCol.find(selector, options);
await cursor.fetchAsync()
await cursor.countAsync()
await cursor.forEachAsync(callback)  // fetches all docs, runs callback locally
await cursor.mapAsync(callback)      // fetches all docs, maps locally

// Aggregation
await Collections.MyCol.aggregate(pipeline, options)
```

### Hydrated `Meteor`

| Property | Description |
|----------|-------------|
| `Meteor.callAsync(name, ...args)` | Call a Meteor method on the main thread |
| `Meteor.settings` | Frozen deep clone from spawn time |
| `Meteor.userId()` | Returns the forwarded userId — same call shape as on the main thread |
| `Meteor.isServer` | Always `true` |
| `Meteor.isClient` | Always `false` |
| `Meteor.isSimulation` | Always `false` |
| `Meteor.Error` | Worker-compatible error class (round-trips through the bridge) |

## Hooks

The `onMessage` and `onResult` hooks let you intercept bridge calls without modifying core behavior.

```js
const ctx = createThreadContext({
  // Short-circuit: return a value to skip the handler
  onMessage(msg) {
    if (msg.type === 'collection' && msg.collectionName === 'AuditLog') {
      console.log('Worker accessed AuditLog:', msg.op);
    }
    // return undefined to continue normally
  },

  // Transform: return a value to replace the result
  onResult(msg, result) {
    if (msg.type === 'collection' && msg.op === 'find.fetchAsync') {
      console.log(`Returned ${result.length} docs for ${msg.collectionName}`);
    }
    // return undefined to pass through unchanged
  },
});
```

## Error Handling

Errors thrown on the main thread are serialized and re-thrown in the worker with the correct type:

| Error Class | Thrown When |
|-------------|------------|
| `BridgeError` | General bridge failure |
| `BridgeTimeoutError` | Call exceeds `callTimeout` |
| `BridgeSerializationError` | Non-cloneable value in arguments or result |
| `BridgeContextError` | Forbidden operation (`setUserId`, `connection.*` access, DDP session methods such as `login`/`logout`) |

`Meteor.Error` instances round-trip through the bridge preserving `.error`, `.reason`, and `.details`.

Inside a worker, the error classes come from the same entry module as
`hydrateContext` (on the main thread they are exported from `meteor/thread-context`):

```js
const { hydrateContext, BridgeTimeoutError } = await import(workerData.bridgeModuleUrl);
const { Collections } = hydrateContext(workerData);

try {
  await Collections.Reports.find({ complex: true }).fetchAsync();
} catch (err) {
  if (err instanceof BridgeTimeoutError) {
    // handle timeout
  }
}
```

## Shutdown

Active bridges are tracked so they can be torn down explicitly, either by the
host application or via opt-in signal handlers:

```js
import {
  getActiveBridgeCount,
  destroyAllBridges,
  installShutdownHandlers,
} from 'meteor/thread-context';

console.log(getActiveBridgeCount()); // number of active bridges
destroyAllBridges();                 // destroy all at once

// Opt-in: destroy active bridges on SIGTERM/SIGINT and re-raise the signal
// so the host process exits naturally. Pass { exit: true } to force
// `process.exit(143 | 130)` after teardown instead.
installShutdownHandlers();
```

Signal handlers are **not** registered at import time — `installShutdownHandlers()`
must be called by the host if that behavior is desired.

## Architecture

```text
Main Thread (Host)                    Worker Thread
─────────────────────────────────────────────────────

  BridgeHost                           BridgeClient
  ├── CollectionHandler ◄────────────► CollectionProxy
  ├── MethodHandler     ◄────────────► MethodProxy
  ├── SettingsSnapshot  ────────────► (frozen clone)
  └── onMessage/onResult hooks

       MessageChannel (port1 ◄──► port2)
```

- **No manifest required.** Collection and method proxies use ES6 `Proxy` to intercept any name dynamically.
- **Lazy.** No bridge traffic until the worker actually accesses a collection or calls a method.
- **Protocol versioned.** Messages carry `v: 1` for forward compatibility.
- **Ref'd only while busy.** The worker-side port is ref'd while a bridge call is in flight and unref'd otherwise, so the worker neither exits early nor lingers idle.
- **Self-cleaning host.** The host port listens for `close` and destroys the bridge when the worker exits; deserialization failures on either side are logged.
- **`Meteor.bindEnvironment()`** wraps the host-side port listener for proper Meteor context.
- **`DDP._CurrentMethodInvocation`** is set for both collection and method handlers, so `this.userId` inside methods and `Meteor.userId()` reflect the forwarded user.
- **Methods run through `Meteor.server.applyAsync`**, so bridged calls get argument-check auditing, a per-call random seed, instrumentation events, and result cloning like any server-initiated call. Session-management methods (`login`, `logout`, `getNewToken`, …) are refused with `BridgeContextError`.

## Limitations

- **No reactivity.** `observe()` and `observeChanges()` throw. Workers make discrete async calls, not reactive subscriptions.
- **Structured clone boundary.** Arguments and results must be structured-clone-compatible. Custom prototype objects (like `Mongo.ObjectID`) lose their prototypes across the boundary.
- **Settings are a snapshot.** `Meteor.settings` is frozen at spawn time and is not reactive.
- **Server only.** This package is not available on the client.
- **Workers are plain Node.** A worker cannot import `meteor/*` packages; only the API returned by `hydrateContext` (plus the error classes exported next to it) is available there.
- **Same process.** The bridge operates within a single Node.js process via `worker_threads`, not across processes.

## Testing

```bash
# Headless via Puppeteer (recommended)
./packages/test-in-console/run.sh "thread-context"

# Browser UI
./meteor test-packages ./packages/thread-context
```
