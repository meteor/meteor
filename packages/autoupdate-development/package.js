Package.describe({
  name: "autoupdate-development",
  summary: "Development-only autoupdate for clients",
  version: "1.0.0",
  debugOnly: true
});

Package.onUse((api) => {
  api.use([
    "ecmascript",
    "random",
    "webapp"
  ]);

  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});
