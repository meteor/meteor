# Change Streams Observer Driver

Meteor ships a Change Streams–based observe driver that can deliver realtime updates without oplog tailing. It hooks directly into MongoDB Change Streams to watch collection activity and push mutations to clients.

::: warning
Before moving production traffic to Change Streams, validate that your MongoDB deployment and queries are a good fit and benchmark under realistic load. Change Streams can reduce operational friction where oplog tailing is unavailable, but they can also increase work on busy collections if your selectors are broad.
:::

## Requirements and Limitations

- MongoDB 4.0+ on a replica set or sharded cluster (Change Streams are not available on standalone or some shared-tier deployments).
- Works only for unordered observers. Publications that rely on ordered callbacks (`addedBefore`, `movedBefore`) will keep using another driver.
- Selectors must compile with `Minimongo.Matcher`. Unsupported selectors fall back to the next configured driver.
- If Change Streams are unavailable, Meteor automatically moves to the next driver in your configured order.

## Choosing the Reactivity Driver Order

Meteor picks the first available driver from the configured list. Starting in Meteor 3.5, the default order is `changeStreams`, then `oplog`, then `polling` (long polling). You can change this globally:

- Environment variable: `METEOR_REACTIVITY_ORDER=changeStreams,oplog,polling`
- Settings file:

```json
{
  "packages": {
    "mongo": {
      "reactivity": ["changeStreams", "oplog", "polling"]
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

## Performance Comparison

- **Change Streams**: The default in Meteor 3.5+. Offloads the work of determining what changed entirely to the MongoDB server. It is extremely efficient for targeted queries but may cause high overhead on the MongoDB cluster if you have broad selectors or highly mutated collections.
- **Oplog Tailing**: The legacy default. Meteor tails the entire MongoDB oplog and filters changes in the Node.js process. This shifts load from the database to the Meteor app server, which can be beneficial if your MongoDB cluster is under heavy load, but requires oplog tailing permissions and scales poorly with a very high volume of writes across the database.
- **Polling**: The fallback mechanism. Periodically reruns the queries to compare differences. It is very resource-intensive for both the Meteor app and the database and thus discouraged for real-time reactivity except when neither Change Streams nor Oplog tailing are available.

## Troubleshooting

- **No Replica Set**: Change Streams require a replica set or sharded cluster. If you're running MongoDB standalone, it will fall back to `oplog` or `polling`. Ensure your development environment sets up a replica set.
- **Unsupported Selectors**: If your selector includes operators that Minimongo's Matcher cannot compile natively, the observer drops to the next configured fallback. Simplify complex queries to maximize Change Stream compatibility.
- **Performance Degradation**: If you see high CPU usage on your MongoDB cluster after switching to Change Streams, you may have publications with very broad filters. Use narrowed selectors, indexes, or revert to `oplog` for those specific collections.
