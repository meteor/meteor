Package.describe({
  name: "modules",
  version: "0.15.0-alpha190.6",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  reify: "0.20.6"
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");
});
