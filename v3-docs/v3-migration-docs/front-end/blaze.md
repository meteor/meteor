# Blaze changes

:::tip

It is important to note that migrating your front-end code to async is unnecessary.
You can still use the sync MongoDB methods on the client side,
for example: `Collection.fetch`/`Collection.findOne`.

:::

It is important to note that migrating your front-end code to async is unnecessary.
You can still use the sync methods on the client side.

But to maintain isomorphic code, you can use the async methods on the client side.

Since this [PR](https://github.com/meteor/blaze/pull/413) was released with Blaze 2.7. Blaze supports async in their views.

You can check the [Blaze docs](https://www.blazejs.org/api/spacebars#Async-states) for
more information on how to handle async states.

[@radekmie](https://github.com/radekmie) made two great posts about making Blaze async. Both are worth reading:
  - [On Asynchronicity in Blaze](https://radekmie.dev/blog/on-asynchronicity-in-blaze/);
  - [On Asynchronicity in Blaze (again)](https://radekmie.dev/blog/on-asynchronicity-in-blaze-again/);

