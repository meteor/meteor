Package.describe({
  name: "ecmascript-runtime",
  version: "0.2.7-modules.6",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/ecmascript-runtime",
  documentation: "README.md"
});

Npm.depends({
  "meteor-ecmascript-runtime": "0.2.6",
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("promise");

  // Regenerator, which we use to transpile ES2016 async/await, needs
  // a promise implementation
  api.use("promise");

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
