Package.describe({
  name: "modules",
  version: "0.5.0-modules.6",
  summary: "CommonJS module system",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.export("meteorInstall");
});
