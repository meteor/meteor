Package.describe({
  name: "zodern:modules-runtime-hot",
  version: "0.12.0",
  summary: "CommonJS module system with modifications to support HMR",
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
  api.addFiles("modules-runtime-tests.js");
});
