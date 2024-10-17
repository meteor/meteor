# Meteor API

Meteor global object has many functions and properties for handling utilities, network and much more.

### Core APIs {#core}

<ApiBox name="Meteor.startup" hasCustomExample/>

On a server, the function will run as soon as the server process is
finished starting. On a client, the function will run as soon as the DOM
is ready. Code wrapped in `Meteor.startup` always runs after all app
files have loaded, so you should put code here if you want to access
shared variables from other files.

The `startup` callbacks are called in the same order as the calls to
`Meteor.startup` were made.

On a client, `startup` callbacks from packages will be called
first, followed by `<body>` templates from your `.html` files,
followed by your application code.

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";
import { LinksCollection } from "/imports/api/links";

Meteor.startup(async () => {
  // If the Links collection is empty, add some data.
  if ((await LinksCollection.find().countAsync()) === 0) {
    await LinksCollection.insertAsync({
      title: "Do the Tutorial",
      url: "https://www.meteor.com/tutorials/react/creating-an-app",
    });
  }
});
```

```js [client.js]
import React from "react";
import { createRoot } from "react-dom/client";
import { Meteor } from "meteor/meteor";
import { App } from "/imports/ui/App";

// Setup react root
Meteor.startup(() => {
  const container = document.getElementById("react-target");
  const root = createRoot(container);
  root.render(<App />);
});
```

:::

<ApiBox name="Meteor.promisify" />
<ApiBox name="Meteor.defer" />
<ApiBox name="Meteor.absoluteUrl" />
<ApiBox name="Meteor.settings" />
<ApiBox name="Meteor.release" />

<ApiBox name="Meteor.isClient" />

<ApiBox name="Meteor.isServer" />

::: danger
`Meteor.isServer` can be used to limit where code runs, but it does not prevent code from
being sent to the client. Any sensitive code that you don’t want served to the client,
such as code containing passwords or authentication mechanisms,
should be kept in the `server` directory.
:::

<ApiBox name="Meteor.isCordova" />
<ApiBox name="Meteor.isDevelopment" />
<ApiBox name="Meteor.isProduction" />
<ApiBox name="Meteor.isModern" />
<ApiBox name="Meteor.isTest" />
<ApiBox name="Meteor.isAppTest" />
<ApiBox name="Meteor.isPackageTest" />

<ApiBox name="Meteor.gitCommitHash" />

### Method APIs {#methods}

Meteor Methods are Remote Procedure Calls (RPCs) are functions defined by `Meteor.methods`
and called by [`Meteor.call`](#Meteor-call).

<ApiBox name="Meteor.methods" hasCustomExample/>

The most basic way to define a method is to provide a function:

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";

Meteor.methods({
  sum(a, b) {
    return a + b;
  },
});
```

```js [client.js]
import { Meteor } from "meteor/meteor";

const result = await Meteor.callAsync("sum", 1, 2);
console.log(result); // 3
```

:::

You can use `Meteor.methods` to define multiple methods at once.

You can think of `Meteor.methods` as a way of defining a remote object that is your server API.

A more complete example:

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";
import { check } from "meteor/check";
import { LinksCollection } from "/imports/api/links";

Meteor.methods({
  async addLink(link) {
    check(link, String); // check if the link is a string

    // Do stuff...
    const linkID = await LinksCollection.insertAsync(link);
    if (/* you want to throw an error */) {
      throw new Meteor.Error('Something is wrong', "Some details");
    }

    return linkID;
  },

  bar() {
    // Do other stuff...
    return 'baz';
  }
});
```

```js [client.js]
import React from "react";
import { Meteor } from "meteor/meteor";

