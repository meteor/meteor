# Top Level Await

[Top-level await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#top_level_await) (TLA) allows you to use `await` in the top-level of a module or file instead of only in async functions. One way to view it is as if every file runs inside an `async` function. 

Here is an example of using top-level await on the server. When this file is loaded, the `await` will cause the module to wait for the count before the code in the rest of the module is run.

```js
const Links = new Mongo.Collection('links');

// Async code using top-level await.
// The module waits for this to finish before continuing
const count = await Links.find().countAsync();

if (count === 0) {
  await Links.insertAsync({ url: 'https://meteor.com' });
}
```

Before Meteor 3, async code using fibers could run at the top level of a module. Top-level await allows similar code to work without fibers. This article will cover a few differences.

Meteor's implementation of top-level await tries to closely follow the specification. However, there are currently some differences in how Meteor handles circular dependencies.

## Using Top Level Await

Top-level await can be used in any app or package that uses the `ecmascript`, `typescript`, or `coffeescript` packages, or that uses any other build plugin that compiles top-level await using reify.
Generally, if you can use ECMAScript modules, then you can also use top-level await.

There are some extra considerations when using top-level await in packages. They are covered later in this article.

Top-level await is only enabled by default on the server. You can enable it for the client by setting the env var `METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT` to `true`. There are a couple known issues with using TLA on the client:

1. It breaks any files in `/client/compatibility` since it now wraps those files in a function
2. Hot module replacement has not been updated to work with TLA

## Async Modules

With top-level await, some modules are considered async, which affects how they behave. There are two ways a module can become an async module:
1. It uses top-level await
2. It imports a module that is async

For example, this module (`setup.js`) would be async because it uses top-level await:

```js
await setupLanguages();
```

This module (`main.js`) would be sync:

```js
console.log('in main.js');
```

However, if it imports `setup.js` which does use top-level await, then `main.js` also becomes async.

```js
import './setup.js';

console.log('in main.js');
```

## Require

When using `require` to load an async module, instead of directly returning a module's exports, it will return a promise that resolves to the module's exports.

```js
// resolves to the exports of init.js
const promise = require('./init.js');
```

If you are using `require`, this does mean you need to be careful when adding or removing top-level await in a file since you also have to update where the module is required.
Since a module becomes async if it depends on an async module, this could affect more than just the individual modules using top-level await.

When possible, you can use ECMAScript import syntax or dynamic imports instead so you don't have to worry about which modules are sync or async.

## Nested Imports

Nested imports refer to using `import ...` outside of the root of a module, for example in an if block or a function.

```js
if (Meteor.isClient) {
  import './init-client.js';
}

export function showNotification(message) {
  import show from './notifications.js';

  show(message);
}
```

This feature is unique to Meteor, so the top-level await specification wasn't written to work with nested imports. Using nested imports to import a sync module continues to work, but it will throw an error if used to import an async module. You can use `require` or dynamic imports for async modules in these situations.

## Using in Packages

Top-level await is only supported starting in Meteor 3.  Published build plugins are able to use top-level await in older Meteor versions since the runtime is bundled when they are published, though in development they require Meteor 3.

If you want to ensure your package only runs in versions of Meteor that support top-level await, you can have your package use `isobuild:top-level-await`:

```js
Package.onUse(function (api) {
  // Do not allow this package to be used in pre-Meteor 3 apps.
  api.use("isobuild:top-level-await@3.0.0");
});
```

When importing a package that does not have a lazy main module, it will work the same whether a package uses top-level await or not. This is true even when using `require`. This allows packages to add or remove top-level await without it being a breaking change.

There are a couple of cases where adding or removing top-level await from a module in a package could be considered a breaking change:

1. If specific modules are require'd from a package. For example: `require('meteor/zodern:aurorae/svelte.js')`. When importing a specific module from a package, `require` changes its behavior based on if the module is async or not.
2. If a package that has lazy main modules is require'd. Unlike normal packages, `require` will return a promise if the lazy main module is an async module. Changing if the lazy main module is async or not should be considered a breaking change for the package.

## Module and Package Execution Order

Normally, modules are run one at a time. This was even true when using async code with fibers in the root of a module. However, top-level await is different - it allows siblings (modules that do not depend on each other) to sometimes run in parallel. This can allow the app to load faster, which is especially important on the client. However, this could cause code to run in an unexpected order if you are used to how Meteor works with fibers.

This also applies to packages. Packages that do not directly or indirectly depend on each other can load in parallel if they use top-level await.

Modules that are eagerly evaluated (added in packages with `api.addFiles`, or outside of `imports` in apps that do not have a main module) and not directly imported continue to run one at a time, even if they use top-level await since it is common for these modules to implicitly depend on the previous modules.
