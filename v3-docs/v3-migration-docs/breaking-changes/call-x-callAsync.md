# Meteor.call x Meteor.callAsync

::: tip

Use `Meteor.callAsync` instead of `Meteor.call` when handling async methods. If you use `Meteor.call` with
async methods it can lead to unexpected behavior.

Using `Meteor.callAsync` will make your code more predictable and easier to maintain.

:::

Example of how to migrate from `Meteor.call` to `Meteor.callAsync`:

::: code-group

```js [v2-client.jsx]
import { Meteor } from "meteor/meteor";

let data, error;

Meteor.call("getAllData", (err, res) => {
  // [!code highlight]
  if (err) {
    error = err;
  } else {
    data = res;
  }
});

// render data or error
```

```js [v2-server.js]
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";

const MyCollection = new Mongo.Collection("myCollection");

Meteor.methods({
  getAllData() {
    return MyCollection.find().fetch(); // [!code highlight]
  },
});
```

```js [v3-client.jsx]
import { Meteor } from "meteor/meteor";

try {
  const data = await Meteor.callAsync("getAllData"); // [!code highlight]
  // render data
} catch (error) {
  // render error
}
```

```js [v3-server.js]
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";

const MyCollection = new Mongo.Collection("myCollection");

Meteor.methods({
  async getAllData() {
    return await MyCollection.find().fetchAsync(); // [!code highlight]
  },
});
```

:::

## Rules of using `Meteor.callAsync` & `Meteor.call`

You can still use `Meteor.callAsync` and `Meteor.call` together. But there are some catches that you need to
pay attention to. Let's go over them.

### How to NOT use them together

These are for **async** method when called with `Meteor.callAsync` or `Meteor.call`.

**Case 1**: Calling `Meteor.callAsync` and then right after calling `Meteor.call` when the methods have stubs.

```js
import { Meteor } from "meteor/meteor";

Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));

Meteor.call("SOME_ASYNC_METHOD_WITH_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});
```

**Case 2**: Calling `Meteor.call` and then right after calling `Meteor.callAsync` when the methods have stubs.

```js
import { Meteor } from "meteor/meteor";

Meteor.call("SOME_ASYNC_METHOD_WITH_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});

Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));
```

**Case 3**: Calling `Meteor.callAsync` and then right after calling `Meteor.call` but the method called with `Meteor.call`
does not have stub.

```js
import { Meteor } from "meteor/meteor";

Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));

Meteor.call("SOME_ASYNC_METHOD_WITHOUT_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});
```

**Case 4**: Calling `Meteor.call` and then right after calling `Meteor.callAsync` but the method called with `Meteor.call`
does not have stub.

```js
import { Meteor } from "meteor/meteor";

Meteor.call("SOME_ASYNC_METHOD_WITHOUT_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});

Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));
```

If you try to use `Meteor.call` and `Meteor.callAsync` at the same time, like in the examples above, you'll get
unexpected behavior.

### How you COULD use them together for methods with stub

Technically, you can use them together for methods with stub if `Meteor.callAsync`
is called first, and you wait for it to finish:

```js
import { Meteor } from "meteor/meteor";

await Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));

// SOME_ASYNC_METHOD_WITHOUT_STUB would work as well
Meteor.call("SOME_ASYNC_METHOD_WITH_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});
```

### How you POSSIBLY can use them without await

If you're calling methods that **DO NOT** have stubs, you can call `Meteor.callAsync` right after a `Meteor.call` and vice-versa:

```js
import { Meteor } from "meteor/meteor";

Meteor.callAsync("SOME_ASYNC_METHOD_WITHOUT_STUB")
  .then((data) => console.log(data))
  .catch((err) => console.log(err));

Meteor.call("SOME_ASYNC_METHOD_WITHOUT_STUB", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    console.log(res);
  }
});
```

### How you SHOULD use them

By default, use `Meteor.callAsync`. It'll work for sync and async methods. But if you wish to use `Meteor.call` in some
specific scenario, use it only when calling sync methods.

Here are some examples:

```js
import { Meteor } from "meteor/meteor";

// [!code highlight] Example 1: Call serveral Meteor.callAsync in a row.
// [!code highlight] It doesn't matter if the method has stub or not.

Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB");
Meteor.callAsync("SOME_ASYNC_METHOD_WITHOUT_STUB");
Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB");
Promise.all([
  Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB"),
  Meteor.callAsync("SOME_ASYNC_METHOD_WITHOUT_STUB"),
  Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB"),
]).then(([data1, data2]) => {
  console.log(data1, data2);
});

// [!code highlight] Example 2: Call several async methods with `Meteor.callAsync`
// [!code highlight] and several sync methods with `Meteor.call` in row

Meteor.call("SOME_SYNC_METHOD");
Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB");
Meteor.call("SOME_SYNC_METHOD");
Meteor.callAsync("SOME_ASYNC_METHOD_WITH_STUB");
Meteor.callAsync("SOME_ASYNC_METHOD_WITHOUT_STUB");
```

As you can see, if you follow the rule of calling async methods with `Meteor.callAsync` and sync methods with 
`Meteor.call` you can use them as you want. But ideally, after you finish your migration, you should have any `Meteor.call`
in your code, so you don't need to worry about these scenarios.
