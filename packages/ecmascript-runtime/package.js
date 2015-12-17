Package.describe({
  name: "ecmascript-runtime",
  version: "0.2.6",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/ecmascript-runtime",
  documentation: "README.md"
});

Npm.depends({
  "meteor-ecmascript-runtime": "0.2.6"
});

Package.onUse(function(api) {
  api.use("modules");

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
