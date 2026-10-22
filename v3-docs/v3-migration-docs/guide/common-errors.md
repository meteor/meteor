# Common Errors

Below you will find a collection of documented common errors you may encounter when migrating from Meteor version 2 to version 3. Each error includes an explanation of why it happens and a recommended solution.

If there is any other issues you think should be here, please report them in our [Forums](https://forums.meteor.com/).

## Cannot Enlarge Memory Array

**Why this happens:**

This error occurs when the memory allocated for the build process is insufficient, often due to the large number of dependencies being processed in the migration to Meteor 3. As you update, the system tries to handle all dependencies, and older or larger packages may cause the build to run out of memory.

**How to solve it:**

To resolve this issue, follow these steps:

1. Temporarily reduce the number of meteor packages in your `.meteor/packages` file by removing non-essential or outdated ones.
2. Rebuild the application with the minimal set of packages.
3. Gradually add back the packages, one at a time, to identify which one(s) might be causing the issue.
4. Update or replace outdated packages as needed.

By reducing the package footprint and updating dependencies, you should be able to complete the migration without memory-related errors.

This error was lastly reported [here](https://forums.meteor.com/t/meteor-update-fails/62171).

## Unhandled Promise Rejections in Async Callbacks

**Why this happens:**

When converting synchronous callbacks to async (e.g., in cron jobs, collection hooks, or event handlers), unhandled promise rejections can crash the server. This often manifests as seemingly unrelated errors like WebSocket connection failures or silent startup crashes.

A common case is `quave:synced-cron` where an async cron callback rejects without being caught, bringing down the entire process.

**How to solve it:**

Ensure all async callbacks properly handle errors:

```js
// Problem — unhandled rejection crashes the process
SyncedCron.add({
  name: 'My Job',
  schedule(parser) { return parser.text('every 1 hour'); },
  async job() {
    await SomeCollection.updateAsync(/* ... */); // [!code error] if this throws, process crashes
  }
});

// Solution — wrap in try/catch
SyncedCron.add({
  name: 'My Job',
  schedule(parser) { return parser.text('every 1 hour'); },
  async job() {
    try { // [!code highlight]
      await SomeCollection.updateAsync(/* ... */);
    } catch (error) { // [!code highlight]
      console.error('Cron job failed:', error); // [!code highlight]
    } // [!code highlight]
  }
});
```

If a package does not support async callbacks, consider lazy-loading it inside `Meteor.startup()` to ensure the environment is fully initialized first.

## SimpleSchema and Collection2 Changes

**Why this happens:**

`aldeed:collection2` v4 (the Meteor 3-compatible version) now bundles `aldeed:simple-schema` internally as an Atmosphere package. This replaces the previous setup where you installed the `simpl-schema` npm package separately. The npm `simpl-schema` v3+ actually dropped all Meteor support, so the Atmosphere package is a hard-fork that maintains Meteor-specific features like Tracker reactivity.

**Common issues and solutions:**

1. **Do not use the npm `simpl-schema` v3+ with Collection2 v4** — they conflict. Collection2 v4 bundles the compatible `aldeed:simple-schema` automatically:

```bash
# Remove the npm package if present
meteor npm remove simpl-schema # [!code highlight]
# Collection2 v4 bundles aldeed:simple-schema — no separate install needed
```

2. **Static vs. dynamic loading** — Collection2 v4 offers two import modes:

```js
// Static loading (default) — loaded immediately, increases initial bundle size
import 'meteor/aldeed:collection2'; // [!code highlight]

// Dynamic loading — deferred, reduces initial bundle size
import 'meteor/aldeed:collection2/dynamic'; // [!code highlight]
// You must explicitly call load() before using schemas
await Collection2.load(); // [!code highlight]
```

If your schemas aren't being applied or you get errors about missing schema methods, ensure you're using the right loading mode and calling `Collection2.load()` if using dynamic imports.

3. **Dot-notation fields need explicit parent objects** — schemas using nested fields like `'address.city'` may need the parent `address` object declared explicitly.

## Package Loading Order Issues

**Why this happens:**

Meteor 3's stricter module system changes the order in which packages and their side effects are loaded. Packages that relied on implicit loading order (e.g., a package that injects itself globally before another package reads it) may break.

**How to solve it:**

1. Use explicit `import` statements in your entry point files (`client/main.js`, `server/main.js`) to control load order
2. If a package needs to run before another, import it earlier in your entry point
3. For packages that register side effects (like template helpers or collection extensions), ensure they are imported before the code that depends on them

## `Meteor.bindEnvironment` Required for External Callbacks

**Why this happens:**

Code running outside of Meteor's async context (e.g., in Express middleware, third-party library callbacks, or raw Node.js event handlers) does not have access to Meteor's environment variables or DDP context. This was sometimes silently handled by Fibers but now requires explicit wrapping.

**How to solve it:**

Wrap external callbacks with `Meteor.bindEnvironment`:

```js
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

// Problem — no Meteor context in Express handler
WebApp.handlers.use('/webhook', (req, res) => {
  const user = Meteor.user(); // [!code error] throws error — no Meteor context
});

// Solution — wrap with bindEnvironment
WebApp.handlers.use('/webhook', Meteor.bindEnvironment(async (req, res) => { // [!code highlight]
  const user = await Meteor.userAsync(); // [!code highlight] works
  res.send('OK');
})); // [!code highlight]
```

## Monkey-Patching Timing Issues

**Why this happens:**

Packages or application code that monkey-patches Meteor APIs (e.g., overriding `Meteor.publish`, wrapping collection methods) may fail if the target API isn't available yet when the patching code runs. Meteor 3's module loading changes can alter the timing of when code executes.

**How to solve it:**

Wrap monkey-patching code in `Meteor.startup()`:

```js
// Problem — patching may run before the target API is ready
Meteor.publish = patchedPublish(Meteor.publish); // [!code error]

// Solution — defer to startup
Meteor.startup(() => { // [!code highlight]
  Meteor.publish = patchedPublish(Meteor.publish); // [!code highlight]
}); // [!code highlight]
```

For more complex cases, create a dedicated internal package that controls load order through `api.use()` dependencies in `package.js`.
