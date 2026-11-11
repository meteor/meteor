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

const worker = new Worker('./my-worker.js', {
  workerData: {
    port: ctx.port,
    settings: ctx.settings,
    userId: ctx.userId,
    callTimeout: ctx.callTimeout,
  },
  transferList: [ctx.port],
});

worker.on('exit', () => ctx.destroy());
```

### Worker thread — use Meteor APIs normally

```js
import { workerData } from 'worker_threads';
import { hydrateContext } from 'meteor/thread-context';

const { Collections, Meteor } = hydrateContext(workerData.port, {
  settings: workerData.settings,
  userId: workerData.userId,
  callTimeout: workerData.callTimeout,
});

// Collections — same API as the main thread (all async)
const trades = await Collections.Trades.find({ status: 'open' }).fetchAsync();
const user = await Collections.Users.findOneAsync({ _id: Meteor.userId });
await Collections.Reports.insertAsync({ generated: new Date(), trades });

// Methods
await Meteor.callAsync('notify.send', { recipient: Meteor.userId });

// Settings (frozen deep clone from spawn time)
console.log(Meteor.settings.public.appName);
```

> **Note:** Inside the worker, `Meteor.userId` is a **plain string property**, not a function. On the main thread it is called as `Meteor.userId()`. When porting code into a worker, replace `Meteor.userId()` with `Meteor.userId` — e.g. `Collections.Users.findOneAsync({ _id: Meteor.userId })` in the worker corresponds to `Meteor.users.findOneAsync({ _id: Meteor.userId() })` on the main thread.

## API

### `createThreadContext(options?)`

Creates a bridge host and returns a transfer-ready context object.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userId` | `string \| null` | `null` | Forwarded into proxied method/collection calls |
| `connectionId` | `string \| null` | `null` | DDP connection ID (only `.id` is accessible in worker) |
| `callTimeout` | `number` | `60000` | Timeout per bridge call in ms |
| `onMessage` | `function` | `null` | Hook called before dispatch — return a value to short-circuit |
| `onResult` | `function` | `null` | Hook called after handler — return a value to transform the result |

**Returns:** `{ port, settings, userId, connectionId, callTimeout, destroy }`

- `port` — `MessagePort` to transfer into the worker via `workerData` + `transferList`
- `settings` — Snapshot of `Meteor.settings` (cloned once, shared across contexts; pass via `workerData`)
- `userId` — `string | null` echoed back from options (see Options table); pass via `workerData` so the worker can hydrate it
- `connectionId` — `string | null` echoed back from options (see Options table); pass via `workerData` to expose `this.connection.id` in method calls
- `callTimeout` — `number` (ms) echoed back from options; forward to `hydrateContext` so both sides share the same per-call timeout
- `destroy()` — Closes the bridge and cleans up. Call on worker exit.

### `hydrateContext(port, options?)`

Reconstructs the Meteor API surface from a transferred `MessagePort`. Called once at the top of a worker script.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `settings` | `object` | `{}` | Settings snapshot (from `createThreadContext().settings`) |
| `userId` | `string \| null` | `null` | User ID for `Meteor.userId` |
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
| `Meteor.userId` | The forwarded userId — a **plain property** here, not a function like `Meteor.userId()` on the main thread |
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
| `BridgeContextError` | Forbidden operation (`setUserId`, `connection.*` access) |

`Meteor.Error` instances round-trip through the bridge preserving `.error`, `.reason`, and `.details`.

```js
import { BridgeTimeoutError } from 'meteor/thread-context';

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
- **`port.unref()`** on the worker side so the bridge doesn't keep the worker alive.
- **`Meteor.bindEnvironment()`** wraps the host-side port listener for proper Meteor context.
- **`DDP._CurrentMethodInvocation`** is set for both collection and method handlers so userId-based allow/deny rules work.

## Limitations

- **No reactivity.** `observe()` and `observeChanges()` throw. Workers make discrete async calls, not reactive subscriptions.
- **Structured clone boundary.** Arguments and results must be structured-clone-compatible. Custom prototype objects (like `Mongo.ObjectID`) lose their prototypes across the boundary.
- **Settings are a snapshot.** `Meteor.settings` is frozen at spawn time and is not reactive.
- **Server only.** This package is not available on the client.
- **Same process.** The bridge operates within a single Node.js process via `worker_threads`, not across processes.

## Testing

```bash
# Headless via Puppeteer (recommended)
./packages/test-in-console/run.sh "thread-context"

# Browser UI
./meteor test-packages ./packages/thread-context
```
