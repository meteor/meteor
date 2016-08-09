Package.describe({
  name: "es5-shim",
  version: "4.6.13",
  summary: "Shims and polyfills to improve ECMAScript 5 support",
  documentation: "README.md",
  git: 'https://github.com/meteor/meteor/tree/master/packages/es5-shim'
});

Npm.depends({
  "es5-shim": "4.5.7"
});

Package.onUse(function(api) {
  api.use("modules");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});
