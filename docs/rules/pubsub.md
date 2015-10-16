# Core API for publications and subscriptions (pubsub)

Prevent misusage of [Publish and Subscribe](http://docs.meteor.com/#/full/publishandsubscribe).


## Rule Details

This rule aims to prevent errors when using Publications and Subscriptions. It verifies `Meteor.publish` and `Meteor.subscribe` are used in the correct environments.

It further prevents errors when using the Meteor API provided through the context of publication functions.

The following patterns are considered warnings:

```js

// on the server
Meteor.subscribe('foo')   // cannot subscribe on server

Meteor.publish()          // missing arguments

Meteor.publish('foo', function () {
  this.userId()           // not a function
  this.added()            // missing arguments
  this.changed            // missing arguments
  this.removed            // missing arguments
  this.ready(x)           // no arguments expected
  this.onStop()           // missing arguments
  this.error()            // missing arguments
  this.stop()             // expected no arguments
  this.connection = false // can not be changed
})

// on the client
Meteor.publish('foo')     // cannot publish on client
Meteor.subscribe()        // at least one argument

```

The following patterns are not warnings:

```js

// anywhere
if (Meteor.isServer) {
  Meteor.publish('foo', function () {})
}

```

## Context
It is a common pattern to use a variable to keep track of the context. This is supported as long as the variable used for this is assigned to exactly once upon definition of the variable.

ES6 Arrow Functions are supported as well.

```js

Meteor.publish('foo', function () {
  var self = this

  Messages.find({roomId: roomId}).observeChanges({
    added: function (id) {

      // `self` is resolved to `this`
      self.changed("counts", roomId, {count: count})
    },

    removed: (id) => {

      // ES6 Arrow Functions are supported as well.
      this.changed("counts", roomId, {count: count})
    }
  })
})

```

## Limitations

- `Meteor.isServer` and `Meteor.isClient` checks must happen in `if`-conditions containing no other expressions than `Meteor.isClient`, `Meteor.isServer` and `Meteor.isCordova`.
- Variable used to keep track of context must be assigned to exactly once upon the definition. No transitive assignments possible.
- Does not verify usage of DDPRateLimiter.

## Further Reading

* http://docs.meteor.com/#/full/publishandsubscribe
