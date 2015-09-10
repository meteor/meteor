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

* [`es3.propertyLiterals`](https://babeljs.io/docs/advanced/transformers/es3/property-literals/)
* [`es3.memberExpressionLiterals`](https://babeljs.io/docs/advanced/transformers/es3/member-expression-literals/)
* [`es6.arrowFunctions`](http://babeljs.io/docs/learn-es2015/#arrows)
* [`es6.literals`](http://babeljs.io/docs/learn-es2015/#binary-and-octal-literals)
* [`es6.templateLiterals`](http://babeljs.io/docs/learn-es2015/#template-strings)
* [`es6.classes`](http://babeljs.io/docs/learn-es2015/#classes)
* [`es6.constants`](https://babeljs.io/docs/learn-es2015/#let-const)
* [`es6.blockScoping`](http://babeljs.io/docs/learn-es2015/#let-const)
* [`es6.properties.shorthand`](https://babeljs.io/docs/learn-es2015/#enhanced-object-literals)
* [`es6.properties.computed`](http://babeljs.io/docs/learn-es2015/#enhanced-object-literals)
* [`es6.parameters`](http://babeljs.io/docs/learn-es2015/#default-rest-spread)
* [`es6.spread`](http://babeljs.io/docs/learn-es2015/#default-rest-spread)
* [`es6.forOf`](http://babeljs.io/docs/learn-es2015/#iterators-for-of)
* [`es6.destructuring`](http://babeljs.io/docs/learn-es2015/#destructuring)
* [`es7.objectRestSpread`](https://github.com/sebmarkbage/ecmascript-rest-spread)
* [`es7.trailingFunctionCommas`](https://github.com/jeffmo/es-trailing-function-commas)
* [`flow`](https://babeljs.io/docs/advanced/transformers/other/flow/)

### Polyfills

* [`Promise`](https://github.com/meteor/promise)
* [`Map`](https://github.com/zloirock/core-js#map)
* [`Set`](https://github.com/zloirock/core-js#set)
