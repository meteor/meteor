{{#template name="basicMethods"}}
<h2 id="methods"><span>Methods</span></h2>

Methods are server functions that can be called from the client. They are
useful in situations where you want to do something more complicated than
`insert`, `update` or `remove`, or when you need to do data validation that
is difficult to achieve with just `allow` and `deny`.

Methods can return values and throw errors.

{{> autoApiBox "Meteor.methods"}}

Calling `Meteor.methods` on the server defines functions that can be
called remotely by clients. Here's an example of a method that checks its
arguments and throws an error:

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

The [`check`](#check) function is a convenient way to enforce the expected
[types and structure](#matchpatterns) of method arguments.

Inside your method definition, `this` is bound to a method invocation object,
which has several useful properties, including `this.userId`, which
identifies the currently logged-in user.

You don't have to put all your method definitions into a single `Meteor.methods`
call; you may call it multiple times, as long as each method has a unique name.

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

{{> autoApiBox "Meteor.call"}}

This is how you call a method.

### On the client

Methods called on the client run asynchronously, so you need to pass a
callback in order to observe the result of the call. The callback will be
called with two arguments, `error` and `result`. The `error` argument will
be `null` unless an exception was thrown. When an exception is thrown, the
`error` argument is a `Meteor.Error` instance and the `result` argument is
undefined.

Here's an example of calling the `commentOnPost` method with arguments
`comment` and `postId`:

```
// Asynchronous call with a callback on the client
Meteor.call('commentOnPost', comment, postId, function (error, result) {
  if (error) {
    // handle error
  } else {
    // examine result
  }
});
```

Meteor tracks the database updates performed as part of a method call, and
waits to invoke the client-side callback until all of those updates have
been sent to the client.

### On the server

On the server, you don't have to pass a callback &mdash; the method call
will simply block until the method is complete, returning a result or
throwing an exception, just as if you called the function directly:

```js
// Synchronous call on the server with no callback
var result = Meteor.call('commentOnPost', comment, postId);
```

{{> autoApiBox "Meteor.Error"}}

If you want to return an error from a method, throw an exception.  Methods can
throw any kind of exception, but `Meteor.Error` is the only kind of error that
will be sent to the client. If a method function throws a different exception,
the client gets `Meteor.Error(500, 'Internal server error')`.

{{/template}}
