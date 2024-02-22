Package.describe({
  name: "es5-shim",
  version: "4.8.1-beta300.2",
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
