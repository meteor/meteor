# disable-oplog

`disable-oplog` turns off MongoDB **oplog tailing** for your Meteor app. When the package is present, Meteor's live-data layer stops using the oplog to observe changes and falls back to polling the database instead.

```bash
meteor add disable-oplog
```

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `disable-oplog` exposes no JavaScript API and reads no settings; its mere presence disables oplog tailing app-wide. To re-enable oplog tailing, remove the package (`meteor remove disable-oplog`).

## How it works

The `disable-oplog` package contains no code of its own. Its presence is detected by Meteor's MongoDB integration — verified by the `package.js` comment: *"This package is empty; its presence is detected by mongo-livedata."* When the package is added, oplog-based change observation is disabled globally for the app; there is no API to call.

## A more granular alternative

If you only need polling for **specific** reactive queries — not the whole app — you don't need this package. Pass options directly to the cursor on the server (documented on `Mongo.Collection.find`):

```js
Collection.find(selector, {
  disableOplog: true,       // server only: skip oplog tailing for this observe
  pollingIntervalMs: 10000, // how often to poll, in ms (default 10000)
  pollingThrottleMs: 50,    // minimum time between re-polls, in ms (default 50)
});
```

Disabling the oplog per query is usually preferable to disabling it everywhere. Reach for the `disable-oplog` package only when you genuinely want to turn oplog tailing off for the **entire** app.

## Oplog vs. polling

The tradeoff matters when deciding whether to disable the oplog:

- **Oplog tailing** (the default when an oplog is available) pushes changes to reactive queries almost immediately and with low database load.
- **Polling** re-runs each reactive query periodically. Reactive updates can therefore lag by up to `pollingIntervalMs` (default **10 seconds**), and app-wide polling multiplies query load across every observer.

So disabling the oplog trades latency and database efficiency for simplicity. The package (app-wide) and the per-query `disableOplog` option **compose**: you can keep oplog tailing on globally and disable it only for specific queries, or install the package and still tune `pollingIntervalMs`/`pollingThrottleMs` per query.

Note that Meteor only uses oplog tailing when an oplog URL is configured (e.g. `MONGO_OPLOG_URL`); without it, Meteor already polls, so you don't need this package just because a deployment has no oplog.

## When you might use it

Disabling the oplog can be useful in environments where oplog tailing is unavailable or undesirable — for example, when you want every reactive query to use polling instead even though an oplog URL is configured. Because polling is generally less efficient than oplog tailing for high-throughput reactive workloads, only add this package when you specifically need to disable the oplog.

> This package is described in its `package.js` and `README.md` as an internal Meteor package. It is documented here because it is added directly to apps (`meteor add disable-oplog`) and has an observable, app-wide effect. It exposes no public JavaScript API.
