Package.describe({
  name: "ecmascript-runtime-client",
  version: "0.6.1",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/meteor/tree/devel/packages/ecmascript-runtime-client",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("modules", "client");
  api.use("promise", "client");
  api.mainModule("runtime.js", "client");
  api.export("Symbol", "client");
  api.export("Map", "client");
  api.export("Set", "client");
});
