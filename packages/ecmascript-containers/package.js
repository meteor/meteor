Package.describe({
  name: "ecmascript-containers",
  version: "0.1.2",
  summary: "Polyfills for ECMAScript 2015 Map and Set",
  git: "https://github.com/meteor/ecmascript-containers",
  documentation: "README.md"
});

Npm.depends({
  "ecmascript-containers": "0.1.2"
});

Package.onUse(function(api) {
  api.addFiles("containers.js", "server");

  api.addFiles(
    ".npm/package/node_modules/ecmascript-containers/client.js",
    "client",
    { bare: true }
  );

  api.export("Map");
  api.export("Set");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("ecmascript-containers");
  api.addFiles("containers-tests.js");
});
