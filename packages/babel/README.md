[Babel](http://babeljs.io/) is a parser and transpiler for ECMAScript
6 syntax and beyond, which enables some upcoming JavaScript syntax
features to be used in today's browsers and runtimes.

Meteor's Babel support consists of the following core packages:

* `babel` - Exposes the [Babel API](https://babeljs.io/docs/usage/api/) on the
  symbol `Babel`.  For example, `Babel.transform(code, options)`.

* `babel-plugin` - Causes `.es6` files in the package or app that uses it
  to be transpiled.  Only "Meteor approved" features are enabled.

* `babel-runtime` - Meteor versions of the external helpers used by
  Babel-generated code.  Meteor's core packages must run on IE 8 without
  polyfills, so these helpers cannot assume the existence of
  `Object.defineProperty`, `Object.freeze`, and so on.

* `babel-tests` - Tests of the Babel API, transpilation, and functioning
  of transpiled code.  These tests document and check our assumptions
  about Babel.

### Babel API

The `babel` package exports the `Babel` symbol, which is the same object
you get in Node from `require("babel-core")`.  You can only use it on
the server.

Example:

```js
Babel.transform('var square = (x) => x*x;',
                { whitelist: ['es6.arrowFunctions'] })
// Outputs:
// {
//   code: 'var square = function (x) {\n  return x * x;\n};'
//   ast: ...
//   ...
// }
```

Resources:

* [API docs](https://babeljs.io/docs/usage/api/)
* [List of transformers](https://babeljs.io/docs/usage/transformers/)

## Meteor-Approved Features

### Template Literals

Backtick-delimited strings that are useful for multiline literals and
interpolation.

* Babel name: `es6.templateLiterals`
* Babel link: http://babeljs.io/docs/learn-es6/#template-strings
* Babel source code: https://github.com/babel/babel/blob/master/src/babel/transformation/transformers/es6/template-literals.js
* TC9 link: http://tc39wiki.calculist.org/es6/template-strings/
* Deviations from spec:  The first argument to a tag function
  (as in ``myTagFunction`Hello ${name}` ``) should be immutable
  according to the spec, but is mutable when using Meteor's
  version of the Babel runtime helpers.  A tag function that
  relies on mutating its first argument will not be ES6-compatible.

TODO: more!
  
## Checklist for Feature Approval

* Write some tests in `babel-tests/transpile-tests.es6` that explore
  how Babel transpiles the feature in question.  You can check in these
  tests even before enabling them in the plugin (you just can't use them
  in writing the tests).

* Is this feature fully transpilable?  Think of cases that would seem
  hard or impossible to transpile.  Verify that Babel's approach either
  works in 100% of cases, or has limitations that are easy to document
  in our style guide and avoid.

* Are there performance considerations?  For example, if the feature
  introduces a ton of closures that weren't there before, that would
  be a performance concern.

* Is it good style?  Will including this syntax in Meteor style improve
  the quality of our code?  We intentionally don't use every last feature
  of JavaScript.

* Whitelist the feature in `babel-plugin`.

* Write basic tests that cover the different variants of the syntax in
  `babel-tests/transpile-tests.es6` and `babel-tests/run-tests.es6`.

* Add an entry to the "Meteor-Approved Features" section of this document!
  It should document any deviations from the spec or special considerations.
  * XXX Eventually it should be the Meteor Style Guide that says what
    syntax features to use, what aspects of them are ok to use, and in what
    context.
