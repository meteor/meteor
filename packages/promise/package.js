Package.describe({
  name: "promise",
  version: "0.5.0",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.5.0"
});

Package.onUse(function(api) {
  api.addFiles("promise_server.js", "server");

  api.addFiles(
    // This may not be the most robust way of referring to an NPM asset,
    // but at least api.addFiles will fail if the file does not exist.
    ".npm/package/node_modules/meteor-promise/promise.bundle.js",
    "client"
  );

  api.export("Promise");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("promise");
  api.addFiles("promise-tests.js");
});
