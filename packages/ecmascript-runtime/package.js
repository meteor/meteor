Package.describe({
  name: "ecmascript-runtime",
  version: '0.8.3',
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/ecmascript-runtime",
  documentation: "README.md"
});

Npm.depends({
  '@babel/runtime': '7.20.7'
});

Package.onUse(function(api) {
  api.imply("ecmascript-runtime-client");
  api.imply("ecmascript-runtime-server", "server");
});

Package.onTest(function(api) {
  api.use("tinytest");
  api.use("check");
  api.use("ecmascript");
  api.use("es5-shim");
  api.addFiles("runtime-tests.js");
});
