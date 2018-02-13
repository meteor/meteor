Package.describe({
  name: "promise",
  version: "0.10.2",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.8.6",
  "promise": "8.0.1"
});

Package.onUse(function(api) {
  api.use("modules");
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
