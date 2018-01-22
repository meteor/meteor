Package.describe({
  name: "es5-shim",
  version: "4.7.1",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("modules");
  api.use("server-render");
  api.use("shim-common");

  // Since Cordova renders boilerplate HTML at build time, and doesn't use
  // the server-render system through the webapp package, it's important
  // that we include es5-shim (and sham) statically for Cordova clients.
  api.addFiles("es5-shim-sham.js", "web.cordova");

  api.mainModule("console.js", "client");
  api.mainModule("server.js", "server");
  api.addAssets([
    "es5-shim-sham.js",
    "es5-shim-sham.min.js",
  ], "client");
});
