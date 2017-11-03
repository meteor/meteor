Package.describe({
  name: "ecmascript-runtime-server",
  version: "0.5.0",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/meteor/tree/devel/packages/ecmascript-runtime-client",
  documentation: "README.md"
});

Npm.depends({
  "core-js": "2.4.1"
});

Package.onUse(function(api) {
  api.use("modules", "server");
  api.mainModule("runtime.js", "server");
});
