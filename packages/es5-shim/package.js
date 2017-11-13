Package.describe({
  name: "es5-shim",
  version: "4.6.15",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md"
});

Npm.depends({
  "es5-shim": "4.5.9"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("server-render");
  api.mainModule("console.js", "client");
  api.mainModule("server.js", "server");
  api.addAssets([
    "es5-shim.js",
    "es5-shim.min.js",
    "es5-sham.js",
    "es5-sham.min.js",
  ], "client");
});
