# [ecmascript](https://github.com/meteor/meteor/tree/devel/packages/ecmascript)

This package lets you use new JavaScript language features that are part
of the [ECMAScript 2015
specification](http://www.ecma-international.org/ecma-262/6.0/) but are
not yet supported by all engines or browsers. Unsupported syntax is
automatically translated into standard JavaScript that behaves the same
way.

[This video](https://www.youtube.com/watch?v=05Z6YGiZKmE) from the July
2015 Meteor Devshop gives an overview of how the package works, and what
it provides.

## Usage

The `ecmascript` package registers a compiler plugin that transpiles
ECMAScript 2015+ to ECMAScript 5 (standard JS) in all `.js` files. By
default, this package is pre-installed for all new apps and packages.

To add this package to an existing app, run the following command from
your app directory:

```bash
meteor add ecmascript
```

To add the `ecmascript` package to an existing package, include the
statement `api.use('ecmascript');` in the `Package.onUse` callback in your
`package.js` file:

```js
Package.onUse(function (api) {
  api.use('ecmascript');
});
```

## Supported ES2015 Features

### Syntax

The `ecmascript` package uses [Babel](http://babeljs.io/) to compile
ES2015 syntax to ES5 syntax. Many but not all ES2015 features can be
simulated by Babel, and `ecmascript` enables most of the features
supported by Babel.

Here is a list of the Babel transformers that are currently enabled:

* [`es3.propertyLiterals`](https://babeljs.io/docs/advanced/transformers/es3/property-literals/)<br>
  Makes it safe to use reserved keywords like `catch` as unquoted keys in
  object literals. For example, `{ catch: 123 }` is translated to `{ "catch": 123 }`.

* [`es3.memberExpressionLiterals`](https://babeljs.io/docs/advanced/transformers/es3/member-expression-literals/)<br>
  Makes it safe to use reserved keywords as property names. For
  example, `object.catch` is translated to `object["catch"]`.

* [`es6.arrowFunctions`](http://babeljs.io/docs/learn-es2015/#arrows)<br>
  Provides a shorthand for function expressions. For example,
  `[1, 2, 3].map(x => x + 1)` evaluates to `[2, 3, 4]`. If `this` is used
  in the body of the arrow function, it will be automatically bound to the
  value of `this` in the enclosing scope.

* [`es6.literals`](http://babeljs.io/docs/learn-es2015/#binary-and-octal-literals)<br>
  Adds support for binary and octal numeric literals. For example,
  `0b111110111 === 503` and `0o767 === 503`.

* [`es6.templateLiterals`](http://babeljs.io/docs/learn-es2015/#template-strings)<br>
  Enables multi-line strings delimited by backticks instead of quotation
  marks, with variable interpolation:
  ```js
  var name = "Ben";
  var message = `My name is:
  ${name}`;
  ```

* [`es6.classes`](http://babeljs.io/docs/learn-es2015/#classes)<br>
  Enables `class` syntax:
  ```js
  class Base {
    constructor(a, b) {
      this.value = a * b;
    }
  }

  class Derived extends Base {
    constructor(a, b) {
      super(a + 1, b + 1);
    }
  }

  var d = new Derived(2, 3);
  d.value; // 12
  ```

* [`es6.constants`](https://babeljs.io/docs/learn-es2015/#let-const)<br>
  Allows defining block-scoped variables that are not allowed to be
  redefined:
  ```js
  const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

  // This reassignment will be forbidden by the compiler:
  GOLDEN_RATIO = "new value";
  ```

* [`es6.blockScoping`](http://babeljs.io/docs/learn-es2015/#let-const)<br>
  Enables the `let` and `const` keywords as alternatives to `var`. The key
  difference is that variables defined using `let` or `const` are
  visible only within the block where they are declared, rather than being
  visible anywhere in the enclosing function. For example:
  ```js
  function example(condition) {
    let x = 0;
    if (condition) {
      let x = 1;
      console.log(x);
    } else {
      console.log(x);
      x = 2;
    }
    return x;
  }

  example(true); // logs 1, returns 0
  example(false); // logs 0, returns 2
  ```

* [`es6.properties.shorthand`](https://babeljs.io/docs/learn-es2015/#enhanced-object-literals)<br>
  Allows omitting the value of an object literal property when the desired
  value is held by a variable that has the same name as the property
  key. For example, instead of writing `{ x: x, y: y, z: "asdf" }` you can
  just write `{ x, y, z: "asdf" }`. Methods can also be written without
  the `: function` property syntax:
  ```js
  var obj = {
    oldWay: function (a, b) { ... },
    newWay(a, b) { ... }
  };
  ```

* [`es6.properties.computed`](http://babeljs.io/docs/learn-es2015/#enhanced-object-literals)<br>
  Allows object literal properties with dynamically computed keys:
  ```js
  var counter = 0;
  function getKeyName() {
    return "key" + counter++;
  }

  var obj = {
    [getKeyName()]: "zero",
    [getKeyName()]: "one",
  };

  obj.key0; // "zero"
  obj.key1; // "one"
  ```

* [`es6.parameters`](http://babeljs.io/docs/learn-es2015/#default-rest-spread)<br>
  Default expressions for function parameters, evaluated whenever the parameter
  is `undefined`, `...rest` parameters for capturing remaining
  arguments without using the `arguments` object:
  ```js
  function add(a = 0, ...rest) {
    rest.forEach(n => a += n);
    return a;
  }

  add(); // 0
  add(1, 2, 3); // 6
  ```

* [`es6.spread`](http://babeljs.io/docs/learn-es2015/#default-rest-spread)<br>
  Allows an array of arguments to be interpolated into a list of arguments
  to a function call, `new` expression, or array literal, without using
  `Function.prototype.apply`:
  ```js
  add(1, ...[2, 3, 4], 5); // 15
  new Node("name", ...children);
  [1, ...[2, 3, 4], 5]; // [1, 2, 3, 4, 5]
  ```

* [`es6.forOf`](http://babeljs.io/docs/learn-es2015/#iterators-for-of)<br>
  Provides an easy way to iterate over the elements of a collection:
  ```js
  let sum = 0;
  for (var x of [1, 2, 3]) {
    sum += x;
  }
  x; // 6
  ```

* [`es6.destructuring`](http://babeljs.io/docs/learn-es2015/#destructuring)<br>
  Destructuring is the technique of using an array or object pattern on
  the left-hand side of an assignment or declaration, in place of the
  usual variable or parameter, so that certain sub-properties of the value
  on the right-hand side will be bound to identifiers that appear within the
  pattern. Perhaps the simplest example is swapping two variables without
  using a temporary variable:
  ```js
  [a, b] = [b, a];
  ```
  Extracting a specific property from an object:
  ```js
  let { username: name } = user;
  // is equivalent to
  let name = user.username;
  ```
  Instead of taking a single opaque `options` parameter, a function can
  use an object destructuring pattern to name the expected options:
  ```js
  function run({ command, args, callback }) { ... }

  run({
    command: "git",
    args: ["status", "."],
    callback(error, status) { ... },
    unused: "whatever"
  });
  ```

* [`es7.objectRestSpread`](https://github.com/sebmarkbage/ecmascript-rest-spread)<br>
  Supports catch-all `...rest` properties in object literal declarations
  and assignments:
  ```js
  let { x, y, ...rest } = { x: 1, y: 2, a: 3, b: 4 };
  x; // 1
  y; // 2
  rest; // { a: 3, b: 4 }
  ```
  Also enables `...spread` properties in object literal expressions:
  ```js
  let n = { x, y, ...rest };
  n; // { x: 1, y: 2, a: 3, b: 4 }
  ```

* [`es7.trailingFunctionCommas`](https://github.com/jeffmo/es-trailing-function-commas)<br>
  Allows the final parameter of a function to be followed by a comma,
  provided that parameter is not a `...rest` parameter.

* [`flow`](https://babeljs.io/docs/advanced/transformers/other/flow/)<br>
  Permits the use of [Flow](http://flowtype.org/) type annotations. These
  annotations are simply stripped from the code, so they have no effect on
  the code's behavior, but you can run the `flow` tool over your code to
  check the types if desired.

### Polyfills

The ECMAScript 2015 standard library has grown to include new APIs and
data structures, some of which can be implemented ("polyfilled") using
JavaScript that runs in all engines and browsers today. Here are three new
constructors that are guaranteed to be available when the `ecmascript`
package is installed:

* [`Promise`](https://github.com/meteor/promise)<br>
  A `Promise` allows its owner to wait for a value that might not be
  available yet. See [this tutorial](https://www.promisejs.org/) for more
  details about the API and motivation. The Meteor `Promise`
  implementation is especially useful because it runs all callback
  functions in recycled `Fiber`s, so you can use any Meteor API, including
  those that yield (e.g. `HTTP.get`, `Meteor.call`, or `MongoCollection`),
  and you never have to call `Meteor.bindEnvironment`.

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
