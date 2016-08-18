Package.describe({
  name: "ecmascript-runtime",
  version: "0.3.14",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/ecmascript-runtime",
  documentation: "README.md"
});

Npm.depends({
  "meteor-ecmascript-runtime": "0.2.9",
});

Package.onUse(function(api) {
  // If the es5-shim package is installed, make sure it loads before
  // ecmascript-runtime, since ecmascript-runtime uses some ES5 APIs like
  // Object.defineProperties that are buggy in older browsers.
  api.use("es5-shim@4.6.13", { weak: true });

  api.use("modules@0.7.5");
  api.use("promise@0.8.3");

  api.mainModule("runtime.js");

  api.export("Symbol");
  api.export("Map");
  api.export("Set");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("check");
  api.use("es5-shim");
  api.use("ecmascript-runtime");
  api.addFiles("runtime-tests.js");
});
