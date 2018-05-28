Package.describe({
  name: "modules",
  version: "0.12.0",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  reify: "0.16.2"
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");
});