function Component() {
  const addLink = () =>
    Meteor.callAsync(
      "addLink",
      "https://www.meteor.com/tutorials/react/creating-an-app"
    );

  return (
    <div>
      <button onClick={addLink}>Add Link</button>
    </div>
  );
}
```

:::

Calling `methods` on the server defines functions that can be called remotely by
clients. They should return an [EJSON](./EJSON)-able value or throw an
exception. Inside your method invocation, `this` is bound to a method
invocation object, which provides the following:

- `isSimulation`: a boolean value, true if this invocation is a stub.
- `unblock`: when called, allows the next method from this client to
  begin running.
- `userId`: the id of the current user.
- `setUserId`: a function that associates the current client with a user.
- `connection`: on the server, the [connection](#Meteor-onConnection) this method call was received on.

Calling `methods` on the client defines _stub_ functions associated with
server methods of the same name. You don't have to define a stub for
your method if you don't want to. In that case, method calls are just
like remote procedure calls in other systems, and you'll have to wait
for the results from the server.

If you do define a stub, when a client invokes a server method it will
also run its stub in parallel. On the client, the return value of a
stub is ignored. Stubs are run for their side-effects: they are
intended to _simulate_ the result of what the server's method will do,
but without waiting for the round trip delay. If a stub throws an
exception it will be logged to the console.

You use methods all the time, because the database mutators
([`insert`](./collections#Mongo-Collection-insert), [`update`](./collections#Mongo-Collection-update), [`remove`](./collections#Mongo-Collection-remove)) are implemented
as methods. When you call any of these functions on the client, you're invoking
their stub version that update the local cache, and sending the same write
request to the server. When the server responds, the client updates the local
cache with the writes that actually occurred on the server.

You don't have to put all your method definitions into a single `Meteor.methods`
call; you may call it multiple times, as long as each method has a unique name.

If a client calls a method and is disconnected before it receives a response,
it will re-call the method when it reconnects. This means that a client may
call a method multiple times when it only means to call it once. If this
behavior is problematic for your method, consider attaching a unique ID
to each method call on the client, and checking on the server whether a call
with this ID has already been made. Alternatively, you can use
[`Meteor.apply`](#Meteor-apply) with the noRetry option set to true.

Read more about methods and how to use them in the [Methods](http://guide.meteor.com/methods.html) article in the Meteor Guide.

<ApiBox name="Meteor.isAsyncCall" hasCustomExample/>

This method can be used to determine if the current method invocation is
asynchronous. It returns true if the method is running on the server and came from
an async call(`Meteor.callAsync`)

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";

Meteor.methods({
  async foo() {
    return Meteor.isAsyncCall();
  },
});
```

```js [client.js]
import { Meteor } from "meteor/meteor";

const result = await Meteor.callAsync("foo");
console.log(result); // true

Meteor.call("foo", (err, result) => {
  console.log(result); // false
});
```

:::

## this.userId {#methods-userId}

The user id is an arbitrary string &mdash; typically the id of the user record
in the database. You can set it with the `setUserId` function. If you're using
the [Meteor accounts system](./accounts.md) then this is handled for you.

```js
import { Meteor } from "meteor/meteor";

Meteor.methods({
  foo() {
    console.log(this.userId);
  },
});
```

## this.setUserId {#methods-setUserId}

Call this function to change the currently logged-in user on the
connection that made this method call. This simply sets the value of
`userId` for future method calls received on this connection. Pass
`null` to log out the connection.

