Package.describe({
  name: "modules-runtime",
  version: "0.9.2",
  summary: "CommonJS module system",
  git: "https://github.com/benjamn/install",
  documentation: "README.md"
});

Npm.depends({
  install: "0.10.4"
});

Package.onUse(function(api) {
  api.addFiles(".npm/package/node_modules/install/install.js", [
    "client",
    "server"
  ], {
    bare: true
  });

  api.addFiles("options.js");
  api.addFiles("client.js", "client");
  api.addFiles("server.js", "server");

  api.export("meteorInstall");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("modules"); // Test modules-runtime via modules.
  api.addFiles("modules-runtime-tests.js");
});
