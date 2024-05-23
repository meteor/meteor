Package.describe({
  name: "promise",
  version: "0.12.2",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.9.0",
  "promise": "8.1.0"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");
  api.use("context", "server", { weak: true });
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
