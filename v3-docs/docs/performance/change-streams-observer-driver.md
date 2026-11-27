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

Change Streams deliver majority-committed changes. Journaling can contribute to the delay, together with replication, write concern and disk load. WiredTiger's default journal commit interval is **100 ms**, but that is neither a fixed Change Streams latency floor nor an end-to-end latency bound: writes that include or imply `j: true` can trigger an earlier journal sync. See MongoDB's [journaling process](https://www.mongodb.com/docs/manual/core/journaling/#journaling-process).

For **self-managed MongoDB**, an operator can measure whether reducing the interval helps a particular workload. This is a deployment setting owned by the database administrator; Meteor does not change it at application startup.

### Configure each MongoDB member

The interval is local to each `mongod` process. It is not replicated with the data. Configure it consistently on the data-bearing members of each relevant replica set, including members that may become primary. For a sharded deployment, manage the members of each shard's replica set; this parameter is not available on `mongos`.

To persist the setting across restarts, put it in each member's MongoDB configuration and apply it using your normal deployment procedure:

```yaml
storage:
  journal:
    commitIntervalMs: 10
```

The value `10` is an example for an experiment, not a recommended production default. MongoDB accepts an integer from `1` to `500` milliseconds. See [`storage.journal.commitIntervalMs`](https://www.mongodb.com/docs/manual/reference/configuration-options/#mongodb-setting-storage.journal.commitIntervalMs).

For a temporary experiment, an administrator with the `setParameter` privilege can connect directly to each relevant `mongod` and run:

```javascript
db.adminCommand({ setParameter: 1, journalCommitInterval: 10 });
```

This runtime change lasts only until that process restarts. Changing only the current primary leaves the other members unchanged, and a failover can promote a member with a different interval. Keep runtime experiments, persistent configuration and replacement-member provisioning consistent. See [`setParameter`](https://www.mongodb.com/docs/manual/reference/command/setparameter/).

::: warning Managed MongoDB
MongoDB Atlas does not support the `setParameter` command. With a managed service, use only the configuration mechanisms supported by your provider. An application environment variable cannot bypass the provider's restrictions or supply the required administrative privilege.
:::

### Measure the trade-offs

A shorter interval increases journal synchronization frequency and can increase CPU and disk I/O. On an already busy disk it can reduce write throughput or increase tail latency. These costs affect every application sharing the MongoDB process, including workloads using the oplog observer.

The interval also affects the window of writes not yet flushed to the journal. For writes acknowledged without journal synchronization, changing it changes the potential loss window after a crash. Keep write concern and durability requirements explicit; see MongoDB's [journaling configuration](https://www.mongodb.com/docs/manual/tutorial/manage-journaling/).

Before changing production configuration:

1. Record the existing value on every member, MongoDB version, topology, write concern, hardware and workload. Keep these conditions fixed when comparing intervals.
2. Test under representative concurrency and disk load. Measure write-to-client latency (p50, p95 and p99), write throughput, database CPU, disk latency/IOPS and errors. A single-node result does not establish a multi-node replica set's performance.
3. Verify the configuration after a controlled restart and failover, and have a rollback procedure that restores the previous value on every affected member.

Keep the default when the measured benefit does not justify the database cost. No interval guarantees a particular delivery latency or reduction in DDP messages.

## Performance Comparison

- **Change Streams**: The default in Meteor 3.5+. Offloads the work of determining what changed entirely to the MongoDB server. It is extremely efficient for targeted queries but may cause high overhead on the MongoDB cluster if you have broad selectors or highly mutated collections.
- **Oplog Tailing**: The legacy default. Meteor tails the entire MongoDB oplog and filters changes in the Node.js process. This shifts load from the database to the Meteor app server, which can be beneficial if your MongoDB cluster is under heavy load, but requires oplog tailing permissions and scales poorly with a very high volume of writes across the database.
- **Polling**: The fallback mechanism. Periodically reruns the queries to compare differences. It is very resource-intensive for both the Meteor app and the database and thus discouraged for real-time reactivity except when neither Change Streams nor Oplog tailing are available.

## Troubleshooting

- **No Replica Set**: Change Streams require a replica set or sharded cluster. If you're running MongoDB standalone, it will fall back to `oplog` or `polling`. Ensure your development environment sets up a replica set.
- **Unsupported Selectors**: If your selector includes operators that Minimongo's Matcher cannot compile natively, the observer drops to the next configured fallback. Simplify complex queries to maximize Change Stream compatibility.
- **Performance Degradation**: If you see high CPU usage on your MongoDB cluster after switching to Change Streams, you may have publications with very broad filters. Use narrowed selectors, indexes, or revert to `oplog` for those specific collections.
