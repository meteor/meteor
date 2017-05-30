Package.describe({
  name: "ecmascript-runtime",
  version: "0.4.1",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/ecmascript-runtime",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.imply("ecmascript-runtime-client", "client");
  api.imply("ecmascript-runtime-server", "server");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("check");
  api.use("es5-shim");
  api.use("ecmascript-runtime");
  api.addFiles("runtime-tests.js");
});
