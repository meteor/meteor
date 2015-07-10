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
