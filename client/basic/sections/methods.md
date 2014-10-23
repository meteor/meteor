{{#template name="basicMethods"}}
<h2 id="methods"><span>Methods</span></h2>

Methods are server functions that can be called from the client. They are
useful in situations where you want to do something more complicated than
`insert`, `update` or `remove`, or when you need to do data validation that
is difficult to achieve with just `allow` and `deny`.

Methods can return values and throw errors.

{{> autoApiBox "Meteor.methods"}}

Calling `methods` on the server defines functions that can be called remotely by
clients. Here's an example of a method that checks its arguments and throws an
error:

```
// On the server
Meteor.methods({
  commentOnPost: function (comment, postId) {
    // Check argument types
    check(comment, String);
    check(postId, String);

    if (! this.userId) {
      throw new Meteor.Error("not-logged-in",
        "Must be logged in to post a comment.");
    }

    // ... do stuff ...

    return "something";
  },

  otherMethod: function () {
    // ... do other stuff ...
  }
});
```

Inside your method definition, `this` is bound to a method invocation object,
which has a few useful properties:

* `userId`: the id of the current user.
* `unblock`: when called, allows the next method from this client to
begin running. Useful if this method is doing something that takes a long time,
like making an API call.
* `isSimulation`: true if this code is inside a method stub.

Since methods usually expect particular types as arguments,
use [`check`](#check) to ensure your method arguments have
the correct [types and structure](#matchpatterns).

### Latency Compensation

Calling a method on the server requires a round-trip over the network. It would
be really frustrating if users had to wait a whole second to see their comment
show up due to this delay. That's why Meteor has a feature called _method
stubs_. If you define a method on the client with the same name as a server
method, Meteor will run it to attempt to predict the outcome of the server
method. When the code on the server actually finishes, the prediction generated
on the client will be replaced with the actual outcome of the server method.

The client versions of [`insert`](#insert), [`update`](#update), and
[`remove`](#remove), which are implemented as methods, use this feature to make
client-side interactions with the database appear instant.

{{> autoApiBox "Meteor.Error"}}

If you want to return an error from a method, throw an exception.  Methods can
throw any kind of exception, but `Meteor.Error` is the only kind of error that
will be sent to the client. If a method function throws a different exception,
the client gets `Meteor.Error(500, 'Internal server error')`.

{{> autoApiBox "Meteor.call"}}

This is how you call a method.

### On the client

On the client you should pass a callback and the method will run asynchronously:
it will return nothing and instead deliver its results to the callback function.
The callback will be called with two arguments: `error` and `result`.


```
// Asynchronous call with a callback on the client
Meteor.call('commentOnPost', comment, postId, function (error, result) {
  if (error) {
    // handle error
  } else {
    // all good!
  }
});
```

Meteor tracks the database writes performed by methods and does not invoke the
callback until all of the server's writes have been sent to the client.

### On the server

On the server, you don't have to pass a callback - the method invocation will
block until the method is complete. It will return the return value of the
method or throw an exception, just like if you had called the function directly.

```
// Synchronous call on the server with no callback
var result = Meteor.call('foo', comment, postId);
```

{{/template}}
