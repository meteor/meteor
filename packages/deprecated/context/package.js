Package.describe({
  name: "context",
  version: '1.0.0-beta300.1',
  summary: "Manage contextual information without passing objects around",
  documentation: "README.md",
  deprecated: 'You should not be needing this package in Meteor 3'
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
