# Prevent usage of Meteor.setTimeout with zero delay (no-zero-timeout)

`Meteor.setTimeout` can be used to defer the execution of a function, but Meteor has a built-in method for deferring called `Meteor.defer`. It is better to use the dedicated method instead of relying on a side-effect of `Meteor.setTimeout`.

Using `Meteor.defer` is preferred, because it uses native `setImmediate` or `postMessage` methods in case they are available. Otherwise it can will fall back to `setTimeout`.
It's recommended to avoid `setTimeout` because it adds a delay of at least 2ms in Chrome, 10ms in other browsers [[source](http://dbaron.org/log/20100309-faster-timeouts)].

## Rule Details

This rule aims to encourage the use of `Meteor.defer` by removing all occurrences of `Meteor.setTimeout` with a delay of 0.

The following patterns are considered warnings:

```js

Meteor.setTimeout(function () {}, 0)
Meteor.setTimeout(function () {})
Meteor["setTimeout"](function () {}, 0)

Meteor.setTimeout(foo, 0)
Meteor.setTimeout(foo)
Meteor["setTimeout"](foo, 0)

```

The following patterns are not warnings:

```js

Meteor.defer(function () {}, 0)
Meteor.setTimeout(function () {}, 100)

Meteor.defer(foo, 0)
Meteor.setTimeout(foo, 100)

```

## Further Reading

* https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/meteor/setimmediate.js#L1-L7
* http://dbaron.org/log/20100309-faster-timeouts
* https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
* https://developer.mozilla.org/en/docs/Web/API/Window/setImmediate
