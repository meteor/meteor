# facts-base

`facts-base` collects and publishes internal application statistics ("facts") — named numeric counters grouped by package. Other packages use it to expose runtime metrics (for example, how many live-query observers or open sessions exist), which you can then read on the client and display with the `facts-ui` package.

```bash
meteor add facts-base
```

The package exports a `Facts` object (`api.export("Facts")`) and runs on the server.

## How facts are stored and published

Each fact belongs to a **package** and has a **name** and an integer **value**. Facts are published through a built-in publication named `meteor_facts`, which sends one document per package (the document `_id` is the package name; each remaining field is a fact name mapped to its value). On the client, `facts-ui` reads these from a collection named `meteor_Facts_server`.

## Server API

All of the following are methods on the exported `Facts` object and run on the server.

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

Facts.setUserIdFilter(userId => {
  const user = Meteor.users.findOne(userId);
  return user && user.isAdmin;
});
```

### `Facts.resetServerFacts()`

Clears all recorded facts for every package.

## Notes

> The package `README.md` describes `facts-base` as an internal Meteor package. It is documented here because it exports a public `Facts` API that app and package authors can call. The internal helpers prefixed with an underscore (e.g. `Facts._factsByPackage`) are intentionally **not** documented.

## See also

- `facts-ui` — a client package that subscribes to these facts and renders them with the <span v-pre>`{{> serverFacts}}`</span> template.
- `autopublish` — when present, changes the default visibility of facts to all users.
