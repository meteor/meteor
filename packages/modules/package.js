Package.describe({
  name: "modules",
  version: "0.5.0-modules.8",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  buffer: "4.4.0"
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.export("meteorInstall");
});
