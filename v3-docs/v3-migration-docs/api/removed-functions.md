# Removed Functions

In v3, we decided to remove some functions that do not make more sense in the current context.
Here is the list of removed functions:

  - `Promise.await`
  - `Fibers`
  - `Meteor.wrapAsync`

::: tip

These functions were only available in the server-side.

:::

::: tip

You can automatically remove the deprecated functions by running the [following codemod](https://go.codemod.com/meteor-removed-functions):

```bash
npx codemod@latest meteor/v3/removed-functions
```

Note that this codemod removes `Promise.await` and `Meteor.wrapAsync` functions. For info on `Fibers`, use the codemod mentioned [here](#fibers).

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

::: tip

You can automatically replace `Fibers` with `async/await` by running the [following codemod](https://go.codemod.com/meteor-fibers-async):

```bash
npx codemod@latest meteor/v3/fibers-to-async-promises
```

:::

## Meteor.wrapAsync

It is no longer necessary, you can use `async/await` directly in your code.

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
