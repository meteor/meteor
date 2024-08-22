# Underscore

[Underscore](http://underscorejs.org/) is a utility-belt library for
JavaScript that provides support for functional programming. It is
invaluable for writing clear, concise JavaScript in a functional style.

The `underscore` package defines the `_` namespace on both the client
and the server.

::: warning
We have slightly modified the way Underscore differentiates between
objects and arrays in [collection functions](http://underscorejs.org/#each).
The original Underscore logic is to treat any object with a numeric `length`
property as an array (which helps it work properly on
[`NodeList`s](https://developer.mozilla.org/en-US/docs/Web/API/NodeList)).
In Meteor's version of Underscore, objects with a numeric `length` property
are treated as objects if they have no prototype (specifically, if
`x.constructor === Object`.
:::
