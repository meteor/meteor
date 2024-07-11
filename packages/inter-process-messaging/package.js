Package.describe({
  name: "inter-process-messaging",
  version: '0.1.2-rc300.5',
  summary: "Support for sending messages from the build process to the server process",
  documentation: "README.md"
});

Npm.depends({
  uuid: "3.3.2",
  arson: "0.2.6"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("promise");
  api.mainModule("inter-process-messaging.js", "server");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("inter-process-messaging");
  api.mainModule("tests.js", "server");
});
