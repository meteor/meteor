Package.describe({
  name: "modules",
  version: "0.6.1-rc.0",
  summary: "CommonJS module system",
  documentation: "README.md"
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
