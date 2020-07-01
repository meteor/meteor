Package.describe({
  name: "modules-runtime-hot",
  version: "0.12.0",
  summary: "Patches modules-runtime to support Hot Module Reload",
  git: "https://github.com/benjamn/install",
  documentation: "README.md"
});

Package.onUse(function (api) {
  api.addFiles("installer.js", [
    "client",
    // "server"
  ], {
    bare: true
  });

  api.addFiles("modern.js", "modern");
  // api.addFiles("legacy.js", "legacy");
  // api.addFiles("server.js", "server");
  // api.addFiles("profile.js");

  api.export("meteorInstall", "client");
});

Package.onTest(function (api) {
  api.use("tinytest");
  api.use("modules"); // Test modules-runtime via modules.
});
