Package.describe({
  name: "promise",
  version: "0.11.2",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.8.7",
  "promise": "8.0.2"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");
  api.addFiles("modern.js");
  api.addFiles("legacy.js", "legacy");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("Promise");
});

Package.onTest(function(api) {
  api.use("modules");
  api.use("tinytest");
  api.use("promise");
  api.addFiles("promise-tests.js");
});
