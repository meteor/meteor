Package.describe({
  name: "modules",
  version: "0.4.0_1",
  summary: "CommonJS module system",
  git: "https://github.com/benjamn/install",
  documentation: "README.md"
});

Npm.depends({
  install: "0.4.0"
});

Package.onUse(function(api) {
  api.use("meteor", {
    unordered: true
  });

  api.addFiles(".npm/package/node_modules/install/install.js", [
    "client",
    "server"
  ], {
    bare: true
  });

  api.addFiles("modules.js");
  api.export("meteorInstall");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("modules");
  api.addFiles("modules-tests.js");
});
