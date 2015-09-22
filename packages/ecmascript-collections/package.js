Package.describe({
  name: "ecmascript-collections",
  version: "0.1.6",
  summary: "Polyfills for ECMAScript 2015 Map and Set",
  git: "https://github.com/meteor/ecmascript-collections",
  documentation: "README.md"
});

Npm.depends({
  "ecmascript-collections": "0.1.6"
});

Package.onUse(function(api) {
  api.addFiles("collections.js", "server");

  api.addFiles(
    ".npm/package/node_modules/ecmascript-collections/client.js",
    "client",
    { bare: true }
  );

  api.export("Map");
  api.export("Set");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("check");
  api.use("es5-shim");
  api.use("ecmascript-collections");
  api.addFiles("collections-tests.js");
});
