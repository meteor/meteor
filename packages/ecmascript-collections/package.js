Package.describe({
  name: "ecmascript-collections",
  version: "0.1.5-plugins.0",
  summary: "Polyfills for ECMAScript 2015 Map and Set",
  git: "https://github.com/meteor/ecmascript-collections",
  documentation: "README.md"
});

Npm.depends({
  "ecmascript-collections": "0.1.4"
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
  api.use("ecmascript-collections");
  api.addFiles("collections-tests.js");
});
