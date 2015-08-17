Package.describe({
  name: "promise",
  version: "0.4.6-plugins.0",
  summary: "ECMAScript 2015 Promise polyfill with Fiber support",
  git: "https://github.com/meteor/promise",
  documentation: "README.md"
});

Npm.depends({
  "meteor-promise": "0.4.6"
});

Package.onUse(function(api) {
  api.addFiles("promise_server.js", "server");

  api.addFiles(
    // This may not be the most robust way of referring to an NPM asset,
    // but at least api.addFiles will fail if the file does not exist.
    ".npm/package/node_modules/meteor-promise/promise.bundle.js",
    "client"
  );

  // The promise.bundle.js file defines the Promise constructor globally,
  // so here we assign the global value to the exported package variable.
  api.addFiles("export_globals.js", "client");

  api.export("Promise");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("promise");
  api.addFiles("promise-tests.js");
});
