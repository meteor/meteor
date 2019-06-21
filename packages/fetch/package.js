Package.describe({
  name: "fetch",
  version: "0.1.1",
  summary: "Isomorphic modern/legacy/Node polyfill for WHATWG fetch()",
  documentation: "README.md"
});

Npm.depends({
  "node-fetch": "2.3.0",
  "whatwg-fetch": "2.0.4"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");
  api.use("promise");

  api.mainModule("modern.js", "web.browser");
  api.mainModule("legacy.js", "legacy");
  api.mainModule("server.js", "server");

  // The other exports (Headers, Request, Response) can be imported
  // explicitly from the "meteor/fetch" package.
  api.export("fetch");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("fetch");
  api.mainModule("tests/main.js");
  api.addAssets("tests/asset.json", ["client", "server"]);
});
