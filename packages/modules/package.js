Package.describe({
  name: "modules",
  version: "0.9.4",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  reify: "0.11.24"
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");
});
