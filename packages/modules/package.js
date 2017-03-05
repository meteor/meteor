Package.describe({
  name: "modules",
  version: "0.8.0-beta.9",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  reify: "0.4.9"
});

Package.onUse(function(api) {
  api.use("underscore");
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");
  api.export("Buffer");
  api.export("process");
});
