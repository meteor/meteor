# Removing Fibers Patterns

Meteor 3 removes the Fibers dependency entirely. This page shows before/after examples for the most common Fibers-dependent patterns you'll encounter during migration.

For background on why Fibers was removed, see the [FAQ](../frequently-asked-questions/index.md#what-is-fibers).

## `Meteor.wrapAsync` → Promises

`Meteor.wrapAsync` no longer exists. Replace it with `util.promisify` or manual Promise wrapping.

```js
// Before
import { Meteor } from 'meteor/meteor';

const syncFunction = Meteor.wrapAsync(someCallbackFunction); // [!code error]
const result = syncFunction(arg1, arg2); // [!code error]

// After — using util.promisify
import { promisify } from 'util';

const asyncFunction = promisify(someCallbackFunction);
const result = await asyncFunction(arg1, arg2); // [!code highlight]
```

If the callback doesn't follow the standard `(error, result)` pattern, wrap it manually:

```js
// After — manual Promise wrapping
function asyncFunction(arg1, arg2) {
  return new Promise((resolve, reject) => {
    someCallbackFunction(arg1, arg2, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

const result = await asyncFunction(arg1, arg2); // [!code highlight]
```

## `Promise.await` → `async/await`

`Promise.await` was a Fibers-based synchronous wait. Replace with standard `await` inside an `async` function.

```js
// Before
const result = Promise.await(someAsyncOperation()); // [!code error]

// After
const result = await someAsyncOperation(); // [!code highlight]
```

::: warning
The function containing `await` must be declared as `async`. This often means you need to make the calling function async too, which can cascade up the call chain.
:::

## `Npm.require('fibers')` → Remove

Any direct usage of the `fibers` npm module must be removed entirely.

```js
// Before
const Fiber = Npm.require('fibers'); // [!code error]
const Future = Npm.require('fibers/future'); // [!code error]

const future = new Future(); // [!code error]
someCallback((err, result) => { // [!code error]
  if (err) future.throw(err); // [!code error]
  else future.return(result); // [!code error]
}); // [!code error]
const result = future.wait(); // [!code error]

// After
const result = await new Promise((resolve, reject) => { // [!code highlight]
  someCallback((err, result) => { // [!code highlight]
    if (err) reject(err); // [!code highlight]
    else resolve(result); // [!code highlight]
  }); // [!code highlight]
}); // [!code highlight]
```

## `HTTP.call` → `fetch`

The old `HTTP` package is replaced by the `fetch` core Meteor package.

```js
// Before
import { HTTP } from 'meteor/http'; // [!code error]

const response = HTTP.call('GET', 'https://api.example.com/data', { // [!code error]
  headers: { Authorization: `Bearer ${token}` } // [!code error]
}); // [!code error]
const data = response.data; // [!code error]

// After
import { fetch } from 'meteor/fetch'; // [!code highlight]

const response = await fetch('https://api.example.com/data', { // [!code highlight]
  headers: { Authorization: `Bearer ${token}` } // [!code highlight]
}); // [!code highlight]
const data = await response.json(); // [!code highlight]
```

For POST requests:

```js
// Before
HTTP.call('POST', url, { // [!code error]
  data: { key: 'value' } // [!code error]
}); // [!code error]

// After
await fetch(url, { // [!code highlight]
  method: 'POST', // [!code highlight]
  headers: { 'Content-Type': 'application/json' }, // [!code highlight]
  body: JSON.stringify({ key: 'value' }) // [!code highlight]
}); // [!code highlight]
```

## `Email.send` → `Email.sendAsync`

```js
// Before
import { Email } from 'meteor/email';

Email.send({ // [!code error]
  to: 'user@example.com',
  from: 'noreply@example.com',
  subject: 'Hello',
  text: 'World'
}); // [!code error]

// After
await Email.sendAsync({ // [!code highlight]
  to: 'user@example.com',
  from: 'noreply@example.com',
  subject: 'Hello',
  text: 'World'
}); // [!code highlight]
```

## Synchronous `createIndex` → `createIndexAsync`

```js
// Before
MyCollection._ensureIndex({ email: 1 }); // [!code error]

// After
await MyCollection.createIndexAsync({ email: 1 }); // [!code highlight]
```

## Callback-Based Patterns → `async/await`

Many older Meteor patterns used callbacks or synchronous Fiber-based code. Convert these to `async/await`:

```js
// Before — callback in Meteor.startup
Meteor.startup(() => {
  const settings = Settings.findOne({ key: 'app' }); // [!code error]
  if (!settings) {
    Settings.insert({ key: 'app', value: defaults }); // [!code error]
  }
});

// After
Meteor.startup(async () => { // [!code highlight]
  const settings = await Settings.findOneAsync({ key: 'app' }); // [!code highlight]
  if (!settings) {
    await Settings.insertAsync({ key: 'app', value: defaults }); // [!code highlight]
  }
});
```

```js
// Before — synchronous publish
Meteor.publish('userPosts', function () {
  const user = Meteor.users.findOne(this.userId); // [!code error]
  return Posts.find({ authorId: user._id }); // [!code error]
});

// After
Meteor.publish('userPosts', async function () { // [!code highlight]
  const user = await Meteor.users.findOneAsync(this.userId); // [!code highlight]
  return Posts.find({ authorId: user._id });
});
```
