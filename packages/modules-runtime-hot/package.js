Package.describe({
  name: "modules-runtime-hot",
  version: "0.13.0",
  summary: "Patches modules-runtime to support Hot Module Replacement",
  git: "https://github.com/benjamn/install",
  documentation: "README.md"
});

Package.onUse(function (api) {
  api.addFiles("installer.js", [
    "client",
  ], {
    bare: true
  });

  api.addFiles("modern.js", "modern");
  api.export("meteorInstall", "client");
});

Package.onTest(function (api) {
  api.use("tinytest");
  api.use("modules"); // Test modules-runtime via modules.
});
