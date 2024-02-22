Package.describe({
  name: "fetch",
  version: '0.1.4-beta300.2',
  summary: "Isomorphic modern/legacy/Node polyfill for WHATWG fetch()",
  documentation: "README.md"
});

Npm.depends({
  "node-fetch": "2.6.12",
  "whatwg-fetch": "3.6.17"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");
  api.use("promise");

  api.mainModule("modern.js", "web.browser");
  api.mainModule("legacy.js", "legacy");
  api.mainModule("server.js", "server");

  api.addAssets("fetch.d.ts", "server");
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
