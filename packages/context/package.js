Package.describe({
  name: "context",
  version: "0.5.1",
  summary: "Manage contextual information without passing objects around",
  documentation: "README.md"
});

Npm.depends({
  "@wry/context": "0.4.4"
});

Package.onUse(function(api) {
  api.use("modules");
  api.addFiles("server.js", "server");
  api.mainModule("context.js");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("context");
  api.mainModule("context-tests.js");
});
