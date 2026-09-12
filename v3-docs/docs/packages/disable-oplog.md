# disable-oplog

`disable-oplog` turns off MongoDB **oplog tailing** for your Meteor app. When the package is present, Meteor never opens an oplog connection and the `oplog` observe driver is removed from the reactivity drivers Meteor can choose from.

```bash
meteor add disable-oplog
```

::: tip Since Meteor 3.5
Change Streams — not the oplog — are the **default** reactivity mechanism (see the [Change Streams Observer Driver](../performance/change-streams-observer-driver.md) guide). Meteor picks a driver per query from the order `changeStreams → oplog → polling`. This package only removes the **oplog** step; it does **not** turn off Change Streams. On a Change Streams–capable deployment (MongoDB 6+ replica set or sharded cluster) most reactive queries keep using Change Streams, so the effective order simply becomes `changeStreams → polling`. To force polling, see [Forcing polling app-wide](#forcing-polling-app-wide).
:::

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `disable-oplog` exposes no JavaScript API and reads no settings; its mere presence removes oplog tailing app-wide. To re-enable oplog tailing, remove the package (`meteor remove disable-oplog`).

## How it works

`disable-oplog` ships no JavaScript API of its own — it's an empty package whose presence is detected by Meteor's MongoDB (mongo-livedata) integration. When it's added, Meteor skips creating the oplog tailing connection, so the `oplog` observe driver reports itself unavailable for every query. Change Streams and polling are unaffected: whichever of those comes first in your configured reactivity order is used instead.

## disable-oplog and the reactivity drivers

Since Meteor 3.5, each reactive query selects the first available driver from the order `changeStreams → oplog → polling`. `disable-oplog` removes the middle step, so the effective order becomes:

```
changeStreams → polling
```

What that means in practice:

- **Change Streams available** for the query (MongoDB 6+ replica set or sharded cluster, an unordered observer, no `skip`/`limit`, and a supported selector): the query uses Change Streams whether or not this package is installed — `disable-oplog` has **no effect** on it.
- **Change Streams not available** for the query (standalone/older MongoDB, an ordered observer, `skip`/`limit`, or an unsupported selector): without the oplog fallback the query goes straight to **polling**.

In other words, on a modern deployment `disable-oplog` no longer forces polling app-wide the way it did before Change Streams — it only drops the oplog fallback. Its remaining purpose is to stop Meteor from tailing the oplog at all: useful to avoid the extra oplog connection, or to keep Change Streams as the only push-based driver with polling as the sole fallback.

## Forcing polling app-wide

If you actually want **polling everywhere** — the pre–Change-Streams behavior people often associate with this package — disabling the oplog is not enough on a Change Streams–capable deployment, because Change Streams still come first. Set the reactivity order explicitly instead, via the `METEOR_REACTIVITY_ORDER` environment variable or the `packages.mongo.reactivity` setting, which accepts a single driver name or an **array** of drivers:

```bash
METEOR_REACTIVITY_ORDER="polling" meteor run
```

```json
// settings.json
{
  "packages": {
    "mongo": {
      "reactivity": ["polling"]
    }
  }
}
```

Valid drivers are `changeStreams`, `oplog`, and `polling`. Because this setting lets you drop `oplog` (or every push-based driver) from the order directly — e.g. `["oplog", "polling"]` to force the classic oplog behavior, or `["polling"]` to force polling — many apps no longer need the `disable-oplog` package at all. See [`METEOR_REACTIVITY_ORDER`](../cli/environment-variables.md#meteor-reactivity-order) and the [Change Streams Observer Driver](../performance/change-streams-observer-driver.md#choosing-the-reactivity-driver-order) guide for details.

## A more granular alternative

If you only want to change behavior for **specific** reactive queries — not the whole app — pass options directly to the cursor on the server (documented on `Mongo.Collection.find`):

```js
Collection.find(selector, {
  disableOplog: true,       // server only: remove the oplog driver for this observe
  pollingIntervalMs: 10000, // how often to poll, in ms (default 10000)
  pollingThrottleMs: 50,    // minimum time between re-polls, in ms (default 50)
});
```

Like the package, per-query `disableOplog` only removes the **oplog** driver — on a Change Streams–capable deployment the query still uses Change Streams. `pollingIntervalMs`/`pollingThrottleMs` therefore apply only when the query actually falls through to polling. The polling defaults can also be set app-wide with the `METEOR_POLLING_INTERVAL_MS` and `METEOR_POLLING_THROTTLE_MS` environment variables instead of passing them per query.

## Driver tradeoffs

- **Change Streams** (default) push changes to reactive queries in realtime and work even where oplog access isn't available (managed/serverless MongoDB tiers). Requires MongoDB 6+ on a replica set or sharded cluster.
- **Oplog tailing** also pushes changes with low latency, but needs a configured oplog URL (e.g. `MONGO_OPLOG_URL`) and oplog read access.
- **Polling** re-runs each reactive query periodically. Updates can lag by up to `pollingIntervalMs` (default **10 seconds**), and app-wide polling multiplies query load across every observer.

Note that Meteor only ever uses oplog tailing when an oplog URL is configured; without one, the `oplog` driver is unavailable regardless of this package.

## When you might use it

Reach for `disable-oplog` when you specifically want Meteor to stop tailing the oplog — for instance to avoid the extra oplog connection, or to keep Change Streams as the sole push-based driver with polling as the only fallback. If instead you want to force polling app-wide or otherwise reorder the drivers, prefer the [`METEOR_REACTIVITY_ORDER`](../cli/environment-variables.md#meteor-reactivity-order) / `packages.mongo.reactivity` configuration, which is more explicit and doesn't depend on Change Streams availability.
