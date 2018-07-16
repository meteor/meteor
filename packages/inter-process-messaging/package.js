Package.describe({
  name: "inter-process-messaging",
  version: "0.1.0",
  summary: "Support for sending messages from the build process to the server process",
  documentation: "README.md"
});

Npm.depends({
  uuid: "3.3.2"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("promise");
  api.mainModule("inter-process-messaging.js", "server");
});
