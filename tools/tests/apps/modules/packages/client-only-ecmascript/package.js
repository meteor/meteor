Package.describe({
  name: "client-only-ecmascript",
  version: "0.0.1",
  summary: "",
  documentation: null
});

Package.onUse(function(api) {
  api.use("ecmascript", "client");
  api.mainModule("client.js", "client");
  api.addFiles("server.js", "server");
  api.export("ServerTypeof", "server");
});
