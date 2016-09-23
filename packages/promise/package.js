Package.describe({
  name: "promise",
  version: "0.8.4",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "https://github.com/tmeasday/meteor-promise.git#a223c7e248f32b1a82a63a9834a53b03b459e77c",
  "promise": "7.1.1"
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
