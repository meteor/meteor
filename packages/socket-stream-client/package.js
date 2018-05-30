Package.describe({
  name: "socket-stream-client",
  version: "0.2.1",
  summary: "Provides the ClientStream abstraction used by ddp-client",
  documentation: "README.md"
});

Npm.depends({
  "faye-websocket": "0.11.1",
  "permessage-deflate": "0.1.6"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("modern-browsers");
  api.use("retry"); // TODO Try to remove this.
  api.use("dynamic-import");

  api.addFiles("sockjs-0.3.4.js", "legacy");
  api.mainModule("browser.js", "client", { lazy: true });

  api.addFiles("server.js", "server");
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
