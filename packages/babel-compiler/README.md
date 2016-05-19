[Babel](http://babeljs.io/) is a parser and transpiler for ECMAScript 2015
syntax and beyond, which enables some upcoming JavaScript syntax features
to be used in today's browsers and runtimes.

Meteor's Babel support consists of the following core packages:

* `babel-compiler` - Exposes the [Babel API](https://babeljs.io/docs/usage/api/)
  on the symbol `Babel`.  For example, `Babel.compile(source, options)`.

* `babel-runtime` - Meteor versions of the external helpers used by
  Babel-generated code.  Meteor's core packages must run on IE 8 without
  polyfills, so these helpers cannot assume the existence of
  `Object.defineProperty`, `Object.freeze`, and so on.

### Babel API

The `babel-compiler` package exports the `Babel` symbol, which exposes
functionality provided by the
[`meteor-babel`](https://www.npmjs.com/package/meteor-babel) NPM package,
which is in turn implmented using the
[`babel-core`](https://www.npmjs.com/package/babel-core) NPM package.
Note that you can only use the `babel-compiler` package on the server.

Example:

```js
var babelOptions = Babel.getDefaultOptions();

// Modify the default options, if necessary:
babelOptions.whitelist = [
  "es6.blockScoping", // For `let`
  "es6.arrowFunctions" // For `=>`
];

var result = Babel.compile(
  "let square = (x) => x*x;",
  babelOptions
);

// result.code will be something like
// "var square = function (x) {\n  return x * x;\n};"
```

Use `Babel.compile(source)` to transpile code using a set of default
options that work well for Meteor code.

Resources:

* [API docs](https://babeljs.io/docs/usage/api/)
* [List of transformers](https://babeljs.io/docs/usage/transformers/)
