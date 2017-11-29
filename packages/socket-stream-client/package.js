Package.describe({
  name: "socket-stream-client",
  version: "0.1.0",
  summary: "Provides the ClientStream abstraction used by ddp-client",
  documentation: "README.md"
});

Npm.depends({
  "faye-websocket": "0.11.1",
  "permessage-deflate": "0.1.6"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("retry"); // TODO Try to remove this.
  api.mainModule("browser.js", "client", { lazy: true });
  api.mainModule("node.js", "server", { lazy: true });
});

Package.onTest(function(api) {
  api.use("underscore");
  api.use("ecmascript");
  api.use("tinytest");
  api.use("test-helpers");
  api.use("tracker");
  api.use("http");
  api.use("socket-stream-client");
  api.mainModule("client-tests.js", "client");
  api.mainModule("server-tests.js", "server");
});
