Package.describe({
  name: "server-render",
  version: "0.2.0",
  summary: "Generic support for server-side rendering in Meteor apps",
  documentation: "README.md"
});

Npm.depends({
  "magic-string": "0.21.3",
  "parse5": "3.0.2"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("webapp");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("server-render");
  api.mainModule("server-render-tests.js", "server");
});
