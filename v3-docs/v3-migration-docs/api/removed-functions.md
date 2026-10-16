# Removed Functions

In v3, we decided to remove some functions that do not make more sense in the current context.
Here is the list of removed functions:

  - `Promise.await`
  - `Fibers`


::: tip

These functions were only available in the server-side.

:::

## Promise.await

It is no longer necessary, you can use `await` directly in your code.

```javascript

// Before

function someFunction() {
  const result = Promise.await(someAsyncFunction());
  return result;
}

// After

async function someFunction() {
  const result = await someAsyncFunction();
  return result;
}

```



## Fibers

Fibers are no longer necessary, you can use `async/await` directly in your code.

```javascript

// Before
const Future = Npm.require('fibers/future');

function someFunction() {
  const future = new Future();
  someAsyncFunction((error, result) => {
    if (error) {
      future.throw(error);
    } else {
      future.return(result);
    }
  });
  return future.wait();
}

// After

async function someFunction() {
  return new Promise((resolve, reject) => {
    someAsyncFunction((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

```

## Meteor.wrapAsync

`Meteor.wrapAsync` was not removed: it still exists in Meteor 3 and still works when you pass a callback to the wrapped function. What is gone is the Fibers-based synchronous mode: on the server, calling the wrapped function without a callback no longer blocks and returns the result — it now returns `undefined`, and errors are only logged via `Meteor._debug` instead of being thrown, so old synchronous call sites fail silently rather than erroring.

Replace synchronous usage with `async/await`. To wrap callback APIs, use `util.promisify` (server) or `Meteor.promisify` (client and server).

```javascript

// Before

const wrappedFunction = Meteor.wrapAsync(someAsyncFunction);

function someFunction() {
  const result = wrappedFunction();
  return result;
}

// After

async function someFunction() {
  const result = await someAsyncFunction();
  return result;
}

```

For a full list of changes check the [changelog](https://v3-docs.meteor.com/history.html#changelog) for Meteor v3
