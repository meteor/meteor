# Migration Strategy

This guide provides a recommended step-by-step order for migrating your Meteor 2.x application to Meteor 3.x. It is based on real-world migration experiences from projects like [WeKan](https://github.com/wekan/wekan/pull/6205), [Wework](https://github.com/nate-strauser/wework/pull/126), and several community migration reports.

::: tip
You don't have to complete every step before moving to the next. But following this general order will help you avoid common pitfalls and reduce the number of issues you face at each stage.
:::

## Step 1: Update to the Latest Meteor 2.x

Before jumping to Meteor 3, update your project to the latest Meteor 2.x release (2.16+). This gives you access to compatibility shims and warnings that make the transition smoother.

```bash
meteor update
```

Meteor 2.8+ introduced `*Async` methods alongside the existing sync ones, so you can start migrating your code incrementally while everything still works. See [Migrating to Async in v2](../migrating-to-async-in-v2/index.md) for details.

## Step 2: Audit and Replace Unmaintained Packages

This is often the most time-consuming step. Many Atmosphere packages are unmaintained and will not work with Meteor 3.

1. Review your `.meteor/packages` file
2. For each package, check if a Meteor 3-compatible version exists on [Packosphere](https://packosphere.com/) or the [Meteor Community Packages](https://github.com/Meteor-Community-Packages) GitHub org
3. Replace or remove packages that have no compatible version

See [Package Replacements](./package-replacements.md) for a table of common replacements.

::: tip
Reduce your package footprint as much as possible before upgrading. Fewer packages means fewer migration issues and faster build times.
:::

## Step 3: Identify Sync Code with `WARN_WHEN_USING_OLD_API`

Run your app with this environment variable to find all places where you're using the old synchronous API:

```bash
WARN_WHEN_USING_OLD_API=true meteor run
```

This will log warnings for every sync MongoDB method call on the server (e.g., `findOne`, `insert`, `update`), helping you identify what needs to change.

## Step 4: Restructure Entry Points

Meteor 3 works best with explicit entry points. If your project relies on Meteor's implicit file loading, now is the time to restructure.

1. Create explicit `client/main.js` and `server/main.js` files (if you don't already have them)
2. Configure `mainModule` in your `package.json`:

```json
{
  "meteor": {
    "mainModule": {
      "client": "client/main.js",
      "server": "server/main.js"
    }
  }
}
```

3. Replace ambient globals with explicit imports:

```js
// Before: relying on global availability
Template.hello.helpers({ /* ... */ });

// After: explicit import
import { Template } from 'meteor/templating';
Template.hello.helpers({ /* ... */ });
```

::: warning
This restructuring step can be substantial for large applications. WeKan's migration involved splitting collection definitions (shared models vs. server-only hooks/methods) and rewriting their entire boot sequence.
:::

### Prepare for Express Early with `harry97:webapp`

Meteor 3 replaces Connect with Express in the `webapp` package. If your app uses `WebApp.connectHandlers` or custom middleware, you can start writing Express-compatible code **while still on Meteor 2.x** by using the [`harry97:webapp`](https://github.com/harryadel/harry97-webapp) package — a backport of Meteor 3's Express-based webapp for Meteor 2.17.

```bash
meteor add harry97:webapp
```

This gives you access to the same Express API that Meteor 3 uses (`WebApp.handlers`, `WebApp.express`, etc.) with backward-compatible aliases for `WebApp.connectHandlers` and `WebApp.rawConnectHandlers`. When you eventually upgrade to Meteor 3, your middleware code will already be compatible — just remove `harry97:webapp` and the core `webapp` package takes over.

## Step 5: Convert Sync Code to Async

On the server, all MongoDB collection methods must use their `*Async` counterparts:

```js
// Before
const doc = MyCollection.findOne({ _id: id });
MyCollection.insert({ name: 'test' });
MyCollection.update({ _id: id }, { $set: { name: 'updated' } });

// After
const doc = await MyCollection.findOneAsync({ _id: id });
await MyCollection.insertAsync({ name: 'test' });
await MyCollection.updateAsync({ _id: id }, { $set: { name: 'updated' } });
```

Don't forget to also convert:
- `Meteor.user()` → `await Meteor.userAsync()`
- `Meteor.call()` → `await Meteor.callAsync()`
- `Email.send()` → `await Email.sendAsync()`
- `cursor.fetch()` → `await cursor.fetchAsync()`
- `cursor.count()` → `await cursor.countAsync()`
- `cursor.forEach()` → `await cursor.forEachAsync()`
- `cursor.map()` → `await cursor.mapAsync()`
- `createIndex()` → `await createIndexAsync()`

The [jscodeshift codemod](https://github.com/minhna/meteor-async-migration) can automate much of this work.

## Step 6: Replace Deprecated Patterns

Remove patterns that depend on Fibers or other removed APIs. See [Removing Fibers Patterns](./removing-fibers.md) for detailed before/after examples. Key replacements:

- `Meteor.wrapAsync()` → `util.promisify()` or manual Promises
- `Promise.await()` → `await` in an `async` function
- `HTTP.call()` → `await fetch()` (using the `meteor/fetch` core package)
- `Npm.require('fibers')` → remove entirely

## Step 7: Run `meteor update` to 3.x

Once your code is async-ready and your packages are compatible:

```bash
meteor update
```

Then clean up:

```bash
rm -rf node_modules package-lock.json
meteor npm install
```

If you encounter memory issues during the update, see [Common Errors](./common-errors.md#cannot-enlarge-memory-array).

## Step 8: Test and Iterate

After upgrading:

1. Run your app and check the server console for errors
2. Test each feature systematically — async issues often manifest as silent failures or unexpected `undefined` values
3. Pay special attention to:
   - Meteor methods and publications
   - Collection hooks and allow/deny callbacks
   - Cron jobs and background tasks
   - Third-party API integrations

::: tip
Migrate one module at a time when possible. This lets you catch and fix errors incrementally instead of facing them all at once.
:::

For real-world migration writeups, migration PRs, and more supporting links, see [Migration Reports and External Resources](../index.md#migration-reports-and-external-resources).
