Package.describe({
  name: "promise",
  version: "0.6.4-rc.8",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.6.3"
});

Package.onUse(function(api) {
  api.use("modules");
  api.mainModule("main.js");
  api.export("Promise");
});

Package.onTest(function(api) {
  api.use("modules");
  api.use("tinytest");
  api.use("promise");
  api.addFiles("promise-tests.js");
});
