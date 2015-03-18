[Babel](http://babeljs.io/) is a parser and transpiler for ECMAScript
6 syntax and beyond, which enables upcoming JavaScript syntax features
to be used in today's browsers and runtimes, generally with some
limitations.

This package exposes the Babel API on the symbol `Babel`.  It does not
cause `.es` files in your project to be run through Babel (see the
`babel-plugin` package for that -- XXX it doesn't exist yet).

For example,

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

Babel resources:

* [API docs](https://babeljs.io/docs/usage/api/)
* [List of transformers](https://babeljs.io/docs/usage/transformers/)

See [`babel-tests.js`](babel-tests.js) for example input and output.

---

> The plan is to have packages `babel`, `babel-plugin`, and
`babel-runtime`.  The `babel` package wraps the `babel-core` npm
package, adding some tests of our own.  In the interest of less
verbose transpiled code, we will probably patch or hook into Babel
to make it generate code that runs against a small runtime support
library in `babel-runtime`.  `babel-plugin` will cause `.es` files to
be transpiled using an appropriate call to the `babel` package.
>
> As we confirm which syntax features can be robustly transpiled and are
a positive contribution to Meteor style, we will enable them in the
plugin.