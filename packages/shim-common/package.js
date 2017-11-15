Package.describe({
  name: "shim-common",
  version: "0.1.0",
  summary: "Shared utilities for packages like sockjs-shim and es5-shim",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.mainModule("server.js", "server");
});
