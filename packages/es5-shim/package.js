Package.describe({
  name: "es5-shim",
  version: "4.7.3",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md"
});

Npm.depends({
  "es5-shim": "4.5.10"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("server-render");
  api.use("shim-common");

  api.addFiles("console.js", "client");
  api.mainModule("cordova.js", "web.cordova");
  api.mainModule("server.js", "server");

  api.addAssets([
    "es5-shim-sham.js",
    "es5-shim-sham.min.js",
  ], "client");
});