If you are using the [built-in Meteor accounts system](./accounts) then this
should correspond to the `_id` field of a document in the
[`Meteor.users`](./accounts.md#Meteor-user) collection.

`setUserId` is not retroactive. It affects the current method call and
any future method calls on the connection. Any previous method calls on
this connection will still see the value of `userId` that was in effect
when they started.

If you also want to change the logged-in user on the client, then after calling
`setUserId` on the server, call `Meteor.connection.setUserId(userId)` on the
client.

```js
import { Meteor } from "meteor/meteor";

Meteor.methods({
  foo() {
    this.setUserId("some-id");
  },
});
```

## this.connection {#methods-connection}

Access inside a method invocation. The [connection](#Meteor-onConnection) that this method was received on.
null if the method is not associated with a connection,
eg. a server initiated method call. Calls to methods
made from a server method which was in turn initiated from the client share the same
connection.

<ApiBox name="Meteor.Error" />

For example:

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";
// on the server, pick a code unique to this error
// the reason field should be a useful debug message
Meteor.methods({
  methodName() {
    throw new Meteor.Error(
      "logged-out",
      "The user must be logged in to post a comment."
    );
  },
});
```

```js [client.js]
import { Meteor } from "meteor/meteor";
// on the client
Meteor.call("methodName", function (error) {
  // identify the error
  if (error && error.error === "logged-out") {
    // show a nice error message
    Session.set("errorMessage", "Please log in to post a comment.");
  }
});
```

:::

If you want to return an error from a method, throw an exception. Methods can
throw any kind of exception. But `Meteor.Error` is the only kind of error that
a server will send to the client. If a method function throws a different
exception, then it will be mapped to a sanitized version on the
wire. Specifically, if the `sanitizedError` field on the thrown error is set to
a `Meteor.Error`, then that error will be sent to the client. Otherwise, if no
sanitized version is available, the client gets
`Meteor.Error(500, 'Internal server error')`.

<ApiBox name="Meteor.call" hasCustomExample/>

This is how to invoke a method with a sync stub. It will run the method on the server. If a
stub is available, it will also run the stub on the client. (See also
[`Meteor.apply`](#Meteor-apply), which is identical to `Meteor.call` except that
you specify the parameters as an array instead of as separate arguments and you
can specify a few options controlling how the method is executed.)

If you include a callback function as the last argument (which can't be
an argument to the method, since functions aren't serializable), the
method will run asynchronously: it will return nothing in particular and
will not throw an exception. When the method is complete (which may or
may not happen before `Meteor.call` returns), the callback will be
called with two arguments: `error` and `result`. If an error was thrown,
then `error` will be the exception object. Otherwise, `error` will be
`undefined` and the return value (possibly `undefined`) will be in `result`.

```js
// Asynchronous call
Meteor.call('foo', 1, 2, (error, result) => { ... });
```

If you do not pass a callback on the server, the method invocation will
block until the method is complete. It will eventually return the
return value of the method, or it will throw an exception if the method
threw an exception. (Possibly mapped to 500 Server Error if the
exception happened remotely and it was not a `Meteor.Error` exception.)

```js
// Synchronous call
const result = Meteor.call("foo", 1, 2);
```

On the client, if you do not pass a callback and you are not inside a
stub, `call` will return `undefined`, and you will have no way to get
the return value of the method. That is because the client doesn't have
fibers, so there is not actually any way it can block on the remote
execution of a method.

Finally, if you are inside a stub on the client and call another
method, the other method is not executed (no RPC is generated, nothing
"real" happens). If that other method has a stub, that stub stands in
for the method and is executed. The method call's return value is the
return value of the stub function. The client has no problem executing
a stub synchronously, and that is why it's okay for the client to use
the synchronous `Meteor.call` form from inside a method body, as
described earlier.

Meteor tracks the database writes performed by methods, both on the client and
the server, and does not invoke `asyncCallback` until all of the server's writes
replace the stub's writes in the local cache. In some cases, there can be a lag
between the method's return value being available and the writes being visible:
for example, if another method still outstanding wrote to the same document, the
local cache may not be up to date until the other method finishes as well. If
you want to process the method's result as soon as it arrives from the server,
even if the method's writes are not available yet, you can specify an
`onResultReceived` callback to [`Meteor.apply`](#Meteor-apply).

::: warning
Use `Meteor.call` only to call methods that do not have a stub, or have a sync stub. If you want to call methods with an async stub, `Meteor.callAsync` can be used with any method.
:::


<ApiBox name="Meteor.callAsync" />

`Meteor.callAsync` is just like `Meteor.call`, except that it'll return a promise that you need to solve to get the server result. Along with the promise returned by `callAsync`, you can also handle `stubPromise` and `serverPromise` for managing client-side simulation and server response.

The following sections guide you in understanding these promises and how to manage them effectively.

#### serverPromise

```javascript
try {
	await Meteor.callAsync('greetUser', 'John');
	// 🟢 Server ended with success
} catch(e) {
	console.error("Error:", error.reason); // 🔴 Server ended with error
}

Greetings.findOne({ name: 'John' }); // 🗑️ Data is NOT available
```

#### stubPromise

```javascript
await Meteor.callAsync('greetUser', 'John').stubPromise;

// 🔵 Client simulation
Greetings.findOne({ name: 'John' }); // 🧾 Data is available (Optimistic-UI)
```

#### stubPromise and serverPromise

```javascript
const { stubPromise, serverPromise } = Meteor.callAsync('greetUser', 'John');

await stubPromise;

// 🔵 Client simulation
Greetings.findOne({ name: 'John' }); // 🧾 Data is available (Optimistic-UI)

try {
  await serverPromise;
  // 🟢 Server ended with success
} catch(e) {
  console.error("Error:", error.reason); // 🔴 Server ended with error
}

Greetings.findOne({ name: 'John' }); // 🗑️ Data is NOT available
```

#### Meteor 2.x contrast

For those familiar with legacy Meteor 2.x, the handling of client simulation and server response was managed using fibers, as explained in the following section. This comparison illustrates how async inclusion with standard promises has transformed the way Meteor operates in modern versions.

``` javascript
Meteor.call('greetUser', 'John', function(error, result) {
  if (error) {
    console.error("Error:", error.reason); // 🔴 Server ended with error
  } else {
    console.log("Result:", result); // 🟢 Server ended with success
  }

  Greetings.findOne({ name: 'John' }); // 🗑️ Data is NOT available
});

// 🔵 Client simulation
Greetings.findOne({ name: 'John' }); // 🧾 Data is available (Optimistic-UI)
```


<ApiBox name="Meteor.apply" />

`Meteor.apply` is just like `Meteor.call`, except that the method arguments are
passed as an array rather than directly as arguments, and you can specify
options about how the client executes the method.

::: warning
Use `Meteor.apply` only to call methods that do not have a stub, or have a sync stub. If you want to call methods with an async stub, `Meteor.applyAsync` can be used with any method.
:::

<ApiBox name="Meteor.applyAsync" />

`Meteor.applyAsync` is just like `Meteor.apply`, except it is an async function, and it will consider that the stub is async.

### Publish and subscribe {#pubsub}

These functions control how Meteor servers publish sets of records and
how clients can subscribe to those sets.

<ApiBox name="Meteor.publish" hasCustomExample>
To publish records to clients, call `Meteor.publish` on the server with
two parameters: the name of the record set, and a _publish function_
that Meteor will call each time a client subscribes to the name.

Publish functions can return a
[`Collection.Cursor`](./collections.md#mongo_cursor), in which case Meteor
will publish that cursor's documents to each subscribed client. You can
also return an array of `Collection.Cursor`s, in which case Meteor will
publish all of the cursors.

::: warning
If you return multiple cursors in an array, they currently must all be from
different collections. We hope to lift this restriction in a future release.
:::

</ApiBox>



```js
import { Meteor } from "meteor/meteor";
import { check } from "meteor/check";
import { Rooms } from "/imports/api/Rooms";
import { Messages } from "/imports/api/Messages";

// Server: Publish the `Rooms` collection, minus secret info...
Meteor.publish("rooms", function () {
  return Rooms.find(
    {},
    {
      fields: { secretInfo: 0 },
    }
  );
});

// ...and publish secret info for rooms where the logged-in user is an admin. If
// the client subscribes to both publications, the records are merged together
// into the same documents in the `Rooms` collection. Note that currently object
// values are not recursively merged, so the fields that differ must be top
// level fields.
Meteor.publish("adminSecretInfo", function () {
  return Rooms.find(
    { admin: this.userId },
    {
      fields: { secretInfo: 1 },
    }
  );
});

// Publish dependent documents and simulate joins.
Meteor.publish("roomAndMessages", function (roomId) {
  check(roomId, String);

  return [
    Rooms.find(
      { _id: roomId },
      {
        fields: { secretInfo: 0 },
      }
    ),
    Messages.find({ roomId }),
  ];
});
```

Alternatively, a publish function can directly control its published record set
by calling the functions [`added`](#Subscription-added) (to add a new document to the
published record set), [`changed`](#Subscription-changed) (to change or clear some
fields on a document already in the published record set), and
[`removed`](#Subscription-removed) (to remove documents from the published record
set). These methods are provided by `this` in your publish function.

If a publish function does not return a cursor or array of cursors, it is
assumed to be using the low-level `added`/`changed`/`removed` interface, and it
**must also call [`ready`](#Subscription-ready) once the initial record set is
complete**.

::: code-group

```js [collections.js]
import { Mongo } from "meteor/mongo";

export const Rooms = new Mongo.Collection("rooms");
export const SecretData = new Mongo.Collection("messages");
```

```js [server.js]
import { Meteor } from "meteor/meteor";
import { check } from "meteor/check";
import { Rooms, SecretData } from "/imports/api/collections";

// Publish the current size of a collection.
Meteor.publish("countsByRoom", function (roomId) {
  check(roomId, String);

  let count = 0;
  let initializing = true;

  // `observeChanges` only returns after the initial `added` callbacks have run.
  // Until then, we don't want to send a lot of `changed` messages—hence
  // tracking the `initializing` state.
  const handle = Messages.find({ roomId }).observeChanges({
    added: (id) => {
      count += 1;

      if (!initializing) {
        this.changed("counts", roomId, { count });
      }
    },

    removed: (id) => {
      count -= 1;
      this.changed("counts", roomId, { count });
    },

    // We don't care about `changed` events.
  });

  // Instead, we'll send one `added` message right after `observeChanges` has
  // returned, and mark the subscription as ready.
  initializing = false;
  this.added("counts", roomId, { count });
  this.ready();

  // Stop observing the cursor when the client unsubscribes. Stopping a
  // subscription automatically takes care of sending the client any `removed`
  // messages.
  this.onStop(() => handle.stop());
});

// Sometimes publish a query, sometimes publish nothing.
Meteor.publish("secretData", function () {
  if (this.userId === "superuser") {
    return SecretData.find();
  } else {
    // Declare that no data is being published. If you leave this line out,
    // Meteor will never consider the subscription ready because it thinks
    // you're using the `added/changed/removed` interface where you have to
    // explicitly call `this.ready`.
    return [];
  }
});
```

```js [client.js]
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Session } from "meteor/session";
// Declare a collection to hold the count object.
const Counts = new Mongo.Collection("counts");

// Subscribe to the count for the current room.
Tracker.autorun(() => {
  Meteor.subscribe("countsByRoom", Session.get("roomId"));
});

// Use the new collection.
const roomCount = Counts.findOne(Session.get("roomId")).count;
console.log(`Current room has ${roomCount} messages.`);
```

::: warning

Meteor will emit a warning message if you call `Meteor.publish` in a
project that includes the `autopublish` package. Your publish function
will still work.

:::

Read more about publications and how to use them in the
[Data Loading](http://guide.meteor.com/data-loading.html) article in the Meteor Guide.

<ApiBox name="Subscription#userId" />

This is constant. However, if the logged-in user changes, the publish
function is rerun with the new value, assuming it didn't throw an error at the previous run.

<ApiBox name="Subscription#added" />
<ApiBox name="Subscription#changed" />
<ApiBox name="Subscription#removed" />
<ApiBox name="Subscription#ready" />
<ApiBox name="Subscription#onStop" />

If you call [`observe`](./collections.md#Mongo-Cursor-observe) or [`observeChanges`](./collections.md#Mongo-Cursor-observeChanges) in your
publish handler, this is the place to stop the observes.

<ApiBox name="Subscription#error" />
<ApiBox name="Subscription#stop" />
<ApiBox name="Subscription#connection" />

<ApiBox name="Meteor.subscribe" hasCustomExample/>

When you subscribe to a record set, it tells the server to send records to the
client. The client stores these records in local [Minimongo collections](./collections.md), with the same name as the `collection`
argument used in the publish handler's [`added`](#Subscription-added),
[`changed`](#Subscription-changed), and [`removed`](#Subscription-removed)
callbacks. Meteor will queue incoming records until you declare the
[`Mongo.Collection`](./collections.md) on the client with the matching
collection name.

```js
// It's okay to subscribe (and possibly receive data) before declaring the
// client collection that will hold it. Assume 'allPlayers' publishes data from
// the server's 'players' collection.
Meteor.subscribe("allPlayers");

// The client queues incoming 'players' records until the collection is created:
const Players = new Mongo.Collection("players");
```

The client will see a document if the document is currently in the published
record set of any of its subscriptions. If multiple publications publish a
document with the same `_id` for the same collection the documents are merged for
the client. If the values of any of the top level fields conflict, the resulting
value will be one of the published values, chosen arbitrarily.

::: warning
Currently, when multiple subscriptions publish the same document _only the top
level fields_ are compared during the merge. This means that if the documents
include different sub-fields of the same top level field, not all of them will
be available on the client. We hope to lift this restriction in a future release.
:::

The `onReady` callback is called with no arguments when the server [marks the subscription as ready](#Subscription-ready). The `onStop` callback is called with
a [`Meteor.Error`](#Meteor-Error) if the subscription fails or is terminated by
the server. If the subscription is stopped by calling `stop` on the subscription
handle or inside the publication, `onStop` is called with no arguments.

`Meteor.subscribe` returns a subscription handle, which is an object with the
following properties:

```ts
import { Meteor } from "meteor/meteor";
const handle = Meteor.subscribe("allPlayers");

handle.ready(); // True when the server has marked the subscription as ready

handle.stop(); // Stop this subscription and unsubscribe from the server

handle.subscriptionId; // The id of the subscription this handle is for.
```

When you run Meteor.subscribe inside of Tracker.autorun, the handles you get will always have the same subscriptionId field.
You can use this to deduplicate subscription handles if you are storing them in some data structure.

If you call `Meteor.subscribe` within a reactive computation,
for example using
[`Tracker.autorun`](./Tracker#Tracker-autorun), the subscription will automatically be
cancelled when the computation is invalidated or stopped; it is not necessary
to call `stop` on
subscriptions made from inside `autorun`. However, if the next iteration
of your run function subscribes to the same record set (same name and
parameters), Meteor is smart enough to skip a wasteful
unsubscribe/resubscribe. For example:

```js
Tracker.autorun(() => {
  Meteor.subscribe("chat", { room: Session.get("currentRoom") });
  Meteor.subscribe("privateMessages");
});
```

This subscribes you to the chat messages in the current room and to your private
messages. When you change rooms by calling `Session.set('currentRoom',
'newRoom')`, Meteor will subscribe to the new room's chat messages,
unsubscribe from the original room's chat messages, and continue to
stay subscribed to your private messages.

## Publication strategies

> The following features are available from Meteor 2.4 or `ddp-server@2.5.0`

Once you start scaling your application you might want to have more control on how the data from publications is being handled on the client.
There are three publications strategies:

#### SERVER_MERGE

`SERVER_MERGE` is the default strategy. When using this strategy, the server maintains a copy of all data a connection is subscribed to.
This allows us to only send deltas over multiple publications.

#### NO_MERGE_NO_HISTORY

The `NO_MERGE_NO_HISTORY` strategy results in the server sending all publication data directly to the client.
It does not remember what it has previously sent to client and will not trigger removed messages when a subscription is stopped.
This should only be chosen for special use cases like send-and-forget queues.

#### NO_MERGE

`NO_MERGE` is similar to `NO_MERGE_NO_HISTORY` but the server will remember the IDs it has
sent to the client so it can remove them when a subscription is stopped.
This strategy can be used when a collection is only used in a single publication.

When `NO_MERGE` is selected the client will be handling gracefully duplicate events without throwing an exception.
Specifically:

- When we receive an added message for a document that is already present in the client's collection, it will be changed.
- When we receive a change message for a document that is not in the client's collection, it will be added.
- When we receive a removed message for a document that is not in the client's collection, nothing will happen.

You can import the publication strategies from `DDPServer`.

```js
import { DDPServer } from "meteor/ddp-server";

const { SERVER_MERGE, NO_MERGE_NO_HISTORY, NO_MERGE } =
  DDPServer.publicationStrategies;
```

You can use the following methods to set or get the publication strategy for publications:

<ApiBox name="setPublicationStrategy" hasCustomExample/>

For the `foo` collection, you can set the `NO_MERGE` strategy as shown:

```js
import { DDPServer } from "meteor/ddp-server";
Meteor.server.setPublicationStrategy(
  "foo",
  DDPServer.publicationStrategies.NO_MERGE
);
```

<ApiBox name="getPublicationStrategy" />

### Server connections {#connections}

Functions to manage and inspect the network connection between the Meteor client and server.

<ApiBox name="Meteor.status" hasCustomExample/>

```js
import { Meteor } from "meteor/meteor";
const status = Meteor.status();

console.log(status);
//          ^^^^
// {
//   connected: Boolean,
//   status: String,
//   retryCount: Number,
//   retryTime: Number,
//   reason: String,
// }
```

Status object has the following fields:

- `connected` - _*Boolean*_ : True if currently connected to the server. If false, changes and
  method invocations will be queued up until the connection is reestablished.
- `status` - _*String*_: Describes the current reconnection status. The possible
  values are `connected` (the connection is up and
  running), `connecting` (disconnected and trying to open a
  new connection), `failed` (permanently failed to connect; e.g., the client
  and server support different versions of DDP), `waiting` (failed
  to connect and waiting to try to reconnect) and `offline` (user has disconnected the connection).
- `retryCount` - _*Number*_: The number of times the client has tried to reconnect since the
  connection was lost. 0 when connected.
- `retryTime` - _*Number or undefined*_: The estimated time of the next reconnection attempt. To turn this
  into an interval until the next reconnection, This key will be set only when `status` is `waiting`.
  You canuse this snippet:
  ```js
  retryTime - new Date().getTime();
  ```
- `reason` - _*String or undefined*_: If `status` is `failed`, a description of why the connection failed.

<ApiBox name="Meteor.reconnect" />

<ApiBox name="Meteor.disconnect" />

Call this method to disconnect from the server and stop all
live data updates. While the client is disconnected it will not receive
updates to collections, method calls will be queued until the
connection is reestablished, and hot code push will be disabled.

Call [Meteor.reconnect](#Meteor-reconnect) to reestablish the connection
and resume data transfer.

This can be used to save battery on mobile devices when real time
updates are not required.

<ApiBox name="Meteor.onConnection"  hasCustomExample/>

```js
import { Meteor } from "meteor/meteor";

const handle = Meteor.onConnection((connection) => {
  console.log(connection);
  //          ^^^^^^^^^^^
  // {
  //   id: String,
  //   close: Function,
  //   onClose: Function,
  //   clientAddress: String,
  //   httpHeaders: Object,
  // }
});

handle.stop(); // Unregister the callback
```

`onConnection` returns an object with a single method `stop`. Calling
`stop` unregisters the callback, so that this callback will no longer
be called on new connections.

The callback is called with a single argument, the server-side
`connection` representing the connection from the client. This object
contains the following fields:

- `id` - _*String*_: A globally unique id for this connection.
- `close` - _*Function*_: Close this DDP connection. The client is free to reconnect, but will
  receive a different connection with a new `id` if it does.
- `onClose` - _*Function*_: Register a callback to be called when the connection is closed.
  If the connection is already closed, the callback will be called immediately.
- `clientAddress` - _*String*_: The IP address of the client in dotted form (such as `127.0.0.1`). If you're running your Meteor server behind a proxy (so that clients
  are connecting to the proxy instead of to your server directly),
  you'll need to set the `HTTP_FORWARDED_COUNT` environment variable
  for the correct IP address to be reported by `clientAddress`.

  Set `HTTP_FORWARDED_COUNT` to an integer representing the number of
  proxies in front of your server. For example, you'd set it to `1`
  when your server was behind one proxy.

- `httpHeaders` - _*Object*_: When the connection came in over an HTTP transport (such as with
  Meteor's default SockJS implementation), this field contains
  whitelisted HTTP headers.

  Cookies are deliberately excluded from the headers as they are a
  security risk for this transport. For details and alternatives, see
  the [SockJS documentation](https://github.com/sockjs/sockjs-node#authorisation).

> Currently when a client reconnects to the server (such as after
> temporarily losing its Internet connection), it will get a new
> connection each time. The `onConnection` callbacks will be called
> again, and the new connection will have a new connection `id`.

> In the future, when client reconnection is fully implemented,
> reconnecting from the client will reconnect to the same connection on
> the server: the `onConnection` callback won't be called for that
> connection again, and the connection will still have the same
> connection `id`.

<ApiBox name="DDP.connect"  hasCustomExample/>

```js
import { DDP } from "meteor/ddp-client";
import { Mongo } from "meteor/mongo";
import { Meteor } from "meteor/meteor";
const options = {...};

const otherServer = DDP.connect("http://example.com", options);

otherServer.call("foo.from.other.server", 1, 2, function (err, result) {
  // ...
});

Metepr.call("foo.from.this.server", 1, 2, function (err, result) {
  // ...
});
const remoteColl = new Mongo.Collection("collectionName", { connection: otherServer });
remoteColl.find(...);


```

To call methods on another Meteor application or subscribe to its data
sets, call `DDP.connect` with the URL of the application.
`DDP.connect` returns an object which provides:

- `subscribe` -
  Subscribe to a record set. See
  [Meteor.subscribe](#Meteor-subscribe).
- `call` -
  Invoke a method. See [Meteor.call](#Meteor-call).
- `apply` -
  Invoke a method with an argument array. See
  [Meteor.apply](#Meteor-apply).
- `methods` -
  Define client-only stubs for methods defined on the remote server. See
  [Meteor.methods](#Meteor-methods).
- `status` -
  Get the current connection status. See
  [Meteor.status](#Meteor-status).
- `reconnect` -
  See [Meteor.reconnect](#Meteor-reconnect).
- `disconnect` -
  See [Meteor.disconnect](#Meteor-disconnect).

By default, clients open a connection to the server from which they're loaded.
When you call `Meteor.subscribe`, `Meteor.status`, `Meteor.call`, and
`Meteor.apply`, you are using a connection back to that default
server.

<ApiBox name="DDP.onReconnect" />

## Timers { #timers }

Meteor uses global environment variables
to keep track of things like the current request's user. To make sure
these variables have the right values, you need to use
`Meteor.setTimeout` instead of `setTimeout` and `Meteor.setInterval`
instead of `setInterval`.

These functions work just like their native JavaScript equivalents.
If you call the native function, you'll get an error stating that Meteor
code must always run within a Fiber, and advising to use
`Meteor.bindEnvironment`.

<ApiBox name="Meteor.setTimeout" />

Returns a handle that can be used by `Meteor.clearTimeout`.

<ApiBox name="Meteor.setInterval" />

Returns a handle that can be used by `Meteor.clearInterval`.

<ApiBox name="Meteor.clearTimeout" />
<ApiBox name="Meteor.clearInterval" />

## Enviroment variables {#envs}

Meteor implements `Meteor.EnvironmentVariable` with AsyncLocalStorage, which allows for maintaining context across asynchronous boundaries. `Meteor.EnvironmentVariable` works with `Meteor.bindEnvironment`, promises, and many other Meteor API's to preserve the context in async code. Some examples of how it is used in Meteor are to store the current user in methods, and record which arguments have been checked when using `audit-argument-checks`.

```js
import { Meteor } from "meteor/meteor";
const currentRequest = new Meteor.EnvironmentVariable();

function log(message) {
  const requestId = currentRequest.get() || "None";
  console.log(`[${requestId}]`, message);
}

currentRequest.withValue("12345", () => {
  log("Handling request"); // Logs: [12345] Handling request
});
```

<ApiBox name="Meteor.EnvironmentVariable" />
<ApiBox name="Meteor.EnvironmentVariableAsync" />
<ApiBox name="Meteor.EnvironmentVariable.get" />
<ApiBox name="Meteor.EnvironmentVariable.withValue" />

<ApiBox name="Meteor.bindEnvironment" />
