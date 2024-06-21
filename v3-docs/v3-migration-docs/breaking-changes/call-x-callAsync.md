# Can I still use Meteor.call?

You can, but we recommend you use it only to call the sync method.

In fact, we log a warning message if you use `Meteor.call` to call an async method.

If you use `Meteor.call` with async methods it can lead to unexpected behavior.

`Meteor.callAsync` is the standard for calling async methods.

# How to migrate from Meteor.call to Meteor.callAsync

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
