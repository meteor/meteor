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
  api.addFiles("runtime.js", "server");

  api.addFiles(
    ".npm/package/node_modules/meteor-ecmascript-runtime/client.js",
    "client",
    { bare: true }
  );

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
