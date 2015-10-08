# Core API for publications and subscriptions (pubsub)

Prevent misusage of [Publish and Subscribe](http://docs.meteor.com/#/full/publishandsubscribe).


## Rule Details

This rule aims to prevent errors when using Publications and Subscriptions.

The following patterns are considered warnings:

```js

// on the server
Meteor.subscribe('foo') // cannot subscribe on server
Meteor.publish() // missing arguments

// on the client
Meteor.publish('foo') // cannot publish on client
Meteor.subscribe() // at least one argument

```

The following patterns are not warnings:

```js

// anywhere
if (Meteor.isServer) {
  Meteor.publish('foo', function () {})
}

```

## When Not To Use It

Disable this rule if `Meteor.isServer` and `Meteor.isClient` checks happen in dynamic ways.

## Limitations

- `Meteor.isServer` and `Meteor.isClient` checks must happen in `if`-conditions with exactly one condition.
- Usage of methods and properties available through the context of publication functions is not verified
- Does not verify usage of DDPRateLimiter

## Further Reading

* http://docs.meteor.com/#/full/publishandsubscribe
