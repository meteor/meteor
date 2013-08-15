<h2 id="reactivity">Reactivity</h2>

Meteor embraces the concept of [reactive
programming](http://en.wikipedia.org/wiki/Reactive_programming). This means that
you can write your code in a simple imperative style, and the result will be
automatically recalculated whenever data changes that your code depends on.

    Deps.autorun(function () {
      Meteor.subscribe("messages", Session.get("currentRoomId"));
    });

This example (taken from a chat room client) sets up a data
subscription based on the session variable `currentRoomId`.
If the value of `Session.get("currentRoomId")` changes for any reason, the
function will be automatically re-run, setting up a new subscription that
replaces the old one.

This automatic recomputation is achieved by a cooperation between
`Session` and `Deps.autorun`.  `Deps.autorun` performs an arbitrary "reactive
computation" inside of which data dependencies are tracked, and it
will re-run its function argument as necessary.  Data providers like
`Session`, on the other hand, make note of the computation they are
called from and what data was requested, and they are prepared to send
an invalidation signal to the computation when the data changes.

This simple pattern (reactive computation + reactive data source) has wide
applicability.  Above, the programmer is saved from writing
unsubscribe/resubscribe calls and making sure they are called at the
right time.  In general, Meteor can eliminate whole classes of data
propagation code which would otherwise clog up your application with
error-prone logic.

These Meteor functions run your code as a reactive computation:

* [Templates](#templates)
* [`Meteor.render`](#meteor_render) and [`Meteor.renderList`](#meteor_renderlist)
* [`Deps.autorun`](#deps_autorun)

And the reactive data sources that can trigger changes are:

* [`Session`](#session) variables
* Database queries on [Collections](#find)
* [`Meteor.status`](#meteor_status)
* The `ready()` method on a [subscription handle](#meteor_subscribe)
* [`Meteor.user`](#meteor_user)
* [`Meteor.userId`](#meteor_userid)
* [`Meteor.loggingIn`](#meteor_loggingin)

In addition, the following functions which return an object with a
`stop` method, if called from a reactive computation, are stopped when
the computation is rerun or stopped:

* [`Deps.autorun`](#deps_autorun) (nested)
* [`Meteor.subscribe`](#meteor_subscribe)
* [`observe()`](#observe) and [`observeChanges()`](#observe_changes) on cursors

Meteor's
[implementation](https://github.com/meteor/meteor/blob/master/packages/deps/deps.js)
is a package called [`Deps`](#deps) that is fairly short and straightforward.
You can use it yourself to implement new reactive data sources.
