[Babel](http://babeljs.io/) is a parser and transpiler for ECMAScript
6 syntax and beyond, which enables upcoming JavaScript syntax features
to be used in today's browsers and runtimes, generally with some
limitations.

This package exposes the Babel API on the symbol `Babel`.  It does not
cause `.es` files in your project to be run through Babel (see
[`../babel-plugin`][] for that).

*XXX create babel-plugin*

For example,

```js
Babel.transform('var square = (x) => x*x;',
                { whitelist: ['es6.arrowFunctions'] })
=> {
  code: 'var square = function (x) {\n  return x * x;\n};'
  ast: ...
  ...
}
```

Babel resources:

* [API docs](https://babeljs.io/docs/usage/api/)
* [List of transformers](https://babeljs.io/docs/usage/transformers/)

See [`babel-tests.js`][] for example input and output.
