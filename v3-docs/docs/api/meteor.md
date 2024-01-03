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

<ApiBox name="Meteor.wrapAsync" />
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
clients. They should return an [EJSON](./ejson)-able value or throw an
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
([`insert`](./mongo#insert), [`update`](./mongo#update), [`remove`](./mongo#remove)) are implemented
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
[`Meteor.apply`](#meteor-apply) with the noRetry option set to true.

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
the [Meteor accounts system](#accounts_api) then this is handled for you.

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
[`Meteor.users`](./accounts.md#meteor-users) collection.

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

Access inside a method invocation. The [connection](#meteor-onConnection) that this method was received on.
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

This is how to invoke a method with a sync stub.  It will run the method on the server.  If a
stub is available, it will also run the stub on the client.  (See also
[`Meteor.apply`](#meteor-apply), which is identical to `Meteor.call` except that
you specify the parameters as an array instead of as separate arguments and you
can specify a few options controlling how the method is executed.)

If you include a callback function as the last argument (which can't be
an argument to the method, since functions aren't serializable), the
method will run asynchronously: it will return nothing in particular and
will not throw an exception.  When the method is complete (which may or
may not happen before `Meteor.call` returns), the callback will be
called with two arguments: `error` and `result`. If an error was thrown,
then `error` will be the exception object.  Otherwise, `error` will be
`undefined` and the return value (possibly `undefined`) will be in `result`.

```js
// Asynchronous call
Meteor.call('foo', 1, 2, (error, result) => { ... });
```

If you do not pass a callback on the server, the method invocation will
block until the method is complete.  It will eventually return the
return value of the method, or it will throw an exception if the method
threw an exception. (Possibly mapped to 500 Server Error if the
exception happened remotely and it was not a `Meteor.Error` exception.)

```js
// Synchronous call
const result = Meteor.call('foo', 1, 2);
```

On the client, if you do not pass a callback and you are not inside a
stub, `call` will return `undefined`, and you will have no way to get
the return value of the method. That is because the client doesn't have
fibers, so there is not actually any way it can block on the remote
execution of a method.

Finally, if you are inside a stub on the client and call another
method, the other method is not executed (no RPC is generated, nothing
"real" happens).  If that other method has a stub, that stub stands in
for the method and is executed. The method call's return value is the
return value of the stub function.  The client has no problem executing
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
`onResultReceived` callback to [`Meteor.apply`](#meteor-apply).


<ApiBox name="Meteor.callAsync" />

`Meteor.callAsync` is just like `Meteor.call`, except that it'll return a promise that you need to solve to get the result.

<ApiBox name="Meteor.apply" />

`Meteor.apply` is just like `Meteor.call`, except that the method arguments are
passed as an array rather than directly as arguments, and you can specify
options about how the client executes the method.

<ApiBox name="Meteor.applyAsync" />

`Meteor.applyAsync` is just like `Meteor.apply`, except it is an async function, and it will consider that the stub is async.


