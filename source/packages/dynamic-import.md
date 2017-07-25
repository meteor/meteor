---
title: dynamic-import
description: Documentation of Meteor's `dynamic-import` package.
---

> **Note:** Dynamic imports require Meteor 1.5 or higher.

The `dynamic-import` package provides an implementation of
`Module.prototype.dynamicImport`, an extension of the module runtime which
powers the [dynamic `import(...)`](https://github.com/tc39/proposal-dynamic-import)
statement, an up-and-coming (currently stage 3 out of 4) addition to the
ECMAScript standard.

The dynamic `import(...)` statement is a complimentary method to the static
`import` technique of requiring a module.  While a statically <nobr>`import`-ed
</nobr>module would be bundled into the initial JavaScript bundle, a
dynamically <nobr>`import()`-ed</nobr> module is fetched from the server at
runtime.

Once a module is fetched dynamically from the server, it is cached permanently
on the client and additional requests for the same version of the module will
not incur the round-trip request to the server.  If the module is changed then a
fresh copy will always be retrieved from the server.

## Usage

The `import(...)` statement returns a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)
which is resolved with the `exports` of the module when it has been successfully
fetched from the server and is ready to be used.

Because it's a `Promise`, there are a couple methods developers can use to
dictate what will happen upon the availability of the dynamically loaded module:

### The `.then()` method of the `Promise`

```js
import("tool").then(tool => tool.task());
```

### By `await`-ing in an asynchronous function

Meteor supports [`async` and `await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function),
which provide a straightforward approach to asynchronously wait for the
module to be ready without the need to provide a callback:

```js
async function performTask() {
  const tool = await import("tool");
  tool.task();
}
```

> **Default exports**
>
> The `import(...)` `Promise` is resolved with the `exports` of the module.
> If it's necessary to use the "default" export from a module, it will be
> available on the `default` property of the resulting object.  In the above
> examples, this means it will be available as `tool.default`.  It can be
> helpful to use parameter de-structuring to provide additional clarity:
>
> ```js
import("another-tool").then(({ default: thatTool }) => thatTool.go());

```