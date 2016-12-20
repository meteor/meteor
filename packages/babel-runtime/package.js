Package.describe({
  name: "babel-runtime",
  summary: "Runtime support for output of Babel transpiler",
  version: '1.0.1',
  documentation: 'README.md'
});

Npm.depends({
  "meteor-babel-helpers": "0.0.3"
});

Package.onUse(function (api) {
  // If the es5-shim package is installed, make sure it loads before
  // babel-runtime, since babel-runtime uses some ES5 APIs like
  // Object.defineProperties that are buggy in older browsers.
  api.use("es5-shim", { weak: true });
  api.use("modules");
  api.use("promise"); // Needed by Regenerator.
  api.mainModule("babel-runtime.js");
  api.export("meteorBabelHelpers");
});
