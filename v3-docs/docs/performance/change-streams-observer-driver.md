# Change Streams Observer Driver

Meteor ships a Change Streams–based observe driver that can deliver realtime updates without oplog tailing. It hooks directly into MongoDB Change Streams to watch collection activity and push mutations to clients.

::: warning
Before moving production traffic to Change Streams, validate that your MongoDB deployment and queries are a good fit and benchmark under realistic load. Change Streams can reduce operational friction where oplog tailing is unavailable, but they can also increase work on busy collections if your selectors are broad.
:::

## Requirements and Limitations

- MongoDB 6+ on a replica set or sharded cluster (Change Streams are not available on standalone or some shared-tier deployments).
- Works only for unordered observers. Publications that rely on ordered callbacks (`addedBefore`, `movedBefore`) will keep using another driver.
- Selectors must compile with `Minimongo.Matcher`. Unsupported selectors fall back to the next configured driver.
- If Change Streams are unavailable, Meteor automatically moves to the next driver in your configured order.

## Choosing the Reactivity Driver Order

Starting in Meteor 3.5, Change Streams are enabled by default — you do **not** need to configure `settings.json` to turn them on. Meteor picks the first available driver from the order `changeStreams`, then `oplog`, then `polling` (long polling), automatically falling back to the next entry when the current one is unavailable.

You only need to configure the reactivity order if you want to **override** this default — for example, to force `oplog` ahead of (or instead of) Change Streams:

- Environment variable: `METEOR_REACTIVITY_ORDER=oplog,polling`
- Settings file:

```json
{
  "packages": {
    "mongo": {
      "reactivity": ["oplog", "polling"]
    }
  }
}
```

Tips:
- Put `oplog` first if your application relies extensively on ordered observers or you experience performance degradation with change streams on heavily mutated collections.
- Remove `changeStreams` from the list if you want to disable it.
- Valid entries are `changeStreams`, `oplog`, and `polling` (alias long polling).

## Change Stream Driver Settings

Optional tuning is available via `Meteor.settings`:

```json
{
  "packages": {
    "mongo": {
      "changeStream": {
        "delay": { "error": 100, "close": 100 },
        "waitUntilCaughtUpTimeoutMs": 1000
      }
    }
  }
}
```

- `delay.error`: Milliseconds to wait before restarting the stream after an error (default: `100`).
- `delay.close`: Milliseconds to wait before restarting after an unexpected close (default: `100`).
- `waitUntilCaughtUpTimeoutMs`: Upper bound for waiting until the stream catches up to the server's current operation time when coordinating with DDP fences (default: `1000`).
  - If this timeout elapses, the driver stops waiting and lets the fence continue; the change stream will catch up later, so data is not lost, but clients can temporarily miss read-your-writes (a publication may become ready before the client's own writes appear).

## Reducing Delivery Latency

Change Streams gate delivery on **majority commit**, which in turn waits for the WiredTiger journal flush. MongoDB's default `journalCommitInterval` is **100 ms**, so an isolated change-stream event can take up to ~100 ms to reach your Meteor server, even on localhost. The oplog driver does not gate on majority commit, so this floor does not apply to it.

You can lower the journal interval at startup via the opt-in env var:

```bash
METEOR_MONGO_JOURNAL_COMMIT_INTERVAL_MS=1 meteor run
```

This calls `setParameter` on the connected MongoDB to shrink the interval from 100 ms to the value you provide. Internal benchmarks (Meteor 3.5, single-node replica set, 600 concurrent DDP subscribers on a `find({})` publication) show:

| `journalCommitInterval` | Change-stream delivery (p50) | DDP `added` messages | DB CPU |
|---|---|---|---|
| 100 ms (default) | ~106 ms | baseline | baseline |
| 10 ms | ~13 ms | -68% | +85% |
| 1 ms | ~6 ms | -70% | +110% |

Trade-offs:

- **Lower interval → lower latency.** Setting `1` drops cs delivery p50 by ~94%, which in turn shrinks the multiplexer's resident document cache (because subscriptions complete faster), reducing total DDP fanout messages by ~70%.
- **Lower interval → higher DB CPU.** The mongod process performs `fsync` more frequently. The cost is mostly on the DB side, not on the Meteor app.
- **No effect on the oplog driver.** If you're forcing `oplog` ahead of `changeStreams`, this env var changes nothing for your workload.
- **No effect on data durability.** `journalCommitInterval` only changes how often the journal is flushed to disk; writes are still durable once flushed.

::: warning
This is a server-wide MongoDB setting applied at app startup. If multiple Meteor apps share the same MongoDB instance, the **last connector wins** and the change persists until mongod restarts. Do not enable in production without measuring DB CPU impact on your specific workload — the gain is most visible when change-stream delivery latency is on your critical path (e.g. reactive UIs with hundreds of concurrent subscribers to broad publications).
:::

## Performance Comparison

- **Change Streams**: The default in Meteor 3.5+. Offloads the work of determining what changed entirely to the MongoDB server. It is extremely efficient for targeted queries but may cause high overhead on the MongoDB cluster if you have broad selectors or highly mutated collections.
- **Oplog Tailing**: The legacy default. Meteor tails the entire MongoDB oplog and filters changes in the Node.js process. This shifts load from the database to the Meteor app server, which can be beneficial if your MongoDB cluster is under heavy load, but requires oplog tailing permissions and scales poorly with a very high volume of writes across the database.
- **Polling**: The fallback mechanism. Periodically reruns the queries to compare differences. It is very resource-intensive for both the Meteor app and the database and thus discouraged for real-time reactivity except when neither Change Streams nor Oplog tailing are available.

## Troubleshooting

- **No Replica Set**: Change Streams require a replica set or sharded cluster. If you're running MongoDB standalone, it will fall back to `oplog` or `polling`. Ensure your development environment sets up a replica set.
- **Unsupported Selectors**: If your selector includes operators that Minimongo's Matcher cannot compile natively, the observer drops to the next configured fallback. Simplify complex queries to maximize Change Stream compatibility.
- **Performance Degradation**: If you see high CPU usage on your MongoDB cluster after switching to Change Streams, you may have publications with very broad filters. Use narrowed selectors, indexes, or revert to `oplog` for those specific collections.
