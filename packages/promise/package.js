Package.describe({
  name: "promise",
  version: '1.0.0-beta300.1',
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "promise": "8.1.0"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");
  api.addFiles("modern.js");
  api.addFiles("legacy.js", "legacy");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("Promise");
  api.addAssets("promise.d.ts", ["client", "server"]);
});

Package.onTest(function(api) {
  api.use("modules");
  api.use("tinytest");
  api.use("promise");
  api.addFiles("promise-tests.js");
});
