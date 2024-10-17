Package.describe({
  name: "url",
  version: '1.3.4',
  summary: "Isomorphic modern/legacy/Node polyfill for WHATWG URL/URLSearchParams",
  documentation: "README.md"
});

Npm.depends({
  "core-js": "3.38.1"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("modern-browsers");

  api.mainModule("modern.js", "web.browser");
  api.mainModule("legacy.js", "legacy");
  api.mainModule("server.js", "server");

  api.export("URL");
  api.export("URLSearchParams");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("url");
  api.mainModule("tests/main.js");
});
