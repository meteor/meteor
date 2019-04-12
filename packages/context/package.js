Package.describe({
  name: "context",
  version: "0.4.0-alpha190.0",
  summary: "Manage contextual information without passing objects around",
  documentation: "README.md"
});

Npm.depends({
  "@wry/context": "0.4.0"
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
