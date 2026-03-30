# worker-pool

A managed pool of worker threads for Meteor. Offload CPU-heavy work without blocking the main event loop, with full access to your collections and Meteor APIs from inside the worker.

## Quick start

```js
import { WorkerPool } from 'meteor/worker-pool';

const pool = new WorkerPool({ min: 2, max: 8 });

const result = await pool.dispatch({
  handler: async (data, { Collections, Meteor }) => {
    const docs = await Collections.Items.find({ status: 'pending' }).fetchAsync();
    return { count: docs.length };
  },
  data: { key: 'value' },
});

console.log(result); // { count: 42 }
```

The handler runs in a separate thread. Data goes in, result comes back. Everything in between happens off the main event loop.

## How it works

When you call `dispatch`, the pool:

1. Picks an idle worker (or spawns a new one if below `max`)
2. Serializes your handler function and data
3. Sends them to the worker thread via `postMessage`
4. The worker executes the handler and posts the result back
5. The pool resolves your promise with the result

Each worker gets a **thread-context bridge** -- proxied versions of `Collections` and `Meteor` that talk back to the main thread over a MessagePort. This means your handler can read and write to the database, call Meteor methods, and access `Meteor.settings`, all from within the worker.

## The handler function

Your handler is serialized with `.toString()` and reconstructed in the worker. This has a couple implications:

- **No closures.** The function can't capture variables from the surrounding scope. Everything the handler needs must come through `data` or `context`.
- **Structured clone boundary.** `data` and the return value must be cloneable -- no functions, no class instances with prototypes, no circular references.

The handler receives two arguments:

```js
async function handler(data, context) {
  // data    - whatever you passed in dispatch({ data: ... })
  // context - { Collections, Meteor }
  //
  // Collections is a universal proxy -- any collection name works.
  // Meteor has .settings, .userId, .callAsync(), .isServer, etc.
}
```

Both sync and async handlers work. If your handler returns a promise, the pool waits for it to resolve.

## Configuration

```js
const pool = new WorkerPool({
  min: 0,            // minimum idle workers kept alive (default: 0)
  max: 7,            // maximum concurrent workers (default: CPU count - 1)
  idleTimeout: 30000,      // kill idle workers after 30s (default)
  taskTimeout: 300000,     // per-task timeout in ms, 5 min (default)
  recycleAfter: 1000,      // restart a worker after 1000 tasks (default)
  enableHeartbeat: true,   // monitor idle workers for hangs (default: true)
  heartbeatInterval: 15000,// ping interval in ms (default)
  heartbeatTimeout: 5000,  // max wait for pong (default)
});
```

### What the options do

**`min` / `max`** control pool sizing. Workers are spawned on demand and reaped when idle. Setting `min: 2` keeps two warm workers ready so the first dispatches don't pay spawn cost.

**`idleTimeout`** controls how long a worker sits idle before being terminated. Set to `0` to disable idle reaping entirely. The pool will never go below `min` workers regardless of this setting.

**`taskTimeout`** is the default timeout for all tasks. If a handler doesn't finish in time, the dispatch promise rejects with a timeout error. You can override this per-dispatch.

**`recycleAfter`** restarts workers periodically to prevent memory leaks from long-lived threads. After a worker completes this many tasks, it's terminated and a fresh one takes its place. Set to `0` to disable.

**`enableHeartbeat`** pings idle workers to detect stuck threads. If an idle worker stops responding, it's killed and replaced. Busy workers are monitored by their task timeout instead.

## Dispatching tasks

```js
// Basic dispatch
const result = await pool.dispatch({
  handler: async (data) => data.a + data.b,
  data: { a: 1, b: 2 },
});
// result === 3

// Per-task timeout override
const result = await pool.dispatch({
  handler: async (data) => heavyComputation(data),
  data: payload,
  timeout: 60000, // 1 minute for this specific task
});
```

If all workers are busy and the pool is at `max`, the task is queued and dispatched to the next worker that becomes available. Tasks are processed in FIFO order.

## Error handling

Errors thrown in the handler propagate to the dispatch caller:

```js
try {
  await pool.dispatch({
    handler: async () => {
      throw new Error('something went wrong');
    },
  });
} catch (err) {
  console.log(err.message); // 'something went wrong'
}
```

Error `name`, `message`, and `stack` are preserved across the thread boundary. Meteor error fields (`.error`, `.reason`, `.details`) are also carried over if present.

## Pool stats

```js
const stats = pool.stats();
// {
//   total: 4,      // all workers (any state)
//   idle: 2,       // waiting for work
//   busy: 1,       // executing a task
//   spawning: 1,   // starting up
//   pending: 0,    // queued tasks
// }
```

## Shutting down

**Graceful drain** -- stop accepting work and wait for in-flight tasks to finish:

```js
await pool.drain();
```

Tasks that haven't been dispatched to a worker yet are rejected. Tasks already running are allowed to complete. Calling `drain()` multiple times returns the same promise.

**Forced terminate** -- kill everything immediately:

```js
await pool.terminate();
```

All workers are killed. Queued and in-flight tasks are rejected with an error. Use this when you need to shut down fast.

In practice, you usually want drain followed by terminate:

```js
await pool.drain();
await pool.terminate();
```

## Using with Jobs

The `jobs` package has built-in support for worker-pool. Add the package and set `offload: true` on any job definition:

```js
Jobs.register({
  name: 'processImage',
  offload: true,
  run(data, { Collections, Meteor }) {
    // runs in a worker thread
    const asset = await Collections.Assets.findOneAsync({ _id: data.assetId });
    const resized = sharp(asset.buffer).resize(800).toBuffer();
    await Collections.Assets.updateAsync(data.assetId, {
      $set: { thumbnail: resized },
    });
    return { size: resized.length };
  },
});
```

The jobs engine manages the pool automatically -- you don't need to create a `WorkerPool` instance yourself.

## Things to keep in mind

- **No reactivity.** Workers make discrete async calls, not subscriptions. `observe()` and `observeChanges()` will throw.
- **Settings are a snapshot.** `Meteor.settings` is frozen when the worker spawns. Changes on the main thread aren't reflected.
- **Workers are threads, not processes.** They share memory for ArrayBuffers (if you use SharedArrayBuffer) but have separate JS heaps. Each worker has its own event loop.
- **Spawn cost.** Creating a worker takes ~50-100ms. Use `min` to keep warm workers if latency matters.

## API reference

| Method | Description |
|--------|-------------|
| `new WorkerPool(options?)` | Create a pool with the given options |
| `pool.dispatch({ handler, data?, timeout? })` | Run a function in a worker, returns a promise |
| `pool.stats()` | Get current pool statistics |
| `pool.drain()` | Graceful shutdown -- wait for running tasks, reject queued ones |
| `pool.terminate()` | Force shutdown -- kill all workers, reject everything |

| Option | Default | Description |
|--------|---------|-------------|
| `min` | `0` | Minimum idle workers |
| `max` | `cpus - 1` | Maximum workers |
| `idleTimeout` | `30000` | Kill idle workers after this many ms (0 to disable) |
| `taskTimeout` | `300000` | Default per-task timeout in ms |
| `recycleAfter` | `1000` | Recycle worker after N tasks (0 to disable) |
| `enableHeartbeat` | `true` | Monitor idle workers for hangs |
| `heartbeatInterval` | `15000` | Heartbeat ping interval in ms |
| `heartbeatTimeout` | `5000` | Max wait for heartbeat response |
