# ECMAScript

This package lets you use new JavaScript language features that are part
of the [ECMAScript 2015 specification](http://www.ecma-international.org/ecma-262/6.0/) but are
not yet supported by all engines or browsers. Unsupported syntax is
automatically translated into standard JavaScript that behaves the same
way.

[This video](https://www.youtube.com/watch?v=05Z6YGiZKmE) from the July
2015 Meteor Devshop gives an overview of how the package works, and what
it provides.

## Usage

The `ecmascript` package registers a compiler plugin that transpiles
modern ECMAScript syntax in all `.js` files, tailoring the output to
each target (legacy browsers receive ECMAScript 5). By default, this
package is pre-installed for all new apps and packages.

To add this package to an existing app, run the following command from
your app directory:

```bash
meteor add ecmascript
```

To add the `ecmascript` package to an existing package, include the
statement `api.use('ecmascript');` in the `Package.onUse` callback in your
`package.js` file:

```js
Package.onUse((api) => {
  api.use('ecmascript');
});
```

## Supported ES2015 Features

### Syntax

The `ecmascript` package compiles `.js` files with
[Babel](https://babeljs.io/), via the `babel-compiler` package and the
`@meteorjs/babel` npm package (currently Babel 7). The
`babel-preset-meteor` preset is applied automatically, enabling modern
ECMAScript syntax such as classes, arrow functions, template literals,
destructuring, object rest/spread, and `async`/`await`, with the output
tailored to each target: modern browsers and Node receive minimally
transpiled code, while legacy browsers receive fully compiled ES5.

Because `babel-preset-meteor` (as well as `@babel/preset-env` and
`@babel/preset-react`) is included automatically, it is ignored if
listed in a custom `.babelrc`.

### Polyfills

The ECMAScript 2015 standard library has grown to include new APIs and
data structures, some of which can be implemented ("polyfilled") using
JavaScript that runs in all engines and browsers today. Here are three new
constructors that are guaranteed to be available when the `ecmascript`
package is installed:

* [`Promise`](https://github.com/meteor/promise)<br>
  A `Promise` allows its owner to wait for a value that might not be
  available yet. See [this tutorial](https://www.promisejs.org/) for more
  details about the API and motivation. In Meteor 3, this is the native
  global `Promise` (a polyfill is loaded only in legacy browsers that
  lack it); `async`/`await` works with all Meteor APIs (e.g.
  `Meteor.callAsync`, `fetch`, and the async MongoDB collection methods
  such as `findOneAsync`) with no special binding like
  `Meteor.bindEnvironment` required.

* [`Map`](https://github.com/zloirock/core-js#map)<br>
  An associative key-value data structure where the keys can be any
  JavaScript value (not just strings). Lookup and insertion take constant
  time.

* [`Set`](https://github.com/zloirock/core-js#set)<br>
  A collection of unique JavaScript values of any type. Lookup and
  insertion take constant time.

* [`Symbol`](https://github.com/zloirock/core-js#ecmascript-6-symbol)<br>
  An implementation of the global
  [`Symbol`](http://www.2ality.com/2014/12/es6-symbols.html)s namespace
  that enables a number of other ES2015 features, such as `for`-`of` loops
  and `Symbol.iterator` methods: `[1,2,3][Symbol.iterator]()`.

* Polyfills for the following [`Object`](https://github.com/zloirock/core-js#ecmascript-6-object)-related methods:
  * `Object.assign`
  * `Object.is`
  * `Object.setPrototypeOf`
  * `Object.prototype.toString` (fixes `@@toStringTag` support)<br>

  Complete reference [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object).

* Polyfills for the following [`String`](https://github.com/zloirock/core-js#ecmascript-6-string)-related methods:
  * `String.fromCodePoint`
  * `String.raw`
  * `String.prototype.includes`
  * `String.prototype.startsWith`
  * `String.prototype.endsWith`
  * `String.prototype.repeat`
  * `String.prototype.codePointAt`
  * `String.prototype.trim`<br>

  Complete reference [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String).

* Polyfills for the following [`Array`](https://github.com/zloirock/core-js#ecmascript-6-array)-related methods:
  * `Array.from`
  * `Array.of`
  * `Array.prototype.copyWithin`
  * `Array.prototype.fill`
  * `Array.prototype.find`
  * `Array.prototype.findIndex`

  Complete reference [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array).

* Polyfills for the following [`Function`](https://github.com/zloirock/core-js#ecmascript-6-function)-related properties:
  * `Function.prototype.name` (fixes IE9+)
  * `Function.prototype[Symbol.hasInstance]` (fixes IE9+)

  Complete reference [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array).
