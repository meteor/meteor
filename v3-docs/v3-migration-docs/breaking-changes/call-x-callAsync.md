# Can I still use Meteor.call?

You can, but we recommend you use it only to call methods that do not have a method stub, or when the method stub is synchronous.

In fact, we log a warning message if you use `Meteor.call` to call a method with an async method stub since it can lead to unexpected behavior.

`Meteor.callAsync` is the standard for calling methods and supports any method, including those that have an async method stub.

Here is also important to remember what a stub is. A stub is a client-side simulation of the server-side method that runs immediately when the method is invoked, allowing the client to update its state optimistically before receiving the server's response. So, basically any Meteor method that is defined on the client is considered a stub.

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

# What are the limitations of Meteor.callAsync

When we introduced [async Method stubs](https://guide.meteor.com/2.8-migration.html#callasync) the implementation brought some [limitations](https://github.com/zodern/fix-async-stubs#:~:text=Specifically%2C%20while%20an,used%20in%20stubs).

Those limitations were addressed in this [package](https://github.com/zodern/fix-async-stubs/) created by [Zodern](https://github.com/zodern), and later, we moved the solution to the [core](https://github.com/meteor/meteor/blob/ecdfd3c610fbe5334eee024702fe0c354944f58b/packages/ddp-client/client/queueStubsHelpers.js). 

But there is no perfect solution to the problems with async stubs.

To ensure other code will not run while an async stub is running, async stubs can not use these API's:

- fetch/XMLHttpRequest
- setTimeout or setImmediate
- indexedDB
- web workers
- any other async web api's that wait on macrotasks

Using these API's could allow other code to run before the async stub finishes.

If one of these API's are used, a warning will be shown in the console:

```
Method stub (<method name>) took too long and could cause unexpected problems. Learn more at https://v3-migration-docs.meteor.com/breaking-changes/call-x-callAsync.html#what-are-the-limitations-of-call-meteor-callasync
```
