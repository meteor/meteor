# Change Streams Observer Driver

Meteor ships a Change Streams–based observe driver that can deliver realtime updates without oplog tailing. It hooks directly into MongoDB Change Streams to watch collection activity and push mutations to clients.

::: warning
Before moving production traffic to Change Streams, validate that your MongoDB deployment and queries are a good fit and benchmark under realistic load. Change Streams can reduce operational friction where oplog tailing is unavailable, but they can also increase work on busy collections if your selectors are broad.
:::

## Requirements and Limitations

- MongoDB 3.6+ on a replica set or sharded cluster (Change Streams are not available on standalone or some shared-tier deployments).
- Works only for unordered observers. Publications that rely on ordered callbacks (`addedBefore`, `movedBefore`) will keep using another driver.
- Selectors must compile with `Minimongo.Matcher`. Unsupported selectors fall back to the next configured driver.
- If Change Streams are unavailable, Meteor automatically moves to the next driver in your configured order.

## Choosing the Reactivity Driver Order

Meteor picks the first available driver from the configured list. The default order is `oplog`, then `changeStreams`, then `pooling` (long polling). You can change this globally:

- Environment variable: `METEOR_REACTIVITY_ORDER=changeStreams,oplog,pooling`
- Settings file:

```json
{
  "packages": {
    "mongo": {
      "reactivity": ["changeStreams", "oplog", "pooling"]
    }
  }
}
```

Tips:
- Put `changeStreams` first when you cannot or do not want to tail the oplog (e.g., Atlas Serverless).
- Remove `changeStreams` from the list if you want to disable it.
- Valid entries are `oplog`, `changeStreams`, and `polling`/`pooling` (alias).

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

## Performance Notes

- The driver requests `fullDocument: 'updateLookup'`, so updates trigger an extra read; keep indexes healthy to avoid slow lookups.
- Enabling MongoDB `changeStreamPreAndPostImages` on a collection lets the driver diff updates more efficiently; without it, some updates may send the full document.
- The Change Stream pipeline currently filters only by operation type; the app-side matcher applies your selector. Very high-write collections with broad selectors may produce more events than oplog tailing.
- Change Streams are a strong option when oplog tailing is not possible, providing realtime updates without falling back to long polling.
