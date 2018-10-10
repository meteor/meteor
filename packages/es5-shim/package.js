Package.describe({
  name: "es5-shim",
  version: "4.8.0-beta162.14",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md"
});

Npm.depends({
  "es5-shim": "4.5.10"
});

Package.onUse(function(api) {
  api.use("modules");
  api.mainModule("client.js", "legacy");
});
