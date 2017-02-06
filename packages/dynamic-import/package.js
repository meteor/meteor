Package.describe({
  name: "dynamic-import",
  version: "0.0.1",
  summary: "Support for module.dynamicImport(id).then(namespace => ...)",
  documentation: "README.md"
});

Package.onUse(function (api) {
  api.use("modules");
  api.use("localstorage");
  api.use("ecmascript", "server");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});
