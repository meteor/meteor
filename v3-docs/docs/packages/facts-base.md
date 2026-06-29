# facts-base

`facts-base` collects and publishes internal application statistics ("facts") — named numeric counters grouped by package. Other packages use it to expose runtime metrics (for example, how many live-query observers or open sessions exist), which you can then read on the client and display with the `facts-ui` package.

```bash
meteor add facts-base
```

The package exports a `Facts` object and runs on the server.

## How facts are stored and published

Each fact belongs to a **package** and has a **name** and an integer **value**. Facts are published through a built-in publication named `meteor_facts`, which sends one document per package (the document `_id` is the package name; each remaining field is a fact name mapped to its value). On the client, `facts-ui` reads these from a collection named `meteor_Facts_server`.

## Server API

All of the following are methods on the exported `Facts` object and run on the server. These methods exist only on the server; calling them on the client throws. Facts are held in memory per server process, so they reset on restart and are not aggregated across multiple instances. `Facts.setUserIdFilter` is evaluated once per subscription at subscribe time, so changing the filter (or a user's role) does not re-filter existing subscriptions.

### `Facts.incrementServerFact(pkg, fact, increment)`

Increments the counter `fact` for package `pkg` by `increment`, creating it if it doesn't exist yet, and pushes the change to all active subscribers.

- `pkg` **String** — the package the fact belongs to.
- `fact` **String** — the name of the fact/counter.
- `increment` **Number** — the amount to add (the first call for a fact initializes it to this value).

```js
import { Facts } from 'meteor/facts-base';

Facts.incrementServerFact('my-package', 'active-jobs', 1);
// ...later
Facts.incrementServerFact('my-package', 'active-jobs', -1);
```

### `Facts.setUserIdFilter(filter)`

Controls which users are allowed to subscribe to the facts publication.

- `filter` **Function** — called as `filter(userId)` and should return a truthy value to allow that subscription.

By default, facts are published to **no** users when `autopublish` is off, and to **all** users when `autopublish` is on. Use `setUserIdFilter` to expose facts only to, say, administrators:

```js
import { Facts } from 'meteor/facts-base';

// The filter runs synchronously at subscribe time, so it cannot do an
// async / DB lookup. Decide from data available synchronously, e.g. an
// allowlist of admin user ids in your settings:
Facts.setUserIdFilter(userId =>
  (Meteor.settings.adminUserIds || []).includes(userId)
);
```

### `Facts.resetServerFacts()`

Clears all recorded facts for every package. It clears the in-memory state but issues no `removed` messages to subscribers, so currently-connected clients keep showing the old facts until they resubscribe.

## A complete example

Increment a counter from server code and restrict who may read the facts:

```js
import { Facts } from 'meteor/facts-base';

Meteor.methods({
  async runJob() {
    Facts.incrementServerFact('my-app', 'jobs-run', 1);
    try {
      // ...do the work...
    } finally {
      Facts.incrementServerFact('my-app', 'jobs-run', -1);
    }
  },
});

// Expose the facts only to admins (otherwise, without autopublish, no one
// can subscribe to them):
Facts.setUserIdFilter((userId) =>
  (Meteor.settings.adminUserIds || []).includes(userId)
);
```

To display these on the client, add the `facts-ui` package and render its `serverFacts` template.

## Facts published by Meteor itself

Even if you never call `incrementServerFact` yourself, several core packages report facts automatically once `facts-base` is installed. For example, the `mongo` package publishes the following under the `mongo-livedata` package name:

- `observe-multiplexers` — number of active observe-multiplexers
- `observe-handles` — number of active observe handles
- `observe-drivers-oplog` — number of oplog-based observe drivers
- `time-spent-in-<phase>-phase` — time spent in each oplog-observe phase

The `mongo` package also reports `observe-drivers-polling` and `oplog-watchers` under `mongo-livedata`. And the `ddp-server` (livedata) package reports, under the `livedata` package name:

- `sessions` — number of connected DDP sessions
- `subscriptions` — number of active subscriptions
- `invalidation-crossbar-listeners` — number of crossbar listeners

This makes `facts-base` + `facts-ui` a quick way to watch live-query load on a running server.

## Notes

Only the public `Facts` API is documented here. Internal helpers prefixed with an underscore (e.g. `Facts._factsByPackage`) are not part of the public API and may change without notice.

## See also

- [`facts-ui`](./facts-ui.md) — a client package that subscribes to these facts and renders them with the <span v-pre>`{{> serverFacts}}`</span> template.
- [`autopublish`](./autopublish.md) — when present, changes the default visibility of facts to all users.
